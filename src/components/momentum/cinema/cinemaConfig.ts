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
    exposure: 1.04,
    /** Device pixel ratio cap per quality tier (never above 2). */
    pixelRatio: { high: 2, medium: 1.5, low: 1 },
    /** Dynamic internal composer resolution scale per quality tier. */
    renderScale: { high: 1, medium: 0.9, low: 0.8 },
  },
  lighting: {
    key: { color: 0xffe2b8, intensity: 1.75, position: [11, 9, 10] as const }, // warm, upper right front
    rim: { color: 0x9db8d8, intensity: 2.15, position: [-13, 7, -15] as const }, // cool, behind left
    fill: { sky: 0x2a3445, ground: 0x0a0c10, intensity: 0.34 }, // hemispheric, not uniform ambient
    core: { color: 0xe6c48a, intensity: 48, decay: 1.6 }, // practical light inside the core
    environmentIntensity: 0.34,
    shadowQuality: { high: 'high', medium: 'medium', low: 'off' } as const,
  },
  atmosphere: {
    fogDensity: 0.0115,
    nebulaOpacity: 0.2,
    dust: { high: 260, medium: 140, low: 0 }, // midground motes that sell depth
    stars: { far: { high: 1400, medium: 900, low: 500 }, near: { high: 320, medium: 200, low: 120 } },
  },
  post: {
    bloom: { strength: 0.22, radius: 0.36, threshold: 0.64 },
    vignette: 0.20, // 0 = off; darkens the corners only
    grain: 0.022, // 0 = off; very low
    chromaticAberration: 0.0011, // edge-only spectral fringe at corners
  },
  camera: {
    fov: 40,
    /** First-open reveal: start this much further out (fraction of the framing distance)… */
    introDolly: 0.34,
    /** …and glide in over this many seconds (easeInOutCubic). */
    introSeconds: 1.85,
    /** Focus transitions: exponential settle rate (1/s). 3.1 settles ~95% in ~0.97 s. */
    focusRate: 3.1,
    /** Scroll path: dolly (fraction of distance) and lift (world units) across the panel's scroll range. */
    scrollDolly: 0.08,
    scrollLift: 1.6,
    /** Pointer micro-parallax (world units at the camera). */
    parallax: 0.55,
    parallaxRate: 3.2,
    /** Idle breathing: amplitude (world units) and period (seconds). */
    breath: 0.11,
    breathPeriod: 9.5,
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

export type ShadowQuality = 'high' | 'medium' | 'off';

export const CINEMA_SPRING = {
  stiffness: 28,
  dampingRatio: 1,
} as const;

export const SCROLL_CAMERA_STAGES = [
  { id: 'hero', start: 0, end: 0.25, dolly: [0.06, 0.02], lift: [-0.55, -0.22], yaw: [-0.05, 0] },
  { id: 'survey', start: 0.25, end: 0.55, dolly: [0.02, -0.02], lift: [-0.22, 0.12], yaw: [0, 0.05] },
  { id: 'detail', start: 0.55, end: 0.85, dolly: [-0.02, -0.10], lift: [0.12, 0.72], yaw: [0.05, 0.08] },
  { id: 'cta', start: 0.85, end: 1, dolly: [-0.10, -0.14], lift: [0.72, 1.15], yaw: [0.08, 0.03] },
] as const;

/**
 * Critically-damped spring integrator (substepped for frame-rate independence).
 * Converges smoothly without overshoot when dampingRatio >= 1.
 */
export function criticallyDampedStep(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  dt: number,
  dampingRatio = 1,
): [number, number] {
  const clampedDt = Math.max(0, Math.min(0.1, dt));
  if (clampedDt === 0) return [value, velocity];
  const k = Math.max(0.01, stiffness);
  const c = 2 * dampingRatio * Math.sqrt(k);
  const steps = Math.max(1, Math.ceil(clampedDt / (1 / 120)));
  const h = clampedDt / steps;
  let v = value;
  let vel = velocity;
  for (let i = 0; i < steps; i++) {
    const accel = k * (target - v) - c * vel;
    vel += accel * h;
    v += vel * h;
  }
  return [v, vel];
}

/**
 * Maps normalized page scroll [0, 1] onto the four-act camera choreography:
 * Hero reveal -> Midground orbital survey -> Detail close-up -> Confident ending rest.
 */
export function sectionCameraTimeline(progress: number): {
  stage: 'hero' | 'survey' | 'detail' | 'cta';
  dolly: number;
  lift: number;
  orbitYaw: number;
} {
  const p = Math.max(0, Math.min(1, progress));
  const seg =
    SCROLL_CAMERA_STAGES.find((s) => p <= s.end) ??
    SCROLL_CAMERA_STAGES[SCROLL_CAMERA_STAGES.length - 1];
  const span = Math.max(0.0001, seg.end - seg.start);
  const local = easeInOutCubic((p - seg.start) / span);
  return {
    stage: seg.id,
    dolly: seg.dolly[0] + (seg.dolly[1] - seg.dolly[0]) * local,
    lift: seg.lift[0] + (seg.lift[1] - seg.lift[0]) * local,
    orbitYaw: seg.yaw[0] + (seg.yaw[1] - seg.yaw[0]) * local,
  };
}

/** What each tier turns on. One table so the fallback strategy is explicit. */
export function tierSettings(t: QualityTier) {
  return {
    pixelRatioCap: CINEMA.renderer.pixelRatio[t],
    renderScale: CINEMA.renderer.renderScale[t],
    shadowQuality: CINEMA.lighting.shadowQuality[t] as ShadowQuality,
    bloom: t !== 'low',
    grain: t === 'high',
    chromaticAberration: t === 'high',
    vignette: true,
    glassTransmission: t === 'high', // transmission costs an extra scene render
    dust: CINEMA.atmosphere.dust[t],
    starsFar: CINEMA.atmosphere.stars.far[t],
    starsNear: CINEMA.atmosphere.stars.near[t],
  };
}
