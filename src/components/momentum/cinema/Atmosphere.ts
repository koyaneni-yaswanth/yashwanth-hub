/**
 * Atmosphere: fog, brand-tinted nebulae, star layers and midground dust.
 *
 * Depth comes from layering: far stars (background), faint nebulae (background colour),
 * slow dust motes between the camera and the orbits (midground), and exponential fog that
 * quietly pushes distant orbits back. Nothing here competes with the core for attention.
 */
import type * as THREE_NS from 'three';
import { CINEMA } from './cinemaConfig';

export type RadialTexture = (inner: string, outer?: string, size?: number) => THREE_NS.Texture;

export interface AtmosphereOptions {
  fogColor?: number;
  fogDensity?: number;
  nebulaTints?: readonly [string, string, string];
  starColor?: string | number;
}

export class Atmosphere {
  readonly nebulae: THREE_NS.Sprite[] = [];
  readonly starsFar: THREE_NS.Points;
  readonly starsNear: THREE_NS.Points;
  readonly dust: THREE_NS.Points | null;
  private readonly dustBase: Float32Array | null;
  private readonly objects: THREE_NS.Object3D[] = [];

  constructor(
    THREE: typeof import('three'),
    scene: THREE_NS.Scene,
    disc: THREE_NS.Texture,
    radial: RadialTexture,
    counts: { starsFar: number; starsNear: number; dust: number },
    opts?: AtmosphereOptions,
  ) {
    const A = CINEMA.atmosphere;
    scene.fog = new THREE.FogExp2(opts?.fogColor ?? CINEMA.palette.fog, opts?.fogDensity ?? A.fogDensity);

    // Nebulae in the brand's warm/cool pair, desaturated and dim: colour in the black, not a wash.
    const tints = opts?.nebulaTints ?? ['rgba(198,164,107,0.5)', 'rgba(139,168,200,0.45)', 'rgba(96,104,120,0.4)'];
    const starColor = opts?.starColor ?? CINEMA.palette.ivory;
    tints.forEach((c, i) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: radial(c, 'rgba(0,0,0,0)', 256), transparent: true, opacity: A.nebulaOpacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      );
      s.position.set([-42, 36, 4][i], [12, -8, 24][i], -92 - i * 12);
      s.scale.setScalar(115 + i * 20);
      this.add(scene, s);
      this.nebulae.push(s);
    });

    const makeStars = (count: number, rMin: number, rMax: number, size: number, opacity: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.7, r * Math.sin(p) * Math.sin(t)], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ map: disc, size, sizeAttenuation: true, color: starColor, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      );
      this.add(scene, pts);
      return pts;
    };
    this.starsFar = makeStars(counts.starsFar, 90, 160, 0.85, 0.62);
    this.starsNear = makeStars(counts.starsNear, 40, 80, 0.5, 0.48);

    // Midground dust: very small, very faint, fogged, drifting slowly.
    if (counts.dust > 0) {
      const n = counts.dust;
      const base = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        base.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 60], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
      this.dust = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ map: disc, size: 0.09, color: starColor, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      this.dustBase = base;
      this.add(scene, this.dust);
    } else {
      this.dust = null;
      this.dustBase = null;
    }
  }

  private add(scene: THREE_NS.Scene, o: THREE_NS.Object3D) {
    scene.add(o);
    this.objects.push(o);
  }

  /** Slow drift; `calm` (0–1) quiets everything during a deep-work session. */
  update(dt: number, t: number, calm: number): void {
    this.starsNear.rotation.y += 0.004 * dt * calm;
    this.starsFar.rotation.y += 0.0015 * dt * calm;
    if (this.dust && this.dustBase) {
      const attr = this.dust.geometry.attributes.position as THREE_NS.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const ph = i * 0.37;
        arr[i] = this.dustBase[i] + Math.sin(t * 0.05 + ph) * 0.8;
        arr[i + 1] = this.dustBase[i + 1] + Math.sin(t * 0.07 + ph * 1.3) * 0.5;
      }
      attr.needsUpdate = true;
    }
  }

  /** Nebula brightness multiplier (deep work dims the background). */
  setNebulaLevel(level: number): void {
    for (const n of this.nebulae) (n.material as THREE_NS.SpriteMaterial).opacity = CINEMA.atmosphere.nebulaOpacity * level;
  }

  /** Geometries/materials are disposed by the scene traversal in the owner; this just detaches. */
  dispose(): void {
    for (const o of this.objects) o.removeFromParent();
  }
}
