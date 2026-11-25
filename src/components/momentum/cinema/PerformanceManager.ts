/**
 * PerformanceManager: picks a starting quality tier from device hints, then keeps measuring
 * frame rate while the scene animates and steps down (never back up, to avoid flicker)
 * whenever a 2-second window averages below the floor.
 *
 * Fallback strategy:
 *   high   → DPR ≤ 2, 100% renderScale, high shadows, bloom, grain, edge aberration, glass refraction, full stars, dust
 *   medium → DPR ≤ 1.5, 90% renderScale, medium shadows, bloom, no grain, sheen glass, fewer stars, less dust
 *   low    → DPR 1, 80% renderScale, shadows off, no bloom, no grain, no dust, minimum stars (vignette stays)
 *   no WebGL → the component's text fallback (everything is also shown in the page panels)
 *   reduced motion → scene starts paused; no reveal, parallax, breathing or scroll movement
 */
import { CINEMA, initialTier, lowerTier, tierSettings, type QualityTier } from './cinemaConfig';

export class PerformanceManager {
  tier: QualityTier;
  private frames = 0;
  private time = 0;
  private readonly floor: number;
  private readonly onTierChange: (tier: QualityTier, settings: ReturnType<typeof tierSettings>) => void;

  constructor(
    device: { width: number; cores?: number; memoryGb?: number; reducedMotion?: boolean; saveData?: boolean },
    onTierChange: (tier: QualityTier, settings: ReturnType<typeof tierSettings>) => void
  ) {
    this.onTierChange = onTierChange;
    this.tier = initialTier(device);
    this.floor = device.width < 640 ? CINEMA.performance.floorFps.mobile : CINEMA.performance.floorFps.desktop;
  }

  static readDevice(width: number, reducedMotion: boolean) {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    return { width, cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory, reducedMotion, saveData: nav.connection?.saveData };
  }

  get settings() {
    return tierSettings(this.tier);
  }

  /** Call once per animated frame with the frame's delta (seconds). */
  sample(dt: number): void {
    if (this.tier === 'low' || dt <= 0) return;
    this.frames++;
    this.time += dt;
    if (this.time < CINEMA.performance.sampleSeconds) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps < this.floor) {
      this.tier = lowerTier(this.tier);
      this.onTierChange(this.tier, tierSettings(this.tier));
    }
  }

  /** Forget a partial window (after a pause, tab switch or scroll off-screen). */
  resetWindow(): void {
    this.frames = 0;
    this.time = 0;
  }
}
