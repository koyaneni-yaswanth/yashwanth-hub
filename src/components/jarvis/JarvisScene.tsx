/**
 * JarvisScene: the Jarvis core and its orbiting workspace nodes (three r187, WebGLRenderer).
 *
 * P2 + P3 architecture:
 * - Inner icosphere uses a custom GLSL Fresnel + 3D noise displacement shader reactive to AI
 *   thinking/talking and calm/amber/red status states.
 * - Outer translucent geodesic wireframe cage, 3 counter-rotating cyan/violet holographic rings,
 *   120 instanced gimbal ticks, and an InstancedMesh orbiting particle halo (halved on low tier).
 * - 7 orbital workspace nodes driven by live Dexie activity (size & glow scale with activityLevel),
 *   tilted elliptical orbit trails, animated core-to-node plasma data beams for due-today/overdue
 *   workspaces, projected crisp HTML glyph buttons + 2-3 stat hover tooltips, and smooth 0.75s
 *   camera dolly on click.
 * - Deep #05070D background, volumetric FogExp2, fading hex/radar floor grid, DPR <= 1.75.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceNode } from '../../lib/jarvisWorkspaces';
import { nodeAngles } from '../../lib/jarvisWorkspaces';
import type { HudWorkspaceSummary } from '../../lib/jarvisHud';
import { DEFAULT_CORE, useJarvisHud } from '../../context/jarvisHudStore';
import { CINEMA, easeInOutCubic } from '../momentum/cinema/cinemaConfig';
import { CinematicCameraRig } from '../momentum/cinema/CinematicCameraRig';
import { LightingDirector } from '../momentum/cinema/LightingDirector';
import { Atmosphere } from '../momentum/cinema/Atmosphere';
import { PostFX } from '../momentum/cinema/PostFX';
import { PerformanceManager } from '../momentum/cinema/PerformanceManager';
import { NodeButtons } from './NodeButtons';
import { renderWorkspaceGlyph } from './workspaceGlyph';
import {
  HEX_FLOOR_FRAGMENT_SHADER,
  HEX_FLOOR_VERTEX_SHADER,
  JARVIS_CORE_FRAGMENT_SHADER,
  JARVIS_CORE_VERTEX_SHADER,
} from './jarvisShaders';

const MAX_DPR = 1.75;
const MAX_HALO_PARTICLES = 96;
const LOW_HALO_PARTICLES = 48;

/** Tunables specific to this scene (shared look lives in CINEMA). */
const JARVIS = {
  cameraHome: [0, 4.75, 14.4] as const,
  orbitRx: 5.9,
  orbitRz: 4.85,
  nodeRingTiltX: 0.34,
  nodeRingTiltZ: -0.07,
  nodeSpin: 0.038, // rad/s, the whole node ring
  coreSpin: [0.24, -0.17, 0.11] as const, // holographic ring speeds
  glideSeconds: 0.75, // camera move before opening a workspace
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function readGpuInfo(renderer: import('three').WebGLRenderer): { gpuRenderer: string; isSoftwareGpu: boolean } {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');
    const isSoftwareGpu = /swiftshader|llvmpipe|software|mesa offscreen|microsoft basic render/i.test(raw);
    return { gpuRenderer: raw || 'webgl', isSoftwareGpu };
  } catch {
    return { gpuRenderer: 'webgl', isSoftwareGpu: false };
  }
}

function publishMetrics(metrics: {
  tier: string;
  fps: number;
  webglActive: boolean;
  dpr: number;
  gpuRenderer: string;
  reducedMotion: boolean;
  haloParticles: number;
}) {
  if (typeof window !== 'undefined') {
    (window as Window & { __JARVIS_HUD_METRICS__?: typeof metrics }).__JARVIS_HUD_METRICS__ = metrics;
  }
}

function radialTexture(THREE: typeof import('three'), inner: string, outer = 'rgba(0,0,0,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function legacyToHudFallback(nodes: WorkspaceNode[]): HudWorkspaceSummary[] {
  return nodes.map((n) => ({
    id: (n.target.tab as HudWorkspaceSummary['id']) || 'projects',
    label: n.label,
    shortLabel: n.label,
    description: n.description,
    glyph: 'folder',
    color: n.color,
    target: {
      tab: (n.target.tab as HudWorkspaceSummary['id']) || 'projects',
      area: n.target.area,
    },
    openTasks: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    recentUpdatesCount: 0,
    activityLevel: 0.25,
    hasDueTodayBeam: false,
    stats: [n.status || 'Open workspace', n.target.tab],
    keyMetric: { label: 'Status', value: n.status || 'Active' },
    nextMilestone: null,
    topTasks: [],
    statusText: n.status,
  }));
}

type Props = {
  nodes: WorkspaceNode[];
  onOpen: (node: WorkspaceNode) => void;
  onOpenCore: () => void;
};

