import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Maximize2, Minimize2, Play, RotateCcw } from 'lucide-react';
import { EXPERIMENT_APPS, type ExperimentAppMeta } from '../../lib/universeConfig';

interface StudioExperimentConsoleProps {
  onClose?: () => void;
  turbineWindMs?: number;
  onChangeTurbineWindMs?: (v: number) => void;
  piperPose?: { shoulderDeg: number; elbowDeg: number } | null;
  onChangePiperPose?: (pose: { shoulderDeg: number; elbowDeg: number } | null) => void;
}

const IK_ORIGIN_X_RATIO = 0.42;
const IK_ORIGIN_Y_RATIO = 0.72;
const IK_L1 = 96;
const IK_L2 = 82;

function analyticalCp(lam: number): number {
  return Math.max(0, 0.34 * Math.exp(-Math.pow((lam - 3.4) / 2.05, 2)) * (lam / 3.4 > 0 ? 1 : 0));
}

function solveTwoLinkIk(target: { x: number; y: number }, elbowUp: boolean) {
  const rawDist = Math.hypot(target.x, target.y);
  const clampedDist = Math.min(IK_L1 + IK_L2 - 4, Math.max(24, rawDist));
  const angleToGoal = Math.atan2(target.y, target.x);
  const cosQ2 = Math.min(1, Math.max(-1, (clampedDist * clampedDist - IK_L1 * IK_L1 - IK_L2 * IK_L2) / (2 * IK_L1 * IK_L2)));
  const q2 = (elbowUp ? -1 : 1) * Math.acos(cosQ2);
  const q1 = angleToGoal - Math.atan2(IK_L2 * Math.sin(q2), IK_L1 + IK_L2 * Math.cos(q2));
  return {
    q1,
    q2,
    j1Deg: Math.round((-q1 * 180) / Math.PI),
    j2Deg: Math.round((-q2 * 180) / Math.PI),
    reachPct: Math.round((clampedDist / (IK_L1 + IK_L2)) * 100),
  };
}

