"""Ollama & Hardware (GPU/VRAM/CPU/RAM) Infrastructure Manager for JARVIS 5.0."""

from __future__ import annotations

import subprocess
import time
from typing import Any, AsyncGenerator, Optional

import httpx
import psutil


def probe_hardware_telemetry() -> dict[str, Any]:
    mem = psutil.virtual_memory()
    cpu_pct = psutil.cpu_percent(interval=None)
    gpu_info: Optional[dict[str, Any]] = None
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2.0,
        ).strip()
        if out:
            line = out.splitlines()[0]
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5:
                gpu_info = {
                    "name": parts[0],
                    "vram_total_mib": int(float(parts[1])),
                    "vram_free_mib": int(float(parts[2])),
                    "vram_used_mib": int(float(parts[3])),
                    "utilization_pct": int(float(parts[4])),
                }
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        gpu_info = None

    free_vram = gpu_info["vram_free_mib"] if gpu_info else 0
    total_vram = gpu_info["vram_total_mib"] if gpu_info else 0
    recommended_models = recommend_quantized_models(total_vram, free_vram, round(mem.available / (1024**3), 1))

    return {
        "cpu_percent": cpu_pct,
        "cpu_cores": psutil.cpu_count(logical=True) or 4,
        "ram_total_gb": round(mem.total / (1024**3), 2),
        "ram_available_gb": round(mem.available / (1024**3), 2),
        "ram_percent": mem.percent,
        "gpu": gpu_info,
        "recommended_models": recommended_models,
        "execution_mode": "gpu_offload" if free_vram >= 2048 else "cpu_fallback",
    }


def recommend_quantized_models(total_vram_mib: int, free_vram_mib: int, free_ram_gb: float) -> list[dict[str, Any]]:
    candidates = [
        {
            "model": "llama3.2:3b",
            "use_case": "FAST & Everyday Chat (~2.0 GB VRAM)",
            "min_vram_mib": 2200,
            "quantization": "Q4_K_M",
        },
        {
            "model": "qwen2.5-coder:7b-instruct-q4_K_M",
            "use_case": "CODING & Technical Architecture (~4.7 GB VRAM)",
            "min_vram_mib": 5000,
            "quantization": "Q4_K_M",
        },
        {
            "model": "qwen2.5:7b-instruct-q4_K_M",
            "use_case": "REASONING & Synthesis (~4.7 GB VRAM)",
            "min_vram_mib": 5000,
            "quantization": "Q4_K_M",
        },
        {
            "model": "nomic-embed-text",
            "use_case": "Local Vector Embeddings (~0.3 GB)",
            "min_vram_mib": 400,
            "quantization": "F16",
        },
    ]
    out = []
    for c in candidates:
        fits_vram = total_vram_mib >= c["min_vram_mib"]
        fits_free = free_vram_mib >= c["min_vram_mib"]
        out.append(
            {
                **c,
                "fits_gpu": fits_vram,
                "fits_current_free_vram": fits_free,
                "fallback": "gpu" if fits_free else ("partial_cpu_offload" if fits_vram or free_ram_gb >= 6.0 else "insufficient_memory"),
                "install_cmd": f"ollama pull {c['model']}",
            }
        )
    return out


class OllamaManager:
    def __init__(self, base_url: str = "http://127.0.0.1:11434") -> None:
        self.base_url = base_url.rstrip("/")

    async def status(self) -> dict[str, Any]:
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=3.5) as client:
                tags_resp = await client.get(f"{self.base_url}/api/tags")
                ps_resp = await client.get(f"{self.base_url}/api/ps")
                latency_ms = round((time.perf_counter() - t0) * 1000, 1)
                if tags_resp.status_code != 200:
                    return {
                        "reachable": False,
                        "status": "degraded",
                        "latency_ms": latency_ms,
                        "models": [],
                        "loaded_models": [],
                        "error": f"Ollama returned HTTP {tags_resp.status_code}",
                    }
                tags_data = tags_resp.json()
                ps_data = ps_resp.json() if ps_resp.status_code == 200 else {}
                models = [
                    {
                        "name": m.get("name"),
                        "size_mb": round((m.get("size") or 0) / (1024 * 1024), 1),
                        "parameter_size": (m.get("details") or {}).get("parameter_size"),
                        "quantization": (m.get("details") or {}).get("quantization_level"),
                    }
                    for m in tags_data.get("models", [])
                ]
                loaded = [
                    {
                        "name": m.get("name"),
                        "size_vram_mb": round((m.get("size_vram") or 0) / (1024 * 1024), 1),
                        "expires_at": m.get("expires_at"),
                    }
                    for m in ps_data.get("models", [])
                ]
                return {
                    "reachable": True,
                    "status": "connected",
                    "latency_ms": latency_ms,
                    "models": models,
                    "loaded_models": loaded,
                    "error": None,
                }
        except Exception as exc:  # noqa: BLE001
            return {
                "reachable": False,
                "status": "not_running",
                "latency_ms": None,
                "models": [],
                "loaded_models": [],
                "error": f"Ollama unreachable at {self.base_url} ({exc.__class__.__name__}). Install/run `ollama serve`.",
            }

    async def load_model(self, model: str, keep_alive: str = "10m", unload_others: bool = True) -> dict[str, Any]:
        hw = probe_hardware_telemetry()
        # Prevent OOM on constrained 8GB GPUs by unloading previous resident models first
        if unload_others:
            cur = await self.status()
            for m in cur.get("loaded_models", []):
                if m.get("name") and m["name"] != model:
                    await self.unload_model(m["name"])

        t0 = time.perf_counter()
        num_gpu = -1 if hw["execution_mode"] == "gpu_offload" else 0
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/generate",
                json={"model": model, "prompt": "", "keep_alive": keep_alive, "options": {"num_gpu": num_gpu}},
            )
            if resp.status_code != 200:
                return {"ok": False, "model": model, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
            return {
                "ok": True,
                "model": model,
                "execution_mode": hw["execution_mode"],
                "load_ms": round((time.perf_counter() - t0) * 1000, 1),
            }

    async def unload_model(self, model: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/generate",
                json={"model": model, "prompt": "", "keep_alive": 0},
            )
            return {"ok": resp.status_code == 200, "model": model}

    async def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        num_ctx: int = 4096,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        hw = probe_hardware_telemetry()
        num_gpu = -1 if hw["execution_mode"] == "gpu_offload" else 0
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {"num_ctx": num_ctx, "num_predict": max_tokens, "num_gpu": num_gpu},
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"Ollama error {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            eval_count = int(data.get("eval_count") or 0)
            eval_ns = int(data.get("eval_duration") or 1)
            tok_per_sec = round(eval_count / (eval_ns / 1e9), 1) if eval_count and eval_ns > 0 else None
            return {
                "text": (data.get("message") or {}).get("content", ""),
                "model": model,
                "latency_ms": latency_ms,
                "tokens_input": int(data.get("prompt_eval_count") or 0),
                "tokens_output": eval_count,
                "tokens_per_sec": tok_per_sec,
                "execution_mode": hw["execution_mode"],
            }

    async def stream_chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        num_ctx: int = 4096,
    ) -> AsyncGenerator[dict[str, Any], None]:
        import json

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={"model": model, "messages": messages, "stream": True, "options": {"num_ctx": num_ctx}},
            ) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama HTTP {resp.status_code}")
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    yield chunk
