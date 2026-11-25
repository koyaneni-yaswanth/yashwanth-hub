/**
 * PostFX: restrained post-processing.
 *   RenderPass (linear HDR) → UnrealBloom (only genuinely bright emissives cross the threshold)
 *   → OutputPass (ACES tone mapping + sRGB) → Finish (mild vignette + very low film grain,
 *   applied in display space so it never shifts the colour grade).
 * Bloom and grain switch off on lower quality tiers; the vignette stays (it's nearly free).
 */
import type * as THREE_NS from 'three';
import { CINEMA } from './cinemaConfig';

type Mods = {
  EffectComposer: typeof import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer;
  RenderPass: typeof import('three/examples/jsm/postprocessing/RenderPass.js').RenderPass;
  UnrealBloomPass: typeof import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
  OutputPass: typeof import('three/examples/jsm/postprocessing/OutputPass.js').OutputPass;
  ShaderPass: typeof import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
};

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE_NS.Texture | null },
    uVignette: { value: CINEMA.post.vignette },
    uGrain: { value: CINEMA.post.grain },
    uAberration: { value: CINEMA.post.chromaticAberration },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      // Corner mask: strictly 0 in the inner hero region so core & text remain optically sharp.
      float v = smoothstep(0.32, 0.82, length(d * vec2(1.1, 1.0)));
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAberration > 0.0 && v > 0.0) {
        vec2 shift = d * uAberration * v;
        c.r = texture2D(tDiffuse, clamp(vUv + shift, vec2(0.0), vec2(1.0))).r;
        c.b = texture2D(tDiffuse, clamp(vUv - shift, vec2(0.0), vec2(1.0))).b;
      }
      c.rgb *= 1.0 - v * uVignette;
      // Grain: zero-mean, scaled down in the shadows so blacks stay clean.
      float g = hash(vUv * vec2(1931.0, 1171.0) + fract(uTime) * 61.0) - 0.5;
      c.rgb += g * uGrain * (0.35 + 0.65 * dot(c.rgb, vec3(0.299, 0.587, 0.114)));
      gl_FragColor = c;
    }
  `,
};

export interface PostFXQuality {
  bloom: boolean;
  grain: boolean;
  chromaticAberration?: boolean;
  renderScale?: number;
}

export class PostFX {
  readonly composer: InstanceType<Mods['EffectComposer']>;
  private readonly bloom: InstanceType<Mods['UnrealBloomPass']>;
  private readonly finish: InstanceType<Mods['ShaderPass']>;
  private grainOn: boolean;
  private basePixelRatio: number;
  private renderScale: number;

  constructor(
    THREE: typeof import('three'),
    mods: Mods,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.Camera,
    size: { width: number; height: number },
    opts: PostFXQuality,
  ) {
    const B = CINEMA.post.bloom;
    this.basePixelRatio = renderer.getPixelRatio();
    this.renderScale = opts.renderScale ?? 1;
    this.composer = new mods.EffectComposer(renderer);
    this.composer.setPixelRatio(Math.max(0.5, this.basePixelRatio * this.renderScale));
    this.composer.addPass(new mods.RenderPass(scene, camera));
    this.bloom = new mods.UnrealBloomPass(new THREE.Vector2(size.width, size.height), B.strength, B.radius, B.threshold);
    this.bloom.enabled = opts.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new mods.OutputPass());
    this.finish = new mods.ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.grainOn = opts.grain;
    this.finish.uniforms.uGrain.value = opts.grain ? CINEMA.post.grain : 0;
    this.finish.uniforms.uAberration.value =
      (opts.chromaticAberration ?? opts.grain) ? CINEMA.post.chromaticAberration : 0;
  }

  setQuality(opts: PostFXQuality): void {
    this.bloom.enabled = opts.bloom;
    this.grainOn = opts.grain;
    this.finish.uniforms.uGrain.value = opts.grain ? CINEMA.post.grain : 0;
    this.finish.uniforms.uAberration.value =
      (opts.chromaticAberration ?? opts.grain) ? CINEMA.post.chromaticAberration : 0;
    if (opts.renderScale !== undefined && opts.renderScale !== this.renderScale) {
      this.renderScale = opts.renderScale;
      this.composer.setPixelRatio(Math.max(0.5, this.basePixelRatio * this.renderScale));
    }
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setPixelRatio(ratio: number): void {
    this.basePixelRatio = ratio;
    this.composer.setPixelRatio(Math.max(0.5, this.basePixelRatio * this.renderScale));
  }

  render(t: number): void {
    // Grain animates only while it's on (a static pattern would look like dirt on the lens).
    if (this.grainOn) this.finish.uniforms.uTime.value = t;
    this.composer.render();
  }

  dispose(): void {
    this.finish.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
