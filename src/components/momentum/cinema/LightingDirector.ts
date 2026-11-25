/**
 * LightingDirector: key, rim, fill, practical (core) light and the environment.
 *
 * Three-point setup tuned for a dark scene: a warm key gives shape, a cool rim separates
 * silhouettes from the black, a low hemispheric fill keeps shadow sides readable without the
 * flat look of a uniform ambient light. The core is a practical light: it lights its neighbours.
 *
 * Environment: RoomEnvironment through PMREM (a procedural studio HDR, so no asset download).
 * It gives physically based materials believable reflections at a low intensity.
 */
import type * as THREE_NS from 'three';
import { CINEMA, type ShadowQuality } from './cinemaConfig';

export interface LightingOptions {
  shadows?: ShadowQuality;
  keyColor?: number;
  rimColor?: number;
  coreColor?: number;
}

export class LightingDirector {
  readonly keyLight: THREE_NS.DirectionalLight;
  readonly coreLight: THREE_NS.PointLight;
  private readonly renderer: THREE_NS.WebGLRenderer;
  private readonly lights: THREE_NS.Light[] = [];
  private readonly pmrem: THREE_NS.PMREMGenerator;
  private readonly envTex: THREE_NS.Texture;

  constructor(
    THREE: typeof import('three'),
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    RoomEnvironment: new () => THREE_NS.Scene,
    opts?: LightingOptions,
  ) {
    this.renderer = renderer;
    const L = CINEMA.lighting;
    const key = new THREE.DirectionalLight(opts?.keyColor ?? L.key.color, L.key.intensity);
    key.position.set(...L.key.position);
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 48;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2.5;
    this.keyLight = key;

    const rim = new THREE.DirectionalLight(opts?.rimColor ?? L.rim.color, L.rim.intensity);
    rim.position.set(...L.rim.position);
    const fill = new THREE.HemisphereLight(L.fill.sky, L.fill.ground, L.fill.intensity);
    for (const l of [key, rim, fill]) {
      scene.add(l);
      this.lights.push(l);
    }
    // Added to the rotating world by the caller, so it stays at the core.
    this.coreLight = new THREE.PointLight(opts?.coreColor ?? L.core.color, L.core.intensity, 0, L.core.decay);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTex;
    scene.environmentIntensity = L.environmentIntensity;

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.setShadowQuality(opts?.shadows ?? 'medium');
  }

  /** Dynamically switches soft shadow map fidelity per performance tier. */
  setShadowQuality(quality: ShadowQuality): void {
    const enabled = quality !== 'off';
    this.renderer.shadowMap.enabled = enabled;
    this.keyLight.castShadow = enabled;
    if (!enabled) return;
    const size = quality === 'high' ? 1024 : 512;
    if (this.keyLight.shadow.mapSize.width !== size) {
      this.keyLight.shadow.mapSize.set(size, size);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }
  }

  dispose(): void {
    this.keyLight.shadow.map?.dispose();
    for (const l of this.lights) l.removeFromParent();
    this.coreLight.removeFromParent();
    this.envTex.dispose();
    this.pmrem.dispose();
  }
}
