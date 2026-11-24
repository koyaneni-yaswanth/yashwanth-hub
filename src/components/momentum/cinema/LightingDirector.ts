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
import { CINEMA } from './cinemaConfig';

export class LightingDirector {
  readonly coreLight: THREE_NS.PointLight;
  private readonly lights: THREE_NS.Light[] = [];
  private readonly pmrem: THREE_NS.PMREMGenerator;
  private readonly envTex: THREE_NS.Texture;

  constructor(
    THREE: typeof import('three'),
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    RoomEnvironment: new () => THREE_NS.Scene
  ) {
    const L = CINEMA.lighting;
    const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
    key.position.set(...L.key.position);
    const rim = new THREE.DirectionalLight(L.rim.color, L.rim.intensity);
    rim.position.set(...L.rim.position);
    const fill = new THREE.HemisphereLight(L.fill.sky, L.fill.ground, L.fill.intensity);
    for (const l of [key, rim, fill]) {
      scene.add(l);
      this.lights.push(l);
    }
    // Added to the rotating world by the caller, so it stays at the core.
    this.coreLight = new THREE.PointLight(L.core.color, L.core.intensity, 0, L.core.decay);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTex;
    scene.environmentIntensity = L.environmentIntensity;
  }

  dispose(): void {
    for (const l of this.lights) l.removeFromParent();
    this.coreLight.removeFromParent();
    this.envTex.dispose();
    this.pmrem.dispose();
  }
}
