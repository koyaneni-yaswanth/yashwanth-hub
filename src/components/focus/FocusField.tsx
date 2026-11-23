import React, { useEffect, useRef } from 'react';

interface FocusFieldProps {
  /** 0–1 share of the session done: particles gather closer to the ring as it rises. */
  progress: number;
  paused: boolean;
}

interface Particle {
  angle: number;
  /** Offset from the ring, in ring radii: negative never (keeps clear of the clock). */
  offset: number;
  speed: number;
  size: number;
  alpha: number;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * The focus field: a calm orbit of particles around the Deep Work timer.
 * At the start they drift loosely; as the session progresses they gather into a
 * tight, quiet band around the ring. Pausing loosens and slows them. Purely
 * decorative (aria-hidden) and drawn outside the ring so the clock stays clear.
 * With reduced motion it draws a still frame and only redraws as progress changes.
 */
export const FocusField: React.FC<FocusFieldProps> = ({ progress, paused }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ progress, paused });
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    stateRef.current = { progress, paused };
    if (reducedMotion()) drawRef.current();
  }, [progress, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = reducedMotion();
    const small = canvas.clientWidth < 360;
    const particles: Particle[] = Array.from({ length: small ? 70 : 110 }, () => ({
      angle: Math.random() * Math.PI * 2,
      offset: 0.04 + Math.pow(Math.random(), 1.6) * 0.36,
      speed: (0.05 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : -1) * 0.6 + 0.08,
      size: 0.8 + Math.random() * 1.6,
      alpha: 0.18 + Math.random() * 0.45,
    }));
    const paint = { color: '#4fc3b8' };
    const readColor = () => {
      paint.color = getComputedStyle(canvas).getPropertyValue('--hub-accent').trim() || paint.color;
    };
    readColor();
    const colorTimer = window.setInterval(readColor, 2000);

    const size = { w: 0, h: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.w = canvas.clientWidth;
      size.h = canvas.clientHeight;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw(0);
    });
    ro.observe(canvas);

    // Spread eases toward its target so changes feel calm, never abrupt.
    const anim = { spread: 1 };
    const draw = (dt: number) => {
      const { progress: p, paused: isPaused } = stateRef.current;
      const target = isPaused ? 1 : 1 - Math.min(1, Math.max(0, p)) * 0.8;
      anim.spread = reduced ? target : anim.spread + (target - anim.spread) * Math.min(1, dt * 0.8);
      const spread = anim.spread;
      const { w, h } = size;
      const cx = w / 2;
      const cy = h / 2;
      // The SVG ring is r=54 in a 120 viewBox, inside the inner box; this canvas is larger by its inset.
      const ring = Math.min(w, h) * 0.335;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = paint.color;
      for (const pt of particles) {
        if (!reduced && dt) pt.angle += pt.speed * (isPaused ? 0.25 : 1) * dt;
        const r = ring * (1.06 + pt.offset * spread);
        const x = cx + Math.cos(pt.angle) * r;
        // Slightly flattened vertically so the field never reaches the text above and below.
        const y = cy + Math.sin(pt.angle) * r * 0.9;
        ctx.globalAlpha = pt.alpha * (isPaused ? 0.55 : 0.75 + (1 - spread) * 0.35);
        ctx.beginPath();
        ctx.arc(x, y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    drawRef.current = () => draw(0);

    const frame = { raf: 0, last: performance.now() };
    const loop = (t: number) => {
      frame.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - frame.last) / 1000);
      frame.last = t;
      if (document.hidden) return;
      draw(dt);
    };
    if (reduced) draw(0);
    else frame.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame.raf);
      ro.disconnect();
      window.clearInterval(colorTimer);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute -inset-10 sm:-inset-14 w-[calc(100%+5rem)] h-[calc(100%+5rem)] sm:w-[calc(100%+7rem)] sm:h-[calc(100%+7rem)] pointer-events-none" aria-hidden="true" />;
};