export const JarvisScene: React.FC<Props> = ({ nodes, onOpen, onOpenCore }) => {
  const hud = useJarvisHud();
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const coreLabelRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const stageNodes: HudWorkspaceSummary[] = useMemo(
    () => (hud?.hudNodes && hud.hudNodes.length > 0 ? hud.hudNodes : legacyToHudFallback(nodes)),
    [hud?.hudNodes, nodes]
  );

  const stageNodesRef = useRef(stageNodes);
  const requestStaticRenderRef = useRef<() => void>(() => {});
  useEffect(() => {
    stageNodesRef.current = stageNodes;
    requestStaticRenderRef.current();
  }, [stageNodes]);

  const api = useRef<{
    highlight: (id: string | null) => void;
    glide: (id: string, done: () => void) => boolean;
  }>({
    highlight: () => {},
    glide: () => false,
  });

  const openRef = useRef({ onOpen, onOpenCore });
  useEffect(() => {
    openRef.current = { onOpen, onOpenCore };
  }, [onOpen, onOpenCore]);

  const coreStateRef = useRef(hud?.coreState ?? DEFAULT_CORE);
  useEffect(() => {
    coreStateRef.current = hud?.coreState ?? DEFAULT_CORE;
    requestStaticRenderRef.current();
  }, [hud?.coreState]);

  const setPerfRef = useRef(hud?.setPerf);
  useEffect(() => {
    setPerfRef.current = hud?.setPerf;
  }, [hud?.setPerf]);

  const setHoveredRef = useRef(hud?.setHoveredNodeId);
  useEffect(() => {
    setHoveredRef.current = hud?.setHoveredNodeId;
  }, [hud?.setHoveredNodeId]);

  const setSelectedRef = useRef(hud?.setSelectedNodeId);
  useEffect(() => {
    setSelectedRef.current = hud?.setSelectedNodeId;
  }, [hud?.setSelectedNodeId]);

  const [panelWidth, setPanelWidth] = useState(800);
  const busy = useRef(false);
  // Rebuild WebGL scene only when node identity/color topology changes; live metrics update in-place.
  const key = stageNodes.map((n) => `${n.id}|${n.color}`).join(',');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let THREE: typeof import('three');
      let mods: {
        EffectComposer: typeof import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer;
        RenderPass: typeof import('three/examples/jsm/postprocessing/RenderPass.js').RenderPass;
        UnrealBloomPass: typeof import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
        OutputPass: typeof import('three/examples/jsm/postprocessing/OutputPass.js').OutputPass;
        ShaderPass: typeof import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
        RoomEnvironment: typeof import('three/examples/jsm/environments/RoomEnvironment.js').RoomEnvironment;
      };
      try {
        THREE = await import('three');
        const [ec, rp, ub, op, sp, re] = await Promise.all([
          import('three/examples/jsm/postprocessing/EffectComposer.js'),
          import('three/examples/jsm/postprocessing/RenderPass.js'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/postprocessing/OutputPass.js'),
          import('three/examples/jsm/postprocessing/ShaderPass.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        mods = {
          EffectComposer: ec.EffectComposer,
          RenderPass: rp.RenderPass,
          UnrealBloomPass: ub.UnrealBloomPass,
          OutputPass: op.OutputPass,
          ShaderPass: sp.ShaderPass,
          RoomEnvironment: re.RoomEnvironment,
        };
      } catch {
        if (!disposed) setStatus('unsupported');
        return;
      }
      if (disposed) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      } catch {
        setStatus('unsupported');
        return;
      }

      let width = mount.clientWidth || 800;
      let height = mount.clientHeight || 340;
      const reduced = prefersReducedMotion();
      const gpuInfo = readGpuInfo(renderer);
      const device = PerformanceManager.readDevice(width, reduced);
      if (gpuInfo.isSoftwareGpu) {
        device.cores = Math.min(device.cores, 2);
      }

      let currentTierName: 'high' | 'medium' | 'low' = 'high';
      const perf = new PerformanceManager(device, (newTier, set) => {
        currentTierName = newTier;
        const ratio = Math.min(MAX_DPR, window.devicePixelRatio, set.pixelRatioCap);
        renderer.setPixelRatio(ratio);
        postFX.setPixelRatio(ratio);
        postFX.setSize(width, height);
        postFX.setQuality({ bloom: newTier === 'low' ? false : set.bloom, grain: newTier === 'low' ? false : set.grain });
        if (!set.glassTransmission) toSheen();
        if (atmosphere.dust && set.dust === 0) atmosphere.dust.visible = false;
        haloParticles.count = newTier === 'low' ? LOW_HALO_PARTICLES : MAX_HALO_PARTICLES;
        needsRender = true;
      });
      const tier = perf.settings;
      currentTierName = perf.tier;
      const initialRatio = Math.min(MAX_DPR, window.devicePixelRatio, tier.pixelRatioCap);
      setPerfRef.current?.({ tier: perf.tier, fps: 60, webglActive: true });
      publishMetrics({
        tier: perf.tier,
        fps: 60,
        webglActive: true,
        dpr: initialRatio,
        gpuRenderer: gpuInfo.gpuRenderer,
        reducedMotion: reduced,
        haloParticles: perf.tier === 'low' ? LOW_HALO_PARTICLES : MAX_HALO_PARTICLES,
      });
      renderer.setPixelRatio(initialRatio);
      renderer.setSize(width, height);
      renderer.setClearColor(0x05070d, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = CINEMA.renderer.exposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#05070D');
      scene.fog = new THREE.FogExp2(0x05070d, 0.024);

      const lighting = new LightingDirector(THREE, renderer, scene, mods.RoomEnvironment);
      const disc = radialTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
      const atmosphere = new Atmosphere(THREE, scene, disc, (i, o, s) => radialTexture(THREE, i, o, s), {
        starsFar: Math.round(tier.starsFar * 0.65),
        starsNear: Math.round(tier.starsNear * 0.65),
        dust: currentTierName === 'low' ? Math.round(tier.dust * 0.5) : tier.dust,
      });

      const camera = new THREE.PerspectiveCamera(CINEMA.camera.fov, width / height, 0.1, 400);
      const home = new THREE.Vector3(...JARVIS.cameraHome);
      const fit = () => Math.max(1, 1.45 / Math.max(0.6, width / height));
      const base = new THREE.Vector3().copy(home).multiplyScalar(fit());
      camera.position.copy(base);
      const aim = new THREE.Vector3(0, -0.8, 0);
      const target = aim.clone();
      camera.lookAt(target);

      // ------------------------------------------------------------------ Hex & Radar Floor
      const hexFloorMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uGridColor: { value: new THREE.Color('#3BE8FF') },
          uAccentColor: { value: new THREE.Color('#7C5CFF') },
        },
        vertexShader: HEX_FLOOR_VERTEX_SHADER,
        fragmentShader: HEX_FLOOR_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const hexFloor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), hexFloorMat);
      hexFloor.rotation.x = -Math.PI / 2;
      hexFloor.position.y = -2.45;
      scene.add(hexFloor);

      // ------------------------------------------------------------------ JarvisCore
      const initialCore = coreStateRef.current;
      const primaryColor = new THREE.Color(initialCore.primaryHex);
      const secondaryColor = new THREE.Color(initialCore.secondaryHex);
      const targetPrimary = new THREE.Color(initialCore.primaryHex);
      const targetSecondary = new THREE.Color(initialCore.secondaryHex);

      lighting.coreLight.color.copy(primaryColor);

      const core = new THREE.Group();
      scene.add(core);
      core.add(lighting.coreLight);

      const coreUniforms = {
        uTime: { value: 0 },
        uPulseRate: { value: initialCore.pulseRate },
        uDispAmp: { value: initialCore.displacementAmp },
        uPrimaryColor: { value: primaryColor.clone() },
        uSecondaryColor: { value: secondaryColor.clone() },
        uEnergy: { value: 0.45 },
      };

      const heart = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.76, 4),
        new THREE.ShaderMaterial({
          uniforms: coreUniforms,
          vertexShader: JARVIS_CORE_VERTEX_SHADER,
          fragmentShader: JARVIS_CORE_FRAGMENT_SHADER,
          transparent: true,
        })
      );
      core.add(heart);

      const shellMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.08,
        transmission: tier.glassTransmission ? 1 : 0,
        transparent: !tier.glassTransmission,
        opacity: tier.glassTransmission ? 1 : 0.16,
        thickness: 1.0,
        ior: 1.4,
        clearcoat: 1,
        attenuationColor: primaryColor,
        attenuationDistance: 2.5,
        flatShading: true,
        envMapIntensity: 1.15,
      });
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.14, 1), shellMat);
      core.add(shell);

      const cageMat = new THREE.MeshBasicMaterial({
        color: primaryColor,
        wireframe: true,
        transparent: true,
        opacity: 0.24,
        toneMapped: false,
      });
      const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.22, 1), cageMat);
      core.add(cage);

      function toSheen() {
        if (shellMat.transmission === 0) return;
        shellMat.transmission = 0;
        shellMat.transparent = true;
        shellMat.opacity = 0.18;
        shellMat.needsUpdate = true;
      }

      const ringSpecs = [
        { r: 1.62, tube: 0.022, rot: [Math.PI / 2.1, 0.08, 0], color: 0x3be8ff, wireframe: false, opacity: 0.72 },
        { r: 1.98, tube: 0.016, rot: [Math.PI / 2.8, 0.62, 0.22], color: 0x7c5cff, wireframe: true, opacity: 0.65 },
        { r: 2.34, tube: 0.012, rot: [Math.PI / 1.72, -0.45, 0.52], color: 0x3be8ff, wireframe: true, opacity: 0.45 },
      ] as const;

      const rings = ringSpecs.map((d) => {
        const holder = new THREE.Object3D();
        holder.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
        const mat = new THREE.MeshBasicMaterial({
          color: d.color,
          wireframe: d.wireframe,
          transparent: true,
          opacity: d.opacity,
          toneMapped: false,
        });
        const rMesh = new THREE.Mesh(new THREE.TorusGeometry(d.r, d.tube, 8, 128), mat);
        holder.add(rMesh);
        core.add(holder);
        return { mesh: rMesh, mat, baseOpacity: d.opacity, isSecondary: d.color === 0x7c5cff };
      });

      const tickGeo = new THREE.BoxGeometry(0.018, 0.018, 0.14);
      const tickMat = new THREE.MeshBasicMaterial({ color: 0x5c7596, transparent: true, opacity: 0.72, toneMapped: false });
      const ticks = new THREE.InstancedMesh(tickGeo, tickMat, 120);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      const ps = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const major = i % 10 === 0;
        ps.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
        q.setFromAxisAngle(yAxis, -a + Math.PI / 2);
        sc.set(1, 1, major ? 2.1 : 1);
        ticks.setMatrixAt(i, m4.compose(ps, q, sc));
        if (major) ticks.setColorAt(i, primaryColor);
      }
      if (ticks.instanceColor) ticks.instanceColor.needsUpdate = true;
      const dial = new THREE.Object3D();
      dial.rotation.x = 0.08;
      dial.add(ticks);
      core.add(dial);

      const arcPalette = [0x3be8ff, 0x7c5cff];
      const arcs = [0, 1].map((k) => {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(3.1 + k * 0.18, 0.014, 6, 96, Math.PI * (0.58 - k * 0.16)),
          new THREE.MeshBasicMaterial({ color: arcPalette[k], toneMapped: false, transparent: true, opacity: 0.72 })
        );
        arc.rotation.x = Math.PI / 2 + 0.08;
        arc.rotation.z = k * Math.PI;
        core.add(arc);
        return arc;
      });

      const haloParticleMat = new THREE.MeshBasicMaterial({
        color: primaryColor,
        transparent: true,
        opacity: 0.75,
        toneMapped: false,
      });
      const haloParticles = new THREE.InstancedMesh(
        new THREE.OctahedronGeometry(0.032, 0),
        haloParticleMat,
        MAX_HALO_PARTICLES
      );
      haloParticles.count = currentTierName === 'low' ? LOW_HALO_PARTICLES : MAX_HALO_PARTICLES;
      const haloSeeds = Array.from({ length: MAX_HALO_PARTICLES }, (_, i) => ({
        radius: 1.55 + (i % 7) * 0.24,
        speed: (0.28 + (i % 5) * 0.09) * (i % 2 === 0 ? 1 : -1),
        phase: (i / MAX_HALO_PARTICLES) * Math.PI * 2,
        tiltX: ((i * 37) % 100) / 100 * 1.4 - 0.7,
        tiltZ: ((i * 53) % 100) / 100 * 1.1 - 0.55,
        scale: 0.75 + (i % 4) * 0.22,
      }));
      const pDummy = new THREE.Vector3();
      const pQuat = new THREE.Quaternion();
      const pScale = new THREE.Vector3();
      const pMat = new THREE.Matrix4();
      const updateHaloParticles = (timeSec: number, pulseRate: number) => {
        const activeCount = haloParticles.count;
        const speedBoost = 0.75 + pulseRate * 0.45;
        for (let i = 0; i < activeCount; i++) {
          const s = haloSeeds[i];
          const theta = s.phase + timeSec * s.speed * speedBoost;
          const x = Math.cos(theta) * s.radius;
          const z = Math.sin(theta) * s.radius;
          const y = Math.sin(theta * 2.0 + s.phase) * 0.36 + x * s.tiltZ * 0.35 + z * s.tiltX * 0.35;
          pDummy.set(x, y, z);
          pQuat.setFromAxisAngle(yAxis, theta);
          pScale.setScalar(s.scale * (0.9 + 0.15 * Math.sin(timeSec * 2.5 + s.phase)));
          haloParticles.setMatrixAt(i, pMat.compose(pDummy, pQuat, pScale));
        }
        haloParticles.instanceMatrix.needsUpdate = true;
      };
      updateHaloParticles(0, initialCore.pulseRate);
      core.add(haloParticles);

      const haloSpriteMat = new THREE.SpriteMaterial({
        map: radialTexture(THREE, 'rgba(59,232,255,0.22)'),
        color: primaryColor,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(haloSpriteMat);
      halo.scale.setScalar(6.4);
      core.add(halo);

      // ------------------------------------------------------------------ Orbital WorkspaceNodes + Data Beams
      const ring = new THREE.Object3D();
      ring.rotation.x = JARVIS.nodeRingTiltX;
      ring.rotation.z = JARVIS.nodeRingTiltZ;
      scene.add(ring);

      const orbitPts = Array.from({ length: 241 }, (_, k) => {
        const a = (k / 240) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * JARVIS.orbitRx, 0, Math.sin(a) * JARVIS.orbitRz);
      });
      ring.add(
        new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(orbitPts),
          new THREE.LineBasicMaterial({ color: 0x3be8ff, transparent: true, opacity: 0.22 })
        )
      );

      const outerTrailPts = Array.from({ length: 181 }, (_, k) => {
        const a = (k / 180) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * (JARVIS.orbitRx * 1.06), 0, Math.sin(a) * (JARVIS.orbitRz * 1.06));
      });
      ring.add(
        new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(outerTrailPts),
          new THREE.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.12 })
        )
      );

      const initialNodes = stageNodesRef.current;
      const angles = nodeAngles(initialNodes.length);
      const beamStartRadius = 1.05;
      const upVec = new THREE.Vector3(0, 1, 0);

      const nodeObjs = initialNodes.map((n, i) => {
        const color = new THREE.Color(n.color);
        const angle = angles[i];
        const nx = Math.cos(angle) * JARVIS.orbitRx;
        const nz = Math.sin(angle) * JARVIS.orbitRz;
        const baseScale = 0.78 + n.activityLevel * 0.62;

        const nodeGroup = new THREE.Group();
        nodeGroup.position.set(nx, 0, nz);
        nodeGroup.scale.setScalar(baseScale);
        ring.add(nodeGroup);

        const mat = new THREE.MeshPhysicalMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35 + n.activityLevel * 0.95,
          metalness: 0.35,
          roughness: 0.18,
          clearcoat: 1,
          flatShading: true,
        });
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat);
        mesh.userData = { hudNodeId: n.id };
        nodeGroup.add(mesh);

        const collarMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.48,
          toneMapped: false,
        });
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.014, 6, 48), collarMat);
        collar.rotation.x = Math.PI / 2.3;
        collar.rotation.y = (i * 0.6) % Math.PI;
        nodeGroup.add(collar);

        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: radialTexture(
              THREE,
              `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},0.65)`
            ),
            transparent: true,
            opacity: 0.24 + n.activityLevel * 0.45,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        glow.scale.setScalar(1.75);
        nodeGroup.add(glow);

        // Animated data beam from core to node in orbital plane
        const dirVec = new THREE.Vector3(nx, 0, nz);
        const totalLen = dirVec.length();
        const dirNorm = dirVec.clone().normalize();
        const beamLen = Math.max(0.5, totalLen - beamStartRadius - 0.38);

        const beamMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.36,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.018, beamLen, 6), beamMat);
        beamMesh.quaternion.setFromUnitVectors(upVec, dirNorm);
        beamMesh.position.copy(dirNorm).multiplyScalar(beamStartRadius + beamLen * 0.5);
        beamMesh.visible = n.hasDueTodayBeam;
        ring.add(beamMesh);

        const beadMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          toneMapped: false,
        });
        const bead = new THREE.Mesh(new THREE.OctahedronGeometry(0.058, 0), beadMat);
        bead.visible = n.hasDueTodayBeam;
        ring.add(bead);

        return {
          id: n.id,
          index: i,
          nodeGroup,
          mesh,
          mat,
          collar,
          collarMat,
          glow,
          beamMesh,
          beamMat,
          bead,
          dirNorm,
          beamLen,
          baseScale,
          targetScale: baseScale,
        };
      });

      const pickMeshes = [heart, shell, cage, ...nodeObjs.map((o) => o.mesh)];
      let highlighted: string | null = null;
      api.current.highlight = (id) => {
        highlighted = id;
        for (const o of nodeObjs) {
          const live = stageNodesRef.current.find((x) => x.id === o.id);
          const activity = live?.activityLevel ?? 0.25;
          const beamOn = Boolean(live?.hasDueTodayBeam);
          const on = o.id === id;
          o.baseScale = 0.78 + activity * 0.62;
          o.targetScale = on ? o.baseScale * 1.38 : o.baseScale;
          o.mat.emissiveIntensity = on ? 1.45 : 0.35 + activity * 0.95;
          o.collarMat.opacity = on ? 0.95 : 0.35 + activity * 0.35;
          (o.glow.material as import('three').SpriteMaterial).opacity = on ? 1 : 0.24 + activity * 0.45;
          o.beamMesh.visible = beamOn || on;
          o.bead.visible = beamOn || on;
          o.beamMat.opacity = on ? 0.68 : 0.36;
        }
        needsRender = true;
      };

      // ------------------------------------------------------------------ Post, camera rig
      const postFX = new PostFX(THREE, mods, renderer, scene, camera, { width, height }, {
        bloom: currentTierName === 'low' ? false : tier.bloom,
        grain: currentTierName === 'low' ? false : tier.grain,
      });
      postFX.setPixelRatio(initialRatio);
      let needsRender = true;
      requestStaticRenderRef.current = () => {
        needsRender = true;
      };
      const rig = new CinematicCameraRig(THREE, mount, { motion: !reduced, intro: true, onChange: () => (needsRender = true) });

      // Click -> smooth camera dolly towards the node, then open the workspace.
      const glide = {
        id: '',
        t: 0,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        look: new THREE.Vector3(),
        done: null as null | (() => void),
      };
      const world = new THREE.Vector3();
      api.current.glide = (id, done) => {
        const o = nodeObjs.find((x) => x.id === id);
        if (!o || reduced) return false;
        rig.skipIntro();
        o.nodeGroup.getWorldPosition(world);
        glide.id = id;
        glide.t = 0;
        glide.from.copy(camera.position);
        glide.look.copy(world);
        glide.to.copy(world).multiplyScalar(1.36).add(new THREE.Vector3(0, 1.35, 2.35));
        glide.done = done;
        return true;
      };

      // ------------------------------------------------------------------ Overlay projection
      const proj = new THREE.Vector3();
      const placeLabels = () => {
        const w = width;
        const h = height;
        for (const o of nodeObjs) {
          const el = labelRefs.current.get(o.id);
          if (!el) continue;
          o.nodeGroup.getWorldPosition(proj);
          const depth = proj.z;
          proj.project(camera);
          const x = (proj.x * 0.5 + 0.5) * w;
          const y = (-proj.y * 0.5 + 0.5) * h;
          const below = y < h - 54;
          el.style.transform = below
            ? `translate(${x}px, ${y + 22}px) translate(-50%, 0)`
            : `translate(${x}px, ${y - 22}px) translate(-50%, -100%)`;
          el.dataset.depth = depth < -1 ? 'back' : 'front';
        }
        const c = coreLabelRef.current;
        if (c) {
          proj.set(0, -1.9, 0).project(camera);
          c.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px) translate(-50%, 0)`;
        }
      };

      // ------------------------------------------------------------------ Resize, visibility, pointer raycast, context loss
      const ro = new ResizeObserver(() => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        const ratio = Math.min(MAX_DPR, window.devicePixelRatio, perf.settings.pixelRatioCap);
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height);
        postFX.setPixelRatio(ratio);
        postFX.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        base.copy(home).multiplyScalar(fit());
        if (!glide.done) camera.position.copy(base);
        needsRender = true;
      });
      ro.observe(mount);

      let visible = true;
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) needsRender = true;
      });
      io.observe(mount);

      const onLost = (e: Event) => {
        e.preventDefault();
        setStatus('unsupported');
      };
      renderer.domElement.addEventListener('webglcontextlost', onLost);

      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let downPos = { x: 0, y: 0 };
      let meshHoverId: string | null = null;

      const pickAt = (clientX: number, clientY: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(pickMeshes, false);
        return hits[0]?.object ?? null;
      };

      const onCanvasPointerMove = (e: PointerEvent) => {
        if (glide.done || busy.current) return;
        const hitObj = pickAt(e.clientX, e.clientY);
        const nodeId = (hitObj?.userData?.hudNodeId as string | undefined) ?? null;
        const isCore = hitObj === heart || hitObj === shell || hitObj === cage;
        renderer.domElement.style.cursor = nodeId || isCore ? 'pointer' : '';
        if (nodeId !== meshHoverId) {
          meshHoverId = nodeId;
          if (nodeId) focusNode(nodeId);
          else if (meshHoverId === null) focusNode(null);
        }
      };

      const onCanvasPointerDown = (e: PointerEvent) => {
        downPos = { x: e.clientX, y: e.clientY };
      };

      const onCanvasPointerUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 8) return;
        const hitObj = pickAt(e.clientX, e.clientY);
        if (!hitObj) return;
        const nodeId = hitObj.userData?.hudNodeId as string | undefined;
        if (nodeId) {
          const targetNode = stageNodesRef.current.find((x) => x.id === nodeId);
          if (targetNode) openNode(targetNode);
          return;
        }
        if (hitObj === heart || hitObj === shell || hitObj === cage) {
          openRef.current.onOpenCore();
        }
      };

      renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);

      // ------------------------------------------------------------------ Loop
      const timer = new THREE.Timer();
      let raf = 0;
      let fpsFrames = 0;
      let fpsElapsed = 0;

      const tick = () => {
        raf = requestAnimationFrame(tick);
        timer.update();
        const dt = Math.min(0.05, timer.getDelta());
        if (!visible || document.hidden) {
          perf.resetWindow();
          return;
        }
        const t = timer.getElapsed();
        const animate = !reduced;
        if (!animate && !needsRender && !glide.done) return;
        needsRender = false;

        // Core reactive uniform lerp
        const cs = coreStateRef.current;
        targetPrimary.set(cs.primaryHex);
        targetSecondary.set(cs.secondaryHex);
        const lerpAlpha = animate ? Math.min(1, dt * 4.5) : 1;

        coreUniforms.uTime.value = t;
        coreUniforms.uPrimaryColor.value.lerp(targetPrimary, lerpAlpha);
        coreUniforms.uSecondaryColor.value.lerp(targetSecondary, lerpAlpha);
        coreUniforms.uPulseRate.value += (cs.pulseRate - coreUniforms.uPulseRate.value) * lerpAlpha;
        coreUniforms.uDispAmp.value += (cs.displacementAmp - coreUniforms.uDispAmp.value) * lerpAlpha;

        const targetEnergy = cs.mode === 'thinking' ? 1.0 : cs.mode === 'talking' ? 0.8 : cs.mode === 'idle' ? 0.42 : 0.72;
        coreUniforms.uEnergy.value += (targetEnergy - coreUniforms.uEnergy.value) * lerpAlpha;

        hexFloorMat.uniforms.uTime.value = t;
        hexFloorMat.uniforms.uGridColor.value.copy(coreUniforms.uPrimaryColor.value);
        hexFloorMat.uniforms.uAccentColor.value.copy(coreUniforms.uSecondaryColor.value);

        lighting.coreLight.color.copy(coreUniforms.uPrimaryColor.value);
        lighting.coreLight.intensity = 1.6 + coreUniforms.uEnergy.value * 1.4;
        cageMat.color.copy(coreUniforms.uPrimaryColor.value);
        haloParticleMat.color.copy(coreUniforms.uPrimaryColor.value);
        haloSpriteMat.color.copy(coreUniforms.uPrimaryColor.value);

        for (const r of rings) {
          if (!r.isSecondary) r.mat.color.copy(coreUniforms.uPrimaryColor.value);
          r.mat.opacity = r.baseOpacity * (0.78 + coreUniforms.uEnergy.value * 0.35);
        }

        // Sync live Dexie node activity, node hover scale lerp, and animated data beam pulses
        const currentHudNodes = stageNodesRef.current;
        for (const o of nodeObjs) {
          const live = currentHudNodes.find((x) => x.id === o.id);
          const activity = live?.activityLevel ?? 0.25;
          const beamOn = Boolean(live?.hasDueTodayBeam) || highlighted === o.id;
          o.baseScale = 0.78 + activity * 0.62;
          o.targetScale = highlighted === o.id ? o.baseScale * 1.38 : o.baseScale;
          const curScale = o.nodeGroup.scale.x;
          o.nodeGroup.scale.setScalar(curScale + (o.targetScale - curScale) * lerpAlpha);

          o.beamMesh.visible = beamOn;
          o.bead.visible = beamOn;
          if (beamOn) {
            const phase = (t * 0.68 + o.index * 0.23) % 1;
            const travelDist = beamStartRadius + phase * o.beamLen;
            o.bead.position.copy(o.dirNorm).multiplyScalar(travelDist);
            o.beamMat.opacity = (highlighted === o.id ? 0.56 : 0.24) + 0.16 * Math.sin(t * 4.5 + o.index);
          }
        }

        if (animate) {
          perf.sample(dt);
          fpsFrames += 1;
          fpsElapsed += dt;
          if (fpsElapsed >= 0.6) {
            const measuredFps = Math.max(1, Math.min(120, Math.round(fpsFrames / fpsElapsed)));
            fpsFrames = 0;
            fpsElapsed = 0;
            setPerfRef.current?.({ tier: currentTierName, fps: measuredFps, webglActive: true });
            publishMetrics({
              tier: currentTierName,
              fps: measuredFps,
              webglActive: true,
              dpr: renderer.getPixelRatio(),
              gpuRenderer: gpuInfo.gpuRenderer,
              reducedMotion: reduced,
              haloParticles: haloParticles.count,
            });
          }

          const spinFactor = 1 + coreUniforms.uEnergy.value * 0.85;
          rings[0].mesh.rotation.z += JARVIS.coreSpin[0] * spinFactor * dt;
          rings[1].mesh.rotation.z += JARVIS.coreSpin[1] * spinFactor * dt;
          rings[2].mesh.rotation.z += JARVIS.coreSpin[2] * spinFactor * dt;
          dial.rotation.y -= 0.03 * dt;
          arcs[0].rotation.z += 0.11 * spinFactor * dt;
          arcs[1].rotation.z -= 0.08 * spinFactor * dt;
          shell.rotation.y += 0.06 * dt;
          cage.rotation.y -= 0.09 * dt;
          cage.rotation.x += 0.03 * dt;

          const breathScale =
            1 + Math.sin(t * (1.1 + coreUniforms.uPulseRate.value * 1.8)) * (0.025 + coreUniforms.uEnergy.value * 0.025);
          heart.scale.setScalar(breathScale);
          halo.scale.setScalar(6.2 + Math.sin(t * (1.1 + coreUniforms.uPulseRate.value * 1.8)) * 0.38);
          updateHaloParticles(t, coreUniforms.uPulseRate.value);

          // Pause outer orbit smoothly when any node is hovered/focused or camera is gliding
          if (!glide.done && !highlighted) ring.rotation.y += JARVIS.nodeSpin * dt;
          for (const o of nodeObjs) {
            o.mesh.rotation.y += 0.45 * dt;
            o.collar.rotation.z -= 0.6 * dt;
          }
          atmosphere.update(dt, t, 1);
        }

        if (glide.done) {
          glide.t += dt / JARVIS.glideSeconds;
          const e = easeInOutCubic(Math.min(1, glide.t));
          camera.position.lerpVectors(glide.from, glide.to, e);
          target.lerpVectors(aim, glide.look, e);
          camera.lookAt(target);
          postFX.render(t);
          placeLabels();
          if (glide.t >= 1) {
            const done = glide.done;
            glide.done = null;
            done();
          }
          return;
        }
        rig.apply(camera, target, t, dt);
        postFX.render(t);
        placeLabels();
        rig.restore(camera, target);
      };
      tick();
      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        renderer.domElement.removeEventListener('webglcontextlost', onLost);
        renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
        renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
        renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
        setPerfRef.current?.({ tier: currentTierName, fps: 60, webglActive: false });
        publishMetrics({
          tier: currentTierName,
          fps: 60,
          webglActive: false,
          dpr: renderer.getPixelRatio(),
          gpuRenderer: gpuInfo.gpuRenderer,
          reducedMotion: reduced,
          haloParticles: 0,
        });
        requestStaticRenderRef.current = () => {};
        rig.dispose();
        postFX.dispose();
        lighting.dispose();
        atmosphere.dispose();
        scene.traverse((o) => {
          const m = o as import('three').Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as import('three').Material | import('three').Material[] | undefined;
          const d = (x: import('three').Material) => {
            (x as import('three').Material & { map?: import('three').Texture | null }).map?.dispose?.();
            x.dispose();
          };
          if (Array.isArray(mat)) mat.forEach(d);
          else if (mat) d(mat);
        });
        disc.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const focusNode = (id: string | null) => {
    setHovered(id);
    setHoveredRef.current?.(id);
    api.current.highlight(id);
    const el = id ? labelRefs.current.get(id) : null;
    const box = mountRef.current?.getBoundingClientRect();
    if (!el || !box) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setPanelWidth(box.width);
    setTip({ x: r.left + r.width / 2 - box.left, y: r.top - box.top });
  };

  const openNode = (w: HudWorkspaceSummary) => {
    if (busy.current) return;
    busy.current = true;
    setSelectedRef.current?.(w.id);
    const payload: WorkspaceNode = {
      id: w.id,
      label: w.label,
      description: w.description,
      color: w.color,
      target: w.target,
      status: w.statusText,
    };
    const started = api.current.glide(w.id, () => openRef.current.onOpen(payload));
    if (!started) openRef.current.onOpen(payload);
  };

  if (status === 'unsupported') {
    return (
      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
        <p className="mb-3 text-xs text-[#7A8BA6]">The 3D view isn’t available on this device.</p>
        <NodeButtons nodes={nodes} onOpen={onOpen} />
      </div>
    );
  }

  const hoveredNode = stageNodes.find((n) => n.id === hovered);
  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" />
      {status === 'loading' && (
        <NodeButtons nodes={nodes} onOpen={onOpen} className="absolute inset-x-4 bottom-4 sm:inset-x-5" />
      )}
      {status === 'ready' && (
        <>
          <ul className="hud-enter-nodes absolute inset-0 pointer-events-none" aria-label="Workspaces">
            {stageNodes.map((n) => (
              <li key={n.id}>
                <button
                  ref={(el) => {
                    if (el) labelRefs.current.set(n.id, el);
                    else labelRefs.current.delete(n.id);
                  }}
                  type="button"
                  onClick={() => openNode(n)}
                  onMouseEnter={() => focusNode(n.id)}
                  onMouseLeave={() => focusNode(null)}
                  onFocus={() => focusNode(n.id)}
                  onBlur={() => focusNode(null)}
                  aria-label={`${n.label}${n.statusText ? `, ${n.statusText}` : ''}. Open workspace`}
                  className="jarvis-node-label hidden md:inline-flex pointer-events-auto absolute left-0 top-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-[#E6F1FF] bg-[rgba(10,16,28,0.72)] border border-[rgba(59,232,255,0.22)] hover:border-[#3BE8FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] cursor-pointer transition-opacity duration-300 data-[depth=back]:opacity-45 hover:opacity-100 focus-visible:opacity-100"
                >
                  <span style={{ color: n.color }}>{renderWorkspaceGlyph(n.glyph, 'w-3 h-3 shrink-0')}</span>
                  <span>{n.shortLabel}</span>
                  {n.hasDueTodayBeam && (
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-[#3BE8FF] shadow-[0_0_6px_#3BE8FF]"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            ref={coreLabelRef}
            type="button"
            onClick={() => onOpenCore()}
            className="absolute left-0 top-0 rounded-full px-3.5 py-1.5 text-[0.6875rem] font-semibold text-[#3BE8FF] bg-[rgba(10,16,28,0.76)] border border-[#3BE8FF]/45 hover:border-[#3BE8FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] cursor-pointer shadow-[0_0_16px_rgba(59,232,255,0.22)]"
          >
            Ask Jarvis
          </button>
          {hoveredNode && tip && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-0 top-0 w-64 rounded-xl border border-[rgba(59,232,255,0.26)] bg-[rgba(10,16,28,0.92)] backdrop-blur-md p-3 shadow-xl z-30"
              style={{
                transform: `translate(${Math.min(Math.max(tip.x, 140), Math.max(140, panelWidth - 140))}px, ${Math.max(
                  10,
                  tip.y - 10
                )}px) translate(-50%, -100%)`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-sm font-semibold text-[#E6F1FF]">{hoveredNode.label}</p>
                <span className="hud-tabular text-[10px] font-semibold" style={{ color: hoveredNode.color }}>
                  {hoveredNode.keyMetric.value}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#7A8BA6] line-clamp-2">{hoveredNode.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hoveredNode.stats.slice(0, 3).map((stat) => (
                  <span
                    key={stat}
                    className="hud-tabular px-2 py-0.5 rounded-md bg-[rgba(59,232,255,0.08)] border border-[rgba(59,232,255,0.18)] text-[10px] text-[#E6F1FF]"
                  >
                    {stat}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
