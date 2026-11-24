/**
 * Cinematography config + pure motion maths for the Momentum constellation.
 *
 * Every tunable lives in CINEMA (one place to art-direct the scene). The
 * helpers below are pure (no three.js, no DOM) so they are unit-tested in
 * tests/v14_cinematography.test.mjs.
 *
 * Visual direction ("quiet observatory"):
 * - Mood: calm, premium, technical. Night black, warm gold light, cool steel rim.
 * - Hierarchy: the momentum core first, goal planets second, everything else (stars, memories) recedes.
 * - Light: one warm key, one cool rim, a low hemispheric fill, the core as a practical light. No flat ambient.
 * - Camera: slow dolly-in reveal on first open, scroll moves the camera a little along a short
 *   path, pointer gives micro-parallax, a slow "breath" when idle. Transitions settle in about 1.2 s.
 * - Post: ACES tone mapping, bloom only on genuinely bright emissives, a mild vignette, faint grain.
 */

export const CINEMA = {
  palette: {
    background: 0x050608,
    fog: 0x07090c,
    accent: '#c6a46b', // brand gold: core, energy, focus halo
    steel: '#8ba8c8', // brand steel: orbits, rim light, memories
    ivory: '#efe9df', // stars
    metal: 0xd9d3c7, // warm silver rings
  },
  renderer: {
    exposure: 1.0,
    /** Device pixel ratio cap per quality tier (never above 2). */
    pixelRatio: { high: 2, medium: 1.5, low: 1 },
  },
  lighting: {
    key: { color: 0xffe2b8, intensity: 1.7, position: [11, 9, 10] as const }, // warm, upper right front
    rim: { color: 0x9db8d8, intensity: 2.1, position: [-13, 7, -15] as const }, // cool, behind left
    fill: { sky: 0x2a3445, ground: 0x0a0c10, intensity: 0.32 }, // hemispheric, not uniform ambient
    core: { color: 0xe6c48a, intensity: 48, decay: 1.6 }, // practical light inside the core
    environmentIntensity: 0.3,
  },
  atmosphere: {
    fogDensity: 0.0105,
    nebulaOpacity: 0.2,
    dust: { high: 260, medium: 140, low: 0 }, // midground motes that sell depth
    stars: { far: { high: 1400, medium: 900, low: 500 }, near: { high: 320, medium: 200, low: 120 } },
  },
  post: {
    bloom: { strength: 0.42, radius: 0.48, threshold: 0.62 },
    vignette: 0.32, // 0 = off; darkens the corners only
    grain: 0.022, // 0 = off; very low
  },
  camera: {
    fov: 40,
    /** First-open reveal: start this much further out (fraction of the framing distance)… */
    introDolly: 0.38,
    /** …and glide in over this many seconds (easeInOutCubic). */
    introSeconds: 2.4,
    /** Focus transitions: exponential settle rate (1/s). 2.9 settles ~95% in about 1 s. */
    focusRate: 2.9,
    /** Scroll path: dolly (fraction of distance) and lift (world units) across the panel's scroll range. */
    scrollDolly: 0.08,
    scrollLift: 1.6,
    /** Pointer micro-parallax (world units at the camera). */
    parallax: 0.55,
    parallaxRate: 3.2,
    /** Idle breathing: amplitude (world units) and period (seconds). */
    breath: 0.12,
    breathPeriod: 9,
  },
  performance: {
    /** Average fps below this (over a 2 s window) drops one quality tier. */
    floorFps: { desktop: 48, mobile: 28 },
    sampleSeconds: 2,
  },
} as const;

export type QualityTier = 'high' | 'medium' | 'low';

/** Smooth start and stop; no linear camera motion anywhere. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Frame-rate independent exponential smoothing factor for a settle rate (1/s). */
export function settleFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

/** Seconds for exponential smoothing at `rate` to cover `fraction` of the distance. */
export function settleSeconds(rate: number, fraction = 0.95): number {
  return -Math.log(1 - fraction) / rate;
}

/**
 * How far a panel has travelled through the viewport: 0 when its top meets the
 * viewport bottom, 0.5 when centred, 1 when its bottom leaves the top.
 */
export function scrollProgress(rectTop: number, rectHeight: number, viewportHeight: number): number {
  const total = viewportHeight + rectHeight;
  if (total <= 0) return 0.5;
  return Math.min(1, Math.max(0, (viewportHeight - rectTop) / total));
}

/**
 * Camera timeline keyed to scroll progress. Returns a dolly fraction (positive = further away)
 * and a lift in world units. Centred panel = the authored "home" framing (0, 0).
 *   0.00 establishing: slightly further and lower (looking across the orbital plane)
 *   0.50 home: the composed hero framing
 *   1.00 overview: slightly closer and higher (looking down on the system as it leaves)
 */
export function scrollCameraOffset(progress: number, dolly = CINEMA.camera.scrollDolly, lift = CINEMA.camera.scrollLift) {
  const p = Math.min(1, Math.max(0, progress));
  const s = easeInOutCubic(p) * 2 - 1; // -1 … 1, eased at both ends
  return { dolly: -s * dolly, lift: s * lift };
}

/** Intro reveal: remaining dolly fraction at time t (seconds since the scene opened). */
export function introDollyAt(t: number, amount = CINEMA.camera.introDolly, seconds = CINEMA.camera.introSeconds): number {
  if (seconds <= 0) return 0;
  return amount * (1 - easeInOutCubic(t / seconds));
}

/** Slow idle breathing offset (world units). */
export function breathAt(t: number, amp = CINEMA.camera.breath, period = CINEMA.camera.breathPeriod) {
  const w = (Math.PI * 2) / period;
  return { x: Math.sin(t * w) * amp, y: Math.sin(t * w * 0.5 + 1.1) * amp * 0.6 };
}

/** Starting quality tier from device hints (refined later by measured fps). */
export function initialTier(d: { width: number; cores?: number; memoryGb?: number; reducedMotion?: boolean; saveData?: boolean }): QualityTier {
  const mobile = d.width < 640;
  if (d.saveData || (d.cores !== undefined && d.cores <= 2) || (d.memoryGb !== undefined && d.memoryGb <= 2)) return 'low';
  if (mobile || d.reducedMotion || (d.cores !== undefined && d.cores <= 4) || (d.memoryGb !== undefined && d.memoryGb <= 4)) return 'medium';
  return 'high';
}

export function lowerTier(t: QualityTier): QualityTier {
  return t === 'high' ? 'medium' : 'low';
}

/** What each tier turns on. One table so the fallback strategy is explicit. */
export function tierSettings(t: QualityTier) {
  return {
    pixelRatioCap: CINEMA.renderer.pixelRatio[t],
    bloom: t !== 'low',
    grain: t === 'high',
    vignette: true,
    glassTransmission: t === 'high', // transmission costs an extra scene render
    dust: CINEMA.atmosphere.dust[t],
    starsFar: CINEMA.atmosphere.stars.far[t],
    starsNear: CINEMA.atmosphere.stars.near[t],
  };
}
