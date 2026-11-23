import React, { useEffect, useRef } from 'react';
import { dayPartFor } from '../../lib/dayPart';

/** Seven gently curved streamlines across a 1600x900 field (the turbine's wind). */
const STREAMLINES = [
  'M-100 170 C 250 120, 520 230, 860 180 S 1420 120, 1720 190',
  'M-100 260 C 300 220, 600 320, 920 270 S 1450 210, 1720 280',
  'M-100 380 C 220 350, 560 430, 880 390 S 1380 330, 1720 400',
  'M-100 520 C 280 490, 640 570, 960 520 S 1460 470, 1720 540',
  'M-100 640 C 260 610, 580 690, 900 650 S 1400 600, 1720 660',
  'M-100 750 C 300 720, 620 800, 940 760 S 1440 710, 1720 770',
  'M-100 90 C 320 60, 640 140, 980 100 S 1480 50, 1720 110',
];

/**
 * Decorative app background: drifting aurora light, wind streamlines, a fading
 * dot grid and fine grain, tinted by the time of day. Purely visual: hidden
 * from assistive tech, never intercepts input, and still under reduced motion.
 */
export const AmbientBackground: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  // Time-of-day tint (dawn / day / dusk / night), refreshed every 10 minutes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      el.dataset.daypart = dayPartFor(new Date().getHours());
    };
    apply();
    const id = window.setInterval(apply, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Light pointer parallax on fine pointers only; one rAF per pointer move at most.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || still) return;
    const state = { frame: 0, x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      state.x = e.clientX / window.innerWidth - 0.5;
      state.y = e.clientY / window.innerHeight - 0.5;
      if (state.frame) return;
      state.frame = window.requestAnimationFrame(() => {
        state.frame = 0;
        el.style.setProperty('--amb-px', state.x.toFixed(3));
        el.style.setProperty('--amb-py', state.y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (state.frame) window.cancelAnimationFrame(state.frame);
    };
  }, []);

  return (
    <div ref={ref} className="hub-ambient" aria-hidden="true">
      <div className="hub-ambient__aurora">
        <span className="hub-ambient__blob hub-ambient__blob--a" />
        <span className="hub-ambient__blob hub-ambient__blob--b" />
        <span className="hub-ambient__blob hub-ambient__blob--c" />
      </div>
      <div className="hub-ambient__grid" />
      <svg className="hub-ambient__wind" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="hub-amb-wind" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--amb-wind)" stopOpacity="0" />
            <stop offset="0.35" stopColor="var(--amb-wind)" stopOpacity="1" />
            <stop offset="0.7" stopColor="var(--amb-wind)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--amb-wind)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {STREAMLINES.map((d, i) => (
          <path key={i} d={d} className="hub-ambient__stream" style={{ animationDelay: `${-i * 3.7}s`, animationDuration: `${26 + (i % 3) * 7}s` }} />
        ))}
      </svg>
      <div className="hub-ambient__grain" />
    </div>
  );
};