export const StudioExperimentConsole: React.FC<StudioExperimentConsoleProps> = ({
  onClose,
  turbineWindMs,
  onChangeTurbineWindMs,
  onChangePiperPose,
}) => {
  const [activeId, setActiveId] = useState<ExperimentAppMeta['id']>('tsr-envelope');
  const [fullscreen, setFullscreen] = useState(false);

  // App 1: Wind TSR state
  const [tsrTarget, setTsrTarget] = useState(3.2);
  // App 2: 2-Link Planar IK target (normalized pixels inside 560x250 canvas)
  const [ikTarget, setIkTarget] = useState<{ x: number; y: number }>({ x: 145, y: -70 });
  const [elbowUp, setElbowUp] = useState(false);
  // App 3: FMCW chirp bandwidth (MHz)
  const [chirpBandwidthMHz, setChirpBandwidthMHz] = useState(1800);
  const [targetRangeM, setTargetRangeM] = useState(4.5);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [csvExported, setCsvExported] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meta = EXPERIMENT_APPS.find((a) => a.id === activeId) || EXPERIMENT_APPS[0];

  const mappedWindMs = useMemo(
    () => Math.min(15, Math.max(3, Number((2.2 + tsrTarget * 1.75).toFixed(1)))),
    [tsrTarget]
  );
  const ikSolution = useMemo(() => solveTwoLinkIk(ikTarget, elbowUp), [ikTarget, elbowUp]);
  const mappedPiperPose = useMemo(
    () => ({
      shoulderDeg: Math.max(-55, Math.min(55, Math.round(ikSolution.j1Deg * 0.45))),
      elbowDeg: Math.max(-15, Math.min(85, Math.round(ikSolution.j2Deg * 0.7))),
    }),
    [ikSolution]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070A11';
    ctx.fillRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = 'rgba(139, 168, 200, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    if (activeId === 'tsr-envelope') {
      const padL = 48;
      const padB = 34;
      const plotW = W - padL - 24;
      const plotH = H - padB - 24;
      const maxTsr = 8;
      const maxCp = 0.65;

      const xForTsr = (lam: number) => padL + (lam / maxTsr) * plotW;
      const yForCp = (cp: number) => H - padB - (cp / maxCp) * plotH;

      // Betz ceiling line (16/27 = 0.5926)
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(59, 232, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(padL, yForCp(0.5926));
      ctx.lineTo(W - 24, yForCp(0.5926));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#3BE8FF';
      ctx.font = '11px monospace';
      ctx.fillText('Betz Limit Cp = 0.593', padL + 8, yForCp(0.5926) - 6);

      ctx.strokeStyle = '#C6A46B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const lam = (i / 120) * maxTsr;
        const px = xForTsr(lam);
        const py = yForCp(analyticalCp(lam));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Active operating point marker
      const curCp = analyticalCp(tsrTarget);
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(xForTsr(tsrTarget), yForCp(curCp), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F5F3EF';
      ctx.fillText(`λ = ${tsrTarget.toFixed(1)} · Model Cp ≈ ${curCp.toFixed(3)} · Eq Wind ≈ ${mappedWindMs.toFixed(1)} m/s`, padL + 8, H - 12);
    } else if (activeId === 'ik-2link') {
      const originX = W * IK_ORIGIN_X_RATIO;
      const originY = H * IK_ORIGIN_Y_RATIO;
      const j1X = originX + IK_L1 * Math.cos(ikSolution.q1);
      const j1Y = originY + IK_L1 * Math.sin(ikSolution.q1);
      const eeX = j1X + IK_L2 * Math.cos(ikSolution.q1 + ikSolution.q2);
      const eeY = j1Y + IK_L2 * Math.sin(ikSolution.q1 + ikSolution.q2);

      // Reachability envelope circle
      ctx.strokeStyle = 'rgba(139, 168, 200, 0.2)';
      ctx.beginPath();
      ctx.arc(originX, originY, IK_L1 + IK_L2, 0, Math.PI * 2);
      ctx.stroke();

      // Links
      ctx.strokeStyle = '#C6A46B';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(j1X, j1Y);
      ctx.lineTo(eeX, eeY);
      ctx.stroke();

      // Joints
      for (const pt of [
        { x: originX, y: originY, c: '#3BE8FF' },
        { x: j1X, y: j1Y, c: '#F5F3EF' },
        { x: eeX, y: eeY, c: '#10B981' },
      ]) {
        ctx.fillStyle = pt.c;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#E6F1FF';
      ctx.font = '11px monospace';
      ctx.fillText(
        `J1: ${ikSolution.j1Deg}° · J2: ${ikSolution.j2Deg}° · Reach ${ikSolution.reachPct}% (click canvas to target)`,
        14,
        22
      );
    } else {
      // FMCW Chirp beat waveform
      const deltaRes = 3e8 / (2 * chirpBandwidthMHz * 1e6);
      const cycles = 2 + targetRangeM * 1.4;
      ctx.strokeStyle = '#3BE8FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 24; x < W - 24; x++) {
        const t = (x - 24) / (W - 48);
        const y = H / 2 + Math.sin(t * Math.PI * 2 * cycles) * (H * 0.28) * Math.sin(t * Math.PI);
        if (x === 24) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#E6F1FF';
      ctx.font = '11px monospace';
      ctx.fillText(
        `BW = ${chirpBandwidthMHz} MHz · Range Res ΔR = ${(deltaRes * 100).toFixed(1)} cm · Sim Target = ${targetRangeM.toFixed(1)} m`,
        16,
        24
      );
    }
  }, [activeId, tsrTarget, mappedWindMs, ikSolution, chirpBandwidthMHz, targetRangeM]);

  const handleReset = () => {
    setTsrTarget(3.2);
    setIkTarget({ x: 145, y: -70 });
    setElbowUp(false);
    setChirpBandwidthMHz(1800);
    setTargetRangeM(4.5);
    setSyncMessage(null);
  };

  const handleExportCsv = () => {
    const header = '# Analytical engineering model snapshot - NOT field sensor hardware\n';
    let body = '';
    if (activeId === 'tsr-envelope') {
      body = 'tsr_lambda,analytical_cp,eq_wind_ms,betz_limit\n';
      for (let lam = 0.5; lam <= 7.51; lam += 0.5) {
        const w = Math.min(15, Math.max(3, 2.2 + lam * 1.75));
        body += `${lam.toFixed(1)},${analyticalCp(lam).toFixed(4)},${w.toFixed(1)},0.5926\n`;
      }
    } else if (activeId === 'ik-2link') {
      body = 'target_x,target_y,branch,solved_j1_deg,solved_j2_deg,reach_pct\n';
      body += `${Math.round(ikTarget.x)},${Math.round(ikTarget.y)},${elbowUp ? 'elbow-up' : 'elbow-down'},${ikSolution.j1Deg},${ikSolution.j2Deg},${ikSolution.reachPct}\n`;
    } else {
      const deltaResCm = (3e8 / (2 * chirpBandwidthMHz * 1e6)) * 100;
      const cycles = 2 + targetRangeM * 1.4;
      body = 'sample_t_norm,bw_mhz,range_res_cm,target_range_m,beat_amplitude\n';
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const amp = Math.sin(t * Math.PI * 2 * cycles) * Math.sin(t * Math.PI);
        body += `${t.toFixed(3)},${chirpBandwidthMHz},${deltaResCm.toFixed(2)},${targetRangeM.toFixed(1)},${amp.toFixed(5)}\n`;
      }
    }

    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yashwanth-${activeId}-snapshot.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setCsvExported(true);
    window.setTimeout(() => setCsvExported(false), 2000);
  };

  return (
    <div
      className={`space-y-3 ${fullscreen ? 'fixed inset-4 z-50 bg-[#080B12] border border-white/20 rounded-2xl p-5 shadow-2xl overflow-y-auto' : ''}`}
      data-testid="studio-experiment-console"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {EXPERIMENT_APPS.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => setActiveId(app.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                activeId === app.id
                  ? 'bg-[#C6A46B] text-[#050608] border-[#C6A46B]'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:border-white/30'
              }`}
            >
              {app.id === 'tsr-envelope' ? 'Wind TSR' : app.id === 'ik-2link' ? '2-Link IK' : '77 GHz Chirp'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportCsv}
            data-testid="sim-export-csv-btn"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 text-slate-200 hover:border-[#C6A46B] cursor-pointer"
          >
            {csvExported ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-[#C6A46B]" />}
            {csvExported ? 'Exported' : 'CSV'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 cursor-pointer"
            aria-label={fullscreen ? 'Exit fullscreen simulation' : 'Fullscreen simulation'}
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={() => {
                setFullscreen(false);
                onClose();
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-slate-300 hover:text-white cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-bold text-[#F5F3EF]">{meta.title}</h4>
        <p className="text-xs text-slate-400">{meta.subtitle}</p>
      </div>

      <div className="rounded-xl overflow-hidden border border-white/15 bg-[#070A11]">
        <canvas
          ref={canvasRef}
          width={560}
          height={250}
          onClick={(e) => {
            if (activeId !== 'ik-2link' || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * 560;
            const py = ((e.clientY - rect.top) / rect.height) * 250;
            setIkTarget({ x: px - 560 * 0.42, y: py - 250 * 0.72 });
          }}
          className="w-full h-auto block cursor-crosshair"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200 bg-white/5 border border-white/10 rounded-xl p-3">
        {activeId === 'tsr-envelope' && (
          <>
            <label className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span>Tip-Speed Ratio λ ({tsrTarget.toFixed(1)})</span>
              <input
                type="range"
                min={0.5}
                max={7.5}
                step={0.1}
                value={tsrTarget}
                onChange={(e) => setTsrTarget(Number(e.target.value))}
                className="flex-1 accent-[#C6A46B]"
              />
            </label>
            {onChangeTurbineWindMs && (
              <button
                type="button"
                data-testid="sim-drive-turbine-btn"
                onClick={() => {
                  onChangeTurbineWindMs(mappedWindMs);
                  setSyncMessage(
                    `3D PAWAN SHAKTI rotor driven at ${mappedWindMs.toFixed(1)} m/s${
                      turbineWindMs != null ? ` (was ${turbineWindMs.toFixed(1)} m/s)` : ''
                    }`
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/20 border border-emerald-400/50 text-emerald-200 font-semibold hover:bg-emerald-400/30 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                Drive 3D Rotor ({mappedWindMs.toFixed(1)} m/s)
              </button>
            )}
          </>
        )}

        {activeId === 'ik-2link' && (
          <>
            <button
              type="button"
              onClick={() => setElbowUp((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-[#C6A46B]/20 border border-[#C6A46B]/40 text-[#E9D7AE] font-semibold cursor-pointer"
            >
              Branch: {elbowUp ? 'Elbow-Up' : 'Elbow-Down'} (Toggle)
            </button>
            {onChangePiperPose && (
              <button
                type="button"
                data-testid="sim-drive-piper-btn"
                onClick={() => {
                  onChangePiperPose(mappedPiperPose);
                  setSyncMessage(
                    `3D PiPER posed to J2 ${mappedPiperPose.shoulderDeg}° / J3 ${mappedPiperPose.elbowDeg}°`
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#38BDF8]/20 border border-[#38BDF8]/50 text-[#BAE6FD] font-semibold hover:bg-[#38BDF8]/30 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                Apply Pose to 3D PiPER
              </button>
            )}
          </>
        )}

        {activeId === 'fmcw-chirp' && (
          <>
            <label className="flex items-center gap-2 flex-1 min-w-[180px]">
              <span>BW ({chirpBandwidthMHz} MHz)</span>
              <input
                type="range"
                min={500}
                max={4000}
                step={100}
                value={chirpBandwidthMHz}
                onChange={(e) => setChirpBandwidthMHz(Number(e.target.value))}
                className="flex-1 accent-[#3BE8FF]"
              />
            </label>
            <label className="flex items-center gap-2 flex-1 min-w-[180px]">
              <span>Target ({targetRangeM.toFixed(1)} m)</span>
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={targetRangeM}
                onChange={(e) => setTargetRangeM(Number(e.target.value))}
                className="flex-1 accent-[#3BE8FF]"
              />
            </label>
          </>
        )}
      </div>

      {syncMessage && (
        <div
          data-testid="sim-sync-status"
          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-xs font-mono text-emerald-200 flex items-center justify-between gap-2"
        >
          <span>{syncMessage}</span>
          {turbineWindMs != null && activeId === 'tsr-envelope' && (
            <span className="text-[11px] text-emerald-300/90">Bench: {turbineWindMs.toFixed(1)} m/s</span>
          )}
        </div>
      )}

      <p className="text-[11px] text-amber-300/90 font-mono">{meta.disclaimer}</p>
    </div>
  );
};
