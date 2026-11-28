import React, { useEffect, useRef, useState } from 'react';
import { Download, Eraser, Redo2, Save, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { db } from '../../db';
import { toast } from '../../lib/toast';

interface StudioWhiteboardPanelProps {
  onTextureUpdate?: (dataUrl: string) => void;
  onSendSketchToJarvis?: (dataUrl: string) => void;
}

const BOARD_STORAGE_KEY = 'universe_whiteboard_v1';
const BOARD_W = 1024;
const BOARD_H = 540;

const MARKERS = [
  { id: 'black', label: 'Black', color: '#14171C' },
  { id: 'red', label: 'Red', color: '#DC2626' },
  { id: 'green', label: 'Green', color: '#059669' },
  { id: 'blue', label: 'Blue', color: '#2563EB' },
  { id: 'gold', label: 'Gold', color: '#A88650' },
] as const;

export const StudioWhiteboardPanel: React.FC<StudioWhiteboardPanelProps> = ({
  onTextureUpdate,
  onSendSketchToJarvis,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);

  const [tool, setTool] = useState<'marker' | 'eraser'>('marker');
  const [color, setColor] = useState<string>(MARKERS[0].color);
  const [brushSize, setBrushSize] = useState<number>(4);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string>('');

  const syncHistoryFlags = () => {
    setCanUndo(historyRef.current.length > 1);
    setCanRedo(redoRef.current.length > 0);
  };

  const paintBackground = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#F7F5F0';
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    // Faint engineering dot grid
    ctx.fillStyle = 'rgba(20, 23, 28, 0.10)';
    for (let x = 24; x < BOARD_W; x += 28) {
      for (let y = 24; y < BOARD_H; y += 28) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  };

  const emitCanvasSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onTextureUpdate) return;
    try {
      onTextureUpdate(canvas.toDataURL('image/png'));
    } catch {
      /* ignore texture emit errors */
    }
  };

  const pushSnapshot = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const snap = ctx.getImageData(0, 0, BOARD_W, BOARD_H);
    historyRef.current = [...historyRef.current.slice(-24), snap];
    redoRef.current = [];
    syncHistoryFlags();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    paintBackground(ctx);
    const controller = new AbortController();

    const notifyTexture = () => {
      if (!onTextureUpdate) return;
      try {
        onTextureUpdate(canvas.toDataURL('image/png'));
      } catch {
        /* ignore */
      }
    };

    void db.settings
      .get(BOARD_STORAGE_KEY)
      .then((row) => {
        if (controller.signal.aborted) return;
        const dataUrl = typeof row?.value?.dataUrl === 'string' ? row.value.dataUrl : '';
        if (dataUrl) {
          const img = new Image();
          img.onload = () => {
            if (controller.signal.aborted) return;
            ctx.drawImage(img, 0, 0, BOARD_W, BOARD_H);
            historyRef.current = [ctx.getImageData(0, 0, BOARD_W, BOARD_H)];
            redoRef.current = [];
            syncHistoryFlags();
            notifyTexture();
          };
          img.src = dataUrl;
        } else {
          historyRef.current = [ctx.getImageData(0, 0, BOARD_W, BOARD_H)];
          syncHistoryFlags();
          notifyTexture();
        }
      })
      .catch(() => {
        historyRef.current = [ctx.getImageData(0, 0, BOARD_W, BOARD_H)];
        syncHistoryFlags();
      });

    return () => {
      controller.abort();
    };
  }, [onTextureUpdate]);

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * BOARD_W,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * BOARD_H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = toCanvasPoint(e);
    lastPtRef.current = pt;

    ctx.beginPath();
    ctx.fillStyle = tool === 'eraser' ? '#F7F5F0' : color;
    const radius = tool === 'eraser' ? brushSize * 2.2 : brushSize * 0.5;
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPtRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const nextPt = toCanvasPoint(e);

    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(nextPt.x, nextPt.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#F7F5F0' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 4.2 : brushSize;
    ctx.stroke();

    lastPtRef.current = nextPt;
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    pushSnapshot();
    emitCanvasSnapshot();
  };

  const handleUndo = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || historyRef.current.length <= 1) return;
    const current = historyRef.current[historyRef.current.length - 1];
    const previous = historyRef.current[historyRef.current.length - 2];
    historyRef.current = historyRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, current];
    ctx.putImageData(previous, 0, 0);
    syncHistoryFlags();
    emitCanvasSnapshot();
  };

  const handleRedo = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, next];
    ctx.putImageData(next, 0, 0);
    syncHistoryFlags();
    emitCanvasSnapshot();
  };

  const handleClear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    paintBackground(ctx);
    pushSnapshot();
    emitCanvasSnapshot();
    toast('Whiteboard cleared', 'info');
  };

  const handleSaveBoard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    await db.settings.put({
      key: BOARD_STORAGE_KEY,
      value: { dataUrl, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
    setSavedNotice('Saved locally');
    toast('Whiteboard sketch saved to workspace', 'success');
    emitCanvasSnapshot();
  };

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `yashwanth-studio-sketch-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleAskJarvisSketch = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSendSketchToJarvis) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSendSketchToJarvis(dataUrl);
  };

  const applyStencil = (kind: 'drivetrain' | 'ros2' | 'quadrant') => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.strokeStyle = '#14171C';
    ctx.fillStyle = '#14171C';
    ctx.lineWidth = 2.5;
    ctx.font = 'bold 18px sans-serif';

    if (kind === 'drivetrain') {
      const blocks = [
        { x: 60, label: 'Helical Rotor' },
        { x: 310, label: 'Planetary Gear' },
        { x: 560, label: 'PM Generator' },
        { x: 790, label: 'ESP32 / Load' },
      ];
      blocks.forEach((b, idx) => {
        ctx.strokeRect(b.x, 190, 170, 90);
        ctx.fillText(b.label, b.x + 14, 240);
        if (idx < blocks.length - 1) {
          ctx.beginPath();
          ctx.moveTo(b.x + 170, 235);
          ctx.lineTo(b.x + 245, 235);
          ctx.stroke();
        }
      });
    } else if (kind === 'ros2') {
      ctx.strokeRect(90, 90, 210, 80);
      ctx.fillText('/radar_awr2944', 110, 136);
      ctx.strokeRect(400, 200, 220, 80);
      ctx.fillText('/slam_planner', 428, 246);
      ctx.strokeRect(720, 320, 220, 80);
      ctx.fillText('/piper_can_ctrl', 740, 366);
      ctx.beginPath();
      ctx.moveTo(300, 130);
      ctx.lineTo(400, 240);
      ctx.moveTo(620, 240);
      ctx.lineTo(720, 360);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(BOARD_W / 2, 48);
      ctx.lineTo(BOARD_W / 2, BOARD_H - 48);
      ctx.moveTo(64, BOARD_H / 2);
      ctx.lineTo(BOARD_W - 64, BOARD_H / 2);
      ctx.stroke();
      ctx.fillStyle = '#A88650';
      ctx.fillText('HIGH IMPACT / NOW', 120, 95);
      ctx.fillText('STRATEGIC BETS', BOARD_W / 2 + 80, 95);
      ctx.fillText('QUICK WINS', 120, BOARD_H / 2 + 45);
      ctx.fillText('DELEGATE / DEFER', BOARD_W / 2 + 80, BOARD_H / 2 + 45);
    }

    pushSnapshot();
    emitCanvasSnapshot();
    toast('Applied schematic stencil to whiteboard', 'success');
  };

  return (
    <div className="space-y-3" data-testid="studio-whiteboard">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0D1119] border border-white/10 rounded-xl p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {MARKERS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setTool('marker');
                setColor(m.color);
              }}
              aria-label={`${m.label} marker`}
              aria-pressed={tool === 'marker' && color === m.color}
              className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${
                tool === 'marker' && color === m.color
                  ? 'border-[#C6A46B] scale-110 shadow-[0_0_10px_rgba(198,164,107,0.45)]'
                  : 'border-white/25 hover:scale-105'
              }`}
              style={{ backgroundColor: m.color }}
              title={`${m.label} marker`}
            />
          ))}

          <button
            type="button"
            onClick={() => setTool('eraser')}
            aria-pressed={tool === 'eraser'}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              tool === 'eraser'
                ? 'bg-[#C6A46B] text-[#050608] border-[#C6A46B]'
                : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            Eraser
          </button>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 ml-1">
            <span>Size</span>
            <input
              type="range"
              min={2}
              max={16}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              aria-label="Brush size"
              className="w-20 accent-[#C6A46B]"
            />
          </label>

          <div className="flex items-center gap-1 ml-1">
            {(
              [
                { id: 'drivetrain', label: 'Turbine' },
                { id: 'ros2', label: 'ROS2' },
                { id: 'quadrant', label: '2x2' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => applyStencil(st.id)}
                className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-[#E9D7AE] hover:border-[#C6A46B]/60 cursor-pointer"
                title={`Drop ${st.label} schematic template`}
              >
                +{st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
            aria-label="Undo sketch stroke"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
            aria-label="Redo sketch stroke"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
            aria-label="Clear whiteboard"
            title="Clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleSaveBoard()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 text-slate-100 hover:border-[#C6A46B]/60 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-[#C6A46B]" />
            Save
          </button>
          <button
            type="button"
            onClick={handleExportPng}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 text-slate-100 hover:border-[#8BA8C8]/60 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#8BA8C8]" />
            PNG
          </button>
          {onSendSketchToJarvis && (
            <button
              type="button"
              onClick={handleAskJarvisSketch}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#3BE8FF]/15 border border-[#3BE8FF]/40 text-[#3BE8FF] hover:bg-[#3BE8FF]/25 cursor-pointer"
              title="Only sends sketch to JARVIS when clicked explicitly"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Explain with JARVIS
            </button>
          )}
        </div>
      </div>

      {/* Interactive Canvas */}
      <div className="rounded-xl overflow-hidden border border-white/15 bg-[#F7F5F0] shadow-inner">
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="w-full h-auto block touch-none cursor-crosshair"
          aria-label="Interactive engineering whiteboard drawing surface"
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Supports mouse, stylus & touch. Your sketch syncs to the 3D studio board in real time.</span>
        {savedNotice && <span className="text-emerald-300 font-medium">{savedNotice}</span>}
      </div>
    </div>
  );
};
