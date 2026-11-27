"""JARVIS 5.0 Local Autonomous Runtime — FastAPI + WebSocket + SQLite + Ollama."""

from __future__ import annotations

import asyncio
import json
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .config import LocalAgentSettings, get_settings
from .db import LocalStateStore
from .ollama_manager import OllamaManager, probe_hardware_telemetry
from .tools import classify_local_tool_tier, execute_local_tool

AGENTS_CATALOG = [
    {"id": "executive", "name": "Executive Agent", "preference": "balanced", "tools": ["repo_status", "read_file"]},
    {"id": "coding", "name": "Coding Agent", "preference": "local_first", "tools": ["read_file", "search_dir", "repo_status", "run_diagnostic", "write_doc"]},
    {"id": "research", "name": "Research Agent", "preference": "cloud_preferred", "tools": ["read_file", "search_dir", "write_doc"]},
    {"id": "robotics", "name": "Robotics Agent", "preference": "local_first", "tools": ["read_file", "search_dir", "run_diagnostic"]},
    {"id": "startup", "name": "Startup Agent", "preference": "balanced", "tools": ["read_file", "write_doc"]},
    {"id": "productivity", "name": "Productivity Agent", "preference": "local_first", "tools": ["read_file", "repo_status"]},
    {"id": "monitoring", "name": "Monitoring Agent", "preference": "local_first", "tools": ["repo_status", "run_diagnostic"]},
    {"id": "knowledge", "name": "Knowledge Agent", "preference": "balanced", "tools": ["read_file", "search_dir", "write_doc"]},
]


class TaskRequest(BaseModel):
    agent_id: str = Field(default="coding", max_length=64)
    task_type: str = Field(default="tool_run", max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    correlation_id: Optional[str] = Field(default=None, max_length=64)


class ToolExecuteRequest(BaseModel):
    tool_name: str = Field(..., min_length=1, max_length=64)
    args: dict[str, Any] = Field(default_factory=dict)
    approved_by_human: bool = False


class ApprovalDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject)$")


class ChatRequest(BaseModel):
    model: Optional[str] = None
    messages: list[dict[str, str]] = Field(default_factory=list)
    stream: bool = False
    num_ctx: int = Field(default=4096, ge=512, le=32768)
    max_tokens: int = Field(default=1024, ge=32, le=8192)


class ModelLoadRequest(BaseModel):
    model: str = Field(..., min_length=1, max_length=128)
    keep_alive: str = Field(default="10m", max_length=24)
    unload_others: bool = True


class WsConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, event: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        payload = json.dumps(event)
        for ws in list(self.active):
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


