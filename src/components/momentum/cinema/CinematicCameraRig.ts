/**
 * CinematicCameraRig: scroll-, pointer- and idle-driven camera movement.
 *
 * It never fights OrbitControls: the rig computes a temporary offset that is added to the
 * camera just before rendering and removed right after (`apply` / `restore`). Dragging,
 * focus transitions and the reset button keep working exactly as before.
 */
import type * as THREE_NS from 'three';
import {
  CINEMA,
  CINEMA_SPRING,
  breathAt,
  criticallyDampedStep,
  introDollyAt,
  scrollProgress,
  sectionCameraTimeline,
} from './cinemaConfig';

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight + 8) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

export class CinematicCameraRig {
  private readonly offset: THREE_NS.Vector3;
  private readonly dir: THREE_NS.Vector3;
  private readonly right: THREE_NS.Vector3;
  private readonly up: THREE_NS.Vector3;
  private pointer = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  private scroll = { u: 0.35, v: 0, target: 0.35 };
  private introStart: number | null;
  private readonly mount: HTMLElement;
  private readonly scrollContainer: HTMLElement | null;
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
    this.scrollContainer = findScrollContainer(mount);
    this.introStart = opts.motion && opts.intro ? -1 : null; // -1: start on the first frame
    this.onScroll = () => {
      if (this.scrollContainer && this.scrollContainer.scrollHeight > this.scrollContainer.clientHeight + 40) {
        const maxScroll = this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight;
        this.scroll.target = Math.max(0, Math.min(1, this.scrollContainer.scrollTop / maxScroll));
      } else {
        const r = this.mount.getBoundingClientRect();
        this.scroll.target = scrollProgress(r.top, r.height, window.innerHeight);
      }
      this.opts.onChange();
    };
    this.onPointerMove = (e) => {
      const r = this.mount.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return;
      this.pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      this.opts.onChange();
    };
    this.onPointerLeave = () => {
      this.pointer.tx = 0;
      this.pointer.ty = 0;
      this.opts.onChange();
    };
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.scrollContainer?.addEventListener('scroll', this.onScroll, { passive: true });
    mount.addEventListener('pointermove', this.onPointerMove);
    mount.addEventListener('pointerleave', this.onPointerLeave);
    this.onScroll();
    this.scroll.u = this.scroll.target;
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
    // 2. Critically-damped scroll path mapped to the 4-stage camera timeline.
    [this.scroll.u, this.scroll.v] = criticallyDampedStep(
      this.scroll.u,
      this.scroll.v,
      this.scroll.target,
      CINEMA_SPRING.stiffness,
      dt,
      CINEMA_SPRING.dampingRatio,
    );
    const s = sectionCameraTimeline(this.scroll.u);
    dolly += s.dolly;
    this.offset.addScaledVector(this.dir, dolly * distance);
    this.offset.addScaledVector(this.right, s.orbitYaw * distance * 0.45);
    this.offset.y += s.lift;
    // 3. Pointer micro-parallax (critically-damped spring, never jitters on fast flicks).
    [this.pointer.x, this.pointer.vx] = criticallyDampedStep(
      this.pointer.x,
      this.pointer.vx,
      this.pointer.tx,
      CINEMA_SPRING.stiffness,
      dt,
      CINEMA_SPRING.dampingRatio,
    );
    [this.pointer.y, this.pointer.vy] = criticallyDampedStep(
      this.pointer.y,
      this.pointer.vy,
      this.pointer.ty,
      CINEMA_SPRING.stiffness,
      dt,
      CINEMA_SPRING.dampingRatio,
    );
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
    this.scrollContainer?.removeEventListener('scroll', this.onScroll);
    this.mount.removeEventListener('pointermove', this.onPointerMove);
    this.mount.removeEventListener('pointerleave', this.onPointerLeave);
  }
}
