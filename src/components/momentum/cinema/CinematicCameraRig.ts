/**
 * CinematicCameraRig: scroll-, pointer- and idle-driven camera movement.
 *
 * It never fights OrbitControls: the rig computes a temporary offset that is added to the
 * camera just before rendering and removed right after (`apply` / `restore`). Dragging,
 * focus transitions and the reset button keep working exactly as before.
 */
import type * as THREE_NS from 'three';
import { CINEMA, breathAt, introDollyAt, scrollCameraOffset, scrollProgress, settleFactor } from './cinemaConfig';

export class CinematicCameraRig {
  private readonly offset: THREE_NS.Vector3;
  private readonly dir: THREE_NS.Vector3;
  private readonly right: THREE_NS.Vector3;
  private readonly up: THREE_NS.Vector3;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private scroll = 0.5;
  private introStart: number | null;
  private readonly mount: HTMLElement;
  private readonly onScroll: () => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly opts: { motion: boolean; intro: boolean; onChange: () => void };

  constructor(THREE: typeof import('three'), mount: HTMLElement, opts: { motion: boolean; intro: boolean; onChange: () => void }) {
    this.opts = opts;
    this.offset = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.mount = mount;
    this.introStart = opts.motion && opts.intro ? -1 : null; // -1: start on the first frame
    this.onScroll = () => {
      const r = this.mount.getBoundingClientRect();
      this.scroll = scrollProgress(r.top, r.height, window.innerHeight);
      this.opts.onChange();
    };
    this.onPointerMove = (e) => {
      const r = this.mount.getBoundingClientRect();
      this.pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    this.onPointerLeave = () => {
      this.pointer.tx = 0;
      this.pointer.ty = 0;
    };
    window.addEventListener('scroll', this.onScroll, { passive: true });
    mount.addEventListener('pointermove', this.onPointerMove);
    mount.addEventListener('pointerleave', this.onPointerLeave);
    this.onScroll();
  }

  /** True while the opening reveal is still playing (the loop should keep rendering). */
  get revealing(): boolean {
    return this.introStart !== null;
  }

  /** Skip the reveal (e.g. the user starts dragging or picks something). */
  skipIntro(): void {
    this.introStart = null;
  }

  /**
   * Add this frame's cinematic offset to the camera. Call right before rendering, then `restore`.
   * `distance` is the current camera-to-target distance (dolly offsets scale with it).
   */
  apply(camera: THREE_NS.PerspectiveCamera, target: THREE_NS.Vector3, t: number, dt: number): void {
    this.offset.set(0, 0, 0);
    if (!this.opts.motion) return;
    const c = CINEMA.camera;
    this.dir.copy(camera.position).sub(target);
    const distance = this.dir.length() || 1;
    this.dir.divideScalar(distance);
    this.right.crossVectors(this.up, this.dir).normalize();

    // 1. Opening reveal: slow dolly-in.
    let dolly = 0;
    if (this.introStart !== null) {
      if (this.introStart < 0) this.introStart = t;
      const elapsed = t - this.introStart;
      dolly += introDollyAt(elapsed);
      if (elapsed >= c.introSeconds) this.introStart = null;
    }
    // 2. Scroll path.
    const s = scrollCameraOffset(this.scroll);
    dolly += s.dolly;
    this.offset.addScaledVector(this.dir, dolly * distance);
    this.offset.y += s.lift;
    // 3. Pointer micro-parallax (eased, frame-rate independent).
    const k = settleFactor(c.parallaxRate, dt);
    this.pointer.x += (this.pointer.tx - this.pointer.x) * k;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * k;
    this.offset.addScaledVector(this.right, this.pointer.x * c.parallax);
    this.offset.y -= this.pointer.y * c.parallax * 0.5;
    // 4. Idle breathing.
    const b = breathAt(t);
    this.offset.addScaledVector(this.right, b.x);
    this.offset.y += b.y;

    camera.position.add(this.offset);
    camera.lookAt(target);
  }

  restore(camera: THREE_NS.PerspectiveCamera, target: THREE_NS.Vector3): void {
    if (!this.offset.lengthSq()) return;
    camera.position.sub(this.offset);
    camera.lookAt(target);
  }

  dispose(): void {
    window.removeEventListener('scroll', this.onScroll);
    this.mount.removeEventListener('pointermove', this.onPointerMove);
    this.mount.removeEventListener('pointerleave', this.onPointerLeave);
  }
}