def create_app(custom_settings: Optional[LocalAgentSettings] = None) -> FastAPI:
    settings = custom_settings or get_settings()
    store = LocalStateStore(settings.db_path)
    ollama = OllamaManager(settings.ollama_base_url)
    ws_hub = WsConnectionManager()

    runtime_state = {
        "started_at": time.time(),
        "paused": False,
        "shutting_down": False,
    }
    sem = asyncio.Semaphore(settings.max_concurrency)
    worker_task: Optional[asyncio.Task[None]] = None

    async def emit_event(
        event_type: str,
        message: str,
        level: str = "info",
        request_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        ev = store.record_event(event_type, message, level=level, request_id=request_id, metadata=metadata)
        await ws_hub.broadcast(ev)
        return ev

    async def run_queued_task(task: dict[str, Any]) -> None:
        async with sem:
            tid = task["id"]
            try:
                async def _exec() -> dict[str, Any]:
                    ttype = task["task_type"]
                    payload = task["payload"]
                    if ttype == "tool_run":
                        tool = str(payload.get("tool_name", "repo_status"))
                        tier = classify_local_tool_tier(tool)
                        if tier > 1:
                            raise PermissionError(f"Tool '{tool}' requires explicit human approval queue.")
                        return await asyncio.to_thread(execute_local_tool, tool, payload.get("args", {}), settings)
                    if ttype == "ollama_chat":
                        model = str(payload.get("model") or "llama3.2:3b")
                        msgs = payload.get("messages") or [{"role": "user", "content": str(payload.get("prompt", ""))}]
                        return await ollama.chat(model=model, messages=msgs)
                    raise ValueError(f"Unknown task_type: {ttype}")

                res = await asyncio.wait_for(_exec(), timeout=float(settings.task_timeout_sec))
                store.complete_task(tid, res)
                await emit_event("task_completed", f"Task {tid} completed", request_id=task.get("correlation_id"))
            except Exception as exc:  # noqa: BLE001
                updated = store.fail_or_requeue_task(tid, str(exc))
                state_str = updated["status"] if updated else "failed"
                await emit_event(
                    "task_failed" if state_str == "dead_letter" else "task_retry",
                    f"Task {tid} -> {state_str}: {exc}",
                    level="error" if state_str == "dead_letter" else "warn",
                    request_id=task.get("correlation_id"),
                )

    async def worker_loop() -> None:
        while not runtime_state["shutting_down"]:
            if not runtime_state["paused"]:
                next_task = store.claim_next_queued_task()
                if next_task:
                    asyncio.create_task(run_queued_task(next_task))
                    continue
            await asyncio.sleep(0.25)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        nonlocal worker_task
        worker_task = asyncio.create_task(worker_loop())
        store.record_event("runtime_started", f"JARVIS Local Runtime listening on {settings.host}:{settings.port}")
        try:
            yield
        finally:
            runtime_state["shutting_down"] = True
            if worker_task:
                worker_task.cancel()
                try:
                    await worker_task
                except asyncio.CancelledError:
                    pass
            store.record_event("runtime_stopped", "JARVIS Local Runtime cleanly shut down")

    app = FastAPI(title="JARVIS 5.0 Local Agent Runtime", version="5.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    )

    @app.middleware("http")
    async def origin_and_request_id_middleware(request: Request, call_next):
        req_id = request.headers.get("x-request-id") or f"loc_{uuid.uuid4().hex[:10]}"
        origin = request.headers.get("origin")
        if origin and origin not in settings.allowed_origins:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"error": "Origin not allowlisted for local JARVIS agent", "origin": origin},
            )
        response = await call_next(request)
        response.headers["X-Request-Id"] = req_id
        return response

    def require_auth(authorization: Optional[str] = Header(default=None)) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Bearer local pairing token")
        supplied = authorization.removeprefix("Bearer ").strip()
        if not secrets.compare_digest(supplied, settings.auth_token):
            raise HTTPException(status_code=401, detail="Invalid local pairing token")
        return supplied

    @app.get("/health")
    async def health():
        ollama_state = await ollama.status()
        overall = "paused" if runtime_state["paused"] else ("ok" if ollama_state["reachable"] else "degraded")
        return {
            "status": overall,
            "service": "jarvis-local-runtime",
            "version": "5.0.0",
            "uptime_sec": round(time.time() - runtime_state["started_at"], 1),
            "paused": runtime_state["paused"],
            "private_offline_only": settings.private_offline_only,
            "ollama_reachable": ollama_state["reachable"],
            "ollama_status": ollama_state["status"],
        }

    @app.get("/status", dependencies=[Depends(require_auth)])
    async def full_status():
        hw = probe_hardware_telemetry()
        ol = await ollama.status()
        tasks = store.list_tasks(100)
        approvals = store.list_approvals(50)
        return {
            "service": "jarvis-local-runtime",
            "paused": runtime_state["paused"],
            "uptime_sec": round(time.time() - runtime_state["started_at"], 1),
            "allowed_dirs": [str(d) for d in settings.allowed_dirs],
            "private_offline_only": settings.private_offline_only,
            "hardware": hw,
            "ollama": ol,
            "queue": {
                "queued": sum(1 for t in tasks if t["status"] == "queued"),
                "running": sum(1 for t in tasks if t["status"] == "running"),
                "completed": sum(1 for t in tasks if t["status"] == "completed"),
                "dead_letter": sum(1 for t in tasks if t["status"] == "dead_letter"),
            },
            "pending_approvals": sum(1 for a in approvals if a["status"] == "pending"),
        }

    @app.get("/agents", dependencies=[Depends(require_auth)])
    async def list_agents():
        return {"agents": AGENTS_CATALOG}

    @app.get("/models", dependencies=[Depends(require_auth)])
    async def list_models():
        ol = await ollama.status()
        hw = probe_hardware_telemetry()
        return {"ollama": ol, "hardware": hw}

    @app.post("/models/load", dependencies=[Depends(require_auth)])
    async def load_model(req: ModelLoadRequest):
        res = await ollama.load_model(req.model, keep_alive=req.keep_alive, unload_others=req.unload_others)
        if not res.get("ok"):
            raise HTTPException(status_code=502, detail=res.get("error", "Failed loading Ollama model"))
        await emit_event("model_loaded", f"Loaded {req.model} ({res.get('execution_mode')})")
        return res

    @app.post("/models/unload", dependencies=[Depends(require_auth)])
    async def unload_model(req: ModelLoadRequest):
        res = await ollama.unload_model(req.model)
        await emit_event("model_unloaded", f"Unloaded {req.model}")
        return res

    @app.get("/tasks", dependencies=[Depends(require_auth)])
    async def get_tasks():
        return {"tasks": store.list_tasks(60)}

    @app.post("/tasks", dependencies=[Depends(require_auth)])
    async def create_task(req: TaskRequest):
        if req.task_type == "tool_run":
            tool_name = str(req.payload.get("tool_name", ""))
            tier = classify_local_tool_tier(tool_name)
            if tier == 3:
                raise HTTPException(status_code=403, detail=f"Tool '{tool_name}' is Tier 3 blocked.")
            if tier == 2:
                ap = store.create_approval(tool_name, req.payload.get("args", {}), "Tier 2 queued task requires approval")
                await emit_event("approval_requested", f"Queued approval {ap['id']} for {tool_name}", level="warn")
                return {"status": "pending_approval", "approval": ap}

        task = store.enqueue_task(req.agent_id, req.task_type, req.payload, correlation_id=req.correlation_id)
        await emit_event("task_enqueued", f"Enqueued {task['id']} ({task['task_type']})", request_id=req.correlation_id)
        return {"status": "queued", "task": task}

    @app.post("/tasks/retry-dead-letter", dependencies=[Depends(require_auth)])
    async def retry_dead_letters():
        count = store.retry_dead_letters()
        await emit_event("dead_letter_requeued", f"Requeued {count} dead-letter task(s)")
        return {"requeued": count}

    @app.post("/tools/execute", dependencies=[Depends(require_auth)])
    async def run_tool(req: ToolExecuteRequest):
        tier = classify_local_tool_tier(req.tool_name)
        if tier == 3:
            raise HTTPException(status_code=403, detail=f"Tier 3 tool '{req.tool_name}' is permanently restricted.")
        if tier == 2 and not req.approved_by_human:
            ap = store.create_approval(req.tool_name, req.args, f"Tier 2 local tool '{req.tool_name}' requires confirmation")
            await emit_event("approval_requested", f"Approval needed for {req.tool_name} ({ap['id']})", level="warn")
            return {"status": "pending_approval", "approval": ap}
        try:
            output = await asyncio.to_thread(execute_local_tool, req.tool_name, req.args, settings)
            await emit_event("tool_executed", f"Executed local tool {req.tool_name}")
            return {"status": "executed", "tool_name": req.tool_name, "output": output}
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/approvals", dependencies=[Depends(require_auth)])
    async def get_approvals():
        return {"approvals": store.list_approvals()}

    @app.post("/approvals/{approval_id}", dependencies=[Depends(require_auth)])
    async def decide_approval(approval_id: str, body: ApprovalDecisionRequest):
        ap = store.get_approval(approval_id)
        if not ap:
            raise HTTPException(status_code=404, detail="Approval record not found")
        if ap["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Approval already '{ap['status']}'")
        if body.decision == "reject":
            store.update_approval(approval_id, "rejected")
            await emit_event("approval_rejected", f"Rejected {ap['tool_name']} ({approval_id})")
            return {"status": "rejected", "id": approval_id}

        try:
            output = await asyncio.to_thread(execute_local_tool, ap["tool_name"], ap["args"], settings)
            store.update_approval(approval_id, "executed", output)
            await emit_event("approval_executed", f"Approved & executed {ap['tool_name']} ({approval_id})")
            return {"status": "executed", "id": approval_id, "output": output}
        except Exception as exc:  # noqa: BLE001
            store.update_approval(approval_id, "failed", {"error": str(exc)})
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/chat", dependencies=[Depends(require_auth)])
    async def local_chat(req: ChatRequest, request: Request):
        ol = await ollama.status()
        if not ol["reachable"]:
            raise HTTPException(status_code=503, detail=ol.get("error") or "Local Ollama is not running")
        chosen_model = req.model or (ol["models"][0]["name"] if ol["models"] else "llama3.2:3b")

        if req.stream:
            async def sse_gen():
                full_text = ""
                try:
                    async for ch in ollama.stream_chat(chosen_model, req.messages, num_ctx=req.num_ctx):
                        if await request.is_disconnected():
                            break
                        delta = (ch.get("message") or {}).get("content", "")
                        if delta:
                            full_text += delta
                            yield f"data: {json.dumps({'type': 'token', 'delta': delta})}\n\n"
                        if ch.get("done"):
                            yield f"data: {json.dumps({'type': 'done', 'provider': 'ollama', 'modelId': chosen_model, 'text': full_text})}\n\n"
                except Exception as exc:  # noqa: BLE001
                    yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

            return StreamingResponse(sse_gen(), media_type="text/event-stream")

        out = await ollama.chat(chosen_model, req.messages, num_ctx=req.num_ctx, max_tokens=req.max_tokens)
        await emit_event("local_chat", f"Ollama {chosen_model} responded in {out['latency_ms']}ms")
        return {"provider": "ollama", **out}

    @app.get("/events", dependencies=[Depends(require_auth)])
    async def list_events():
        return {"events": store.list_events(60)}

    @app.post("/control/pause", dependencies=[Depends(require_auth)])
    async def pause_runtime():
        runtime_state["paused"] = True
        await emit_event("runtime_paused", "Local agent background queue paused")
        return {"paused": True}

    @app.post("/control/resume", dependencies=[Depends(require_auth)])
    async def resume_runtime():
        runtime_state["paused"] = False
        await emit_event("runtime_resumed", "Local agent background queue resumed")
        return {"paused": False}

    @app.websocket("/events")
    async def events_ws(ws: WebSocket):
        token = ws.query_params.get("token", "")
        if not token:
            auth = ws.headers.get("authorization", "")
            if auth.startswith("Bearer "):
                token = auth.removeprefix("Bearer ").strip()
        if not token or not secrets.compare_digest(token, settings.auth_token):
            await ws.close(code=4401)
            return
        await ws_hub.connect(ws)
        try:
            await ws.send_text(json.dumps({"type": "connected", "event_type": "connected", "message": "Subscribed to JARVIS local events"}))
            while True:
                msg = await ws.receive_text()
                if msg == "ping":
                    await ws.send_text(json.dumps({"event_type": "pong"}))
        except WebSocketDisconnect:
            ws_hub.disconnect(ws)

    app.state.jarvis_store = store
    app.state.jarvis_settings = settings
    app.state.jarvis_ollama = ollama
    return app


def main() -> None:
    import uvicorn

    s = get_settings()
    print(f"[JARVIS Local] Token file: {s.token_path}")
    print(f"[JARVIS Local] Binding loopback http://{s.host}:{s.port} (allowed dirs: {[str(d) for d in s.allowed_dirs]})")
    uvicorn.run(create_app(s), host=s.host, port=s.port, log_level="info")


if __name__ == "__main__":
    main()
