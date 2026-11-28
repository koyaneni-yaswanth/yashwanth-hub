import React, { useEffect, useRef } from 'react';
import {
  STUDIO_LIGHTING_MOODS,
  type StudioLightingMood,
  type UniverseStationId,
  stationById,
} from '../../lib/universeConfig';
import { settleFactor } from '../momentum/cinema/cinemaConfig';
import { LightingDirector } from '../momentum/cinema/LightingDirector';
import { PostFX } from '../momentum/cinema/PostFX';
import { createProceduralDetailMaps } from '../momentum/cinema/proceduralMaterials';
import {
  JARVIS_CORE_FRAGMENT_SHADER,
  JARVIS_CORE_VERTEX_SHADER,
} from '../jarvis/jarvisShaders';
import {
  AIRFLOW_STREAM_FRAGMENT_SHADER,
  AIRFLOW_STREAM_VERTEX_SHADER,
  STUDIO_FLOOR_FRAGMENT_SHADER,
  STUDIO_FLOOR_VERTEX_SHADER,
  STUDIO_HOLO_FRAGMENT_SHADER,
  STUDIO_HOLO_VERTEX_SHADER,
} from './universeShaders';
import type { CubeActionCommand } from './StudioMonitorOverlay';

interface UniverseStudioSceneProps {
  activeStation: UniverseStationId;
  hoveredStation: UniverseStationId | null;
  onHoverStation: (id: UniverseStationId | null) => void;
  onSelectStation: (id: UniverseStationId) => void;
  whiteboardDataUrl: string | null;
  cubeCommand: CubeActionCommand | null;
  showPins?: boolean;
  lightingMood?: StudioLightingMood;
  entered?: boolean;
  turbineWindMs?: number;
  piperPose?: { shoulderDeg: number; elbowDeg: number } | null;
  statsSummary: {
    openTasks: number;
    projectCount: number;
    roboticsCount: number;
    providersReady: number;
    localOnline: boolean;
  };
  onMetricsUpdate?: (metrics: { tier: string; fps: number; webglActive: boolean }) => void;
  onWebglUnavailable: () => void;
}

const SCENE_PIN_ANCHORS: Array<{
  id: UniverseStationId;
  label: string;
  accent: string;
  pos: readonly [number, number, number];
}> = [
  { id: 'jarvis', label: 'JARVIS Core', accent: '#3BE8FF', pos: [0, 3.02, -1.28] },
  { id: 'robotics', label: 'PiPER Arm', accent: '#38BDF8', pos: [-2.55, 2.06, -0.15] },
  { id: 'energy', label: 'Pawan Turbine', accent: '#34D399', pos: [3.68, 2.48, 0.68] },
  { id: 'whiteboard', label: 'Whiteboard', accent: '#F59E0B', pos: [-4.15, 2.88, -0.45] },
  { id: 'experiment', label: 'Sim Deck', accent: '#EC4899', pos: [-2.15, 1.58, 1.55] },
  { id: 'cube', label: 'Cube', accent: '#F97316', pos: [0.15, 1.78, 0.66] },
];

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function makeRoundedRectShape(THREE: typeof import('three'), w: number, h: number, r: number): import('three').Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function makeRadialShadowTexture(THREE: typeof import('three'), tint = 'rgba(0,0,0,0.65)'): import('three').CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, tint);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMonitorCanvasTexture(
  THREE: typeof import('three'),
  title: string,
  subtitle: string,
  accent: string,
  linesFn: () => string[]
): { tex: import('three').CanvasTexture; draw: (nextLines: string[]) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  let pulsePhase = 0;
  const draw = (currentLines: string[]) => {
    pulsePhase += 1;
    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, '#0B1220');
    bg.addColorStop(0.55, '#070B14');
    bg.addColorStop(1, '#05080F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle internal drafting grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let gx = 48; gx < canvas.width; gx += 64) {
      ctx.beginPath();
      ctx.moveTo(gx, 24);
      ctx.lineTo(gx, canvas.height - 24);
      ctx.stroke();
    }

    // Top accent bar & corner reticle
    ctx.fillStyle = accent;
    ctx.fillRect(46, 44, 148, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(46, 198, 932, 1.5);

    ctx.fillStyle = '#F7F4EE';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(title, 46, 118);

    ctx.fillStyle = accent;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(subtitle, 46, 162);

    // Top-right animated telemetry bars + sinusoidal trace
    for (let i = 0; i < 14; i++) {
      const h = 14 + Math.round(Math.abs(Math.sin(i * 0.65 + pulsePhase * 0.7)) * 46);
      ctx.fillStyle = i % 3 === 0 ? accent : 'rgba(255,255,255,0.22)';
      ctx.fillRect(670 + i * 22, 146 - h, 12, h);
    }

    // Structured sleek content cards per row
    currentLines.slice(0, 4).forEach((ln, idx) => {
      const ry = 232 + idx * 78;
      ctx.fillStyle = idx === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)';
      ctx.fillRect(46, ry, 932, 60);
      ctx.fillStyle = idx === 0 ? accent : 'rgba(255,255,255,0.25)';
      ctx.fillRect(46, ry, 5, 60);

      ctx.font = idx === 0 ? 'bold 28px monospace' : '26px monospace';
      ctx.fillStyle = idx === 0 ? '#FFFFFF' : '#CBD8E8';
      ctx.fillText(ln.slice(0, 48), 72, ry + 39);
    });

    // Bottom status bar & live pill
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(46, 558, 932, 3);
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  };

  draw(linesFn());
  return { tex, draw };
}

export const UniverseStudioScene: React.FC<UniverseStudioSceneProps> = ({
  activeStation,
  hoveredStation,
  onHoverStation,
  onSelectStation,
  whiteboardDataUrl,
  cubeCommand,
  showPins = true,
  lightingMood = 'cinema',
  entered = false,
  turbineWindMs = 6.5,
  piperPose = null,
  statsSummary,
  onMetricsUpdate,
  onWebglUnavailable,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const stateRef = useRef({
    activeStation,
    hoveredStation,
    whiteboardDataUrl,
    showPins,
    lightingMood,
    entered,
    turbineWindMs,
    piperPose,
    statsSummary,
  });

  const onHoverRef = useRef(onHoverStation);
  const onSelectRef = useRef(onSelectStation);
  const onMetricsRef = useRef(onMetricsUpdate);
  const onFallbackRef = useRef(onWebglUnavailable);

  useEffect(() => {
    stateRef.current = {
      activeStation,
      hoveredStation,
      whiteboardDataUrl,
      showPins,
      lightingMood,
      entered,
      turbineWindMs,
      piperPose,
      statsSummary,
    };
    onHoverRef.current = onHoverStation;
    onSelectRef.current = onSelectStation;
    onMetricsRef.current = onMetricsUpdate;
    onFallbackRef.current = onWebglUnavailable;
  }, [
    activeStation,
    hoveredStation,
    whiteboardDataUrl,
    showPins,
    lightingMood,
    entered,
    turbineWindMs,
    piperPose,
    statsSummary,
    onHoverStation,
    onSelectStation,
    onMetricsUpdate,
    onWebglUnavailable,
  ]);

  const cubeQueueRef = useRef<CubeActionCommand[]>([]);
  useEffect(() => {
    if (cubeCommand) cubeQueueRef.current.push(cubeCommand);
  }, [cubeCommand]);

  const whiteboardUpdateRef = useRef<((url: string) => void) | null>(null);
  useEffect(() => {
    if (whiteboardDataUrl && whiteboardUpdateRef.current) {
      whiteboardUpdateRef.current(whiteboardDataUrl);
    }
  }, [whiteboardDataUrl]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let mounted = true;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import('three');
        const [
          { OrbitControls },
          { EffectComposer },
          { RenderPass },
          { UnrealBloomPass },
          { OutputPass },
          { ShaderPass },
          { RoomEnvironment },
        ] = await Promise.all([
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/postprocessing/EffectComposer.js'),
          import('three/examples/jsm/postprocessing/RenderPass.js'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/postprocessing/OutputPass.js'),
          import('three/examples/jsm/postprocessing/ShaderPass.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        if (!mounted || !mount) return;

        let renderer: import('three').WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        } catch {
          onFallbackRef.current();
          return;
        }

        const isMobile = window.innerWidth < 768;
        const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75);
        const width = Math.max(320, mount.clientWidth || window.innerWidth);
        const height = Math.max(300, mount.clientHeight || window.innerHeight);

        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.96;
        mount.innerHTML = '';
        mount.appendChild(renderer.domElement);

        const moodInit = STUDIO_LIGHTING_MOODS[stateRef.current.lightingMood] || STUDIO_LIGHTING_MOODS.cinema;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(moodInit.bgHex);
        scene.fog = new THREE.FogExp2(moodInit.fogHex, 0.026);

        const startMeta = stationById(stateRef.current.activeStation);
        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 90);
        if (!stateRef.current.entered && stateRef.current.activeStation === 'overview') {
          camera.position.set(0.28, 3.82, 9.7);
        } else {
          camera.position.set(...startMeta.cameraPos);
        }

        const orbit = new OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.065;
        orbit.maxPolarAngle = Math.PI * 0.485;
        orbit.minDistance = 1.6;
        orbit.maxDistance = 14.5;
        orbit.target.set(...startMeta.lookAt);

        // Procedural Studio HDR + Three-Point Lighting + Clean Bloom PostFX
        const lighting = new LightingDirector(THREE, renderer, scene, RoomEnvironment, {
          shadows: isMobile ? 'off' : 'medium',
          keyColor: moodInit.keyHex,
          rimColor: moodInit.rimHex,
          coreColor: 0xc6a46b,
        });
        lighting.keyLight.intensity = moodInit.keyIntensity;
        lighting.coreLight.intensity = 7.5;
        lighting.coreLight.position.set(0, 2.98, -1.22);
        scene.add(lighting.coreLight);

        const studioRimLight = new THREE.DirectionalLight(moodInit.rimHex, 0.9);
        studioRimLight.position.set(4.5, 4.2, -3.5);
        scene.add(studioRimLight);

        // Subtle warm architectural task lamp illumination on left desk wing
        const deskLampLight = new THREE.PointLight('#FFCF8B', 3.4, 4.8, 1.8);
        deskLampLight.position.set(-2.22, 1.62, -0.82);
        scene.add(deskLampLight);

        const postfx = new PostFX(
          THREE,
          { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass },
          renderer,
          scene,
          camera,
          { width, height },
          {
            bloom: !isMobile,
            grain: !isMobile,
            chromaticAberration: false,
            renderScale: isMobile ? 0.9 : 1,
            bloomThreshold: 0.91,
            bloomStrength: 0.13,
          }
        );

        const pbrMaps = createProceduralDetailMaps(THREE);
        const managedGeos: import('three').BufferGeometry[] = [];
        const managedMats: import('three').Material[] = [];
        const managedTexs: import('three').Texture[] = [];
        const trackGeo = <T extends import('three').BufferGeometry>(g: T): T => {
          managedGeos.push(g);
          return g;
        };
        const trackMat = <T extends import('three').Material>(m: T): T => {
          managedMats.push(m);
          return m;
        };

        // Procedural Studio Materials with PMREM specular reflections
        const obsidianMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#111621',
            metalness: 0.45,
            roughness: 0.42,
            roughnessMap: pbrMaps.metalRoughness,
            bumpMap: pbrMaps.metalBump,
            bumpScale: 0.008,
          })
        );
        const titaniumMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#2A3446',
            metalness: 0.88,
            roughness: 0.24,
            roughnessMap: pbrMaps.metalRoughness,
            bumpMap: pbrMaps.metalBump,
            bumpScale: 0.01,
          })
        );
        const brassMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#C6A46B',
            metalness: 0.92,
            roughness: 0.2,
            roughnessMap: pbrMaps.metalRoughness,
            emissive: '#4A3615',
            emissiveIntensity: 0.22,
          })
        );
        const cyanEmitMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#3BE8FF',
            emissive: '#3BE8FF',
            emissiveIntensity: 1.3,
            metalness: 0.3,
            roughness: 0.2,
          })
        );
        const coveEmitMat = trackMat(
          new THREE.MeshBasicMaterial({ color: moodInit.coveHex })
        );
        const shadowTex = makeRadialShadowTexture(THREE);
        managedTexs.push(shadowTex);

        // Custom GLSL Studio Floor with interactive cursor spotlight
        const cursorWorld = new THREE.Vector3(0, 0, 0);
        const floorUniforms = {
          uTime: { value: 0 },
          uCursorWorld: { value: cursorWorld },
          uAccentGold: { value: new THREE.Color('#C6A46B') },
          uAccentSteel: { value: new THREE.Color('#8BA8C8') },
          uFloorBase: { value: new THREE.Color(moodInit.floorHex) },
        };
        const floorMat = trackMat(
          new THREE.ShaderMaterial({
            uniforms: floorUniforms,
            vertexShader: STUDIO_FLOOR_VERTEX_SHADER,
            fragmentShader: STUDIO_FLOOR_FRAGMENT_SHADER,
            transparent: true,
          })
        );
        const floorMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(42, 42)), floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);

        // Architectural Studio Room: Curved Acoustic Matte Cyclorama + Instanced Slat Wall + Cove Strips
        const wallMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#111724',
            metalness: 0.18,
            roughness: 0.78,
            side: THREE.BackSide,
          })
        );
        const cycWall = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(7.6, 7.6, 5.4, 56, 1, true, Math.PI * 0.42, Math.PI * 1.16)),
          wallMat
        );
        cycWall.position.set(0, 2.7, -0.35);
        cycWall.receiveShadow = true;
        scene.add(cycWall);

        // Instanced vertical walnut/titanium acoustic ribs around rear curve (1 draw call!)
        const ribCount = isMobile ? 16 : 26;
        const ribGeo = trackGeo(new THREE.BoxGeometry(0.11, 4.35, 0.08));
        const ribMat = trackMat(
          new THREE.MeshStandardMaterial({ color: '#1E2534', metalness: 0.46, roughness: 0.4 })
        );
        const ribInst = new THREE.InstancedMesh(ribGeo, ribMat, ribCount);
        const ribDummy = new THREE.Object3D();
        for (let r = 0; r < ribCount; r++) {
          const frac = r / (ribCount - 1);
          const ang = Math.PI * 0.56 + frac * Math.PI * 0.88;
          const rx = Math.sin(ang) * 7.36;
          const rz = Math.cos(ang) * 7.36 - 0.35;
          ribDummy.position.set(rx, 2.25, rz);
          ribDummy.rotation.y = ang + Math.PI;
          ribDummy.updateMatrix();
          ribInst.setMatrixAt(r, ribDummy.matrix);
        }
        ribInst.instanceMatrix.needsUpdate = true;
        scene.add(ribInst);

        // Recessed upper soffit + floor plinth cove LED rings
        const lowerCove = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(7.28, 0.016, 8, 64, Math.PI * 0.94)),
          coveEmitMat
        );
        lowerCove.rotation.x = Math.PI / 2;
        lowerCove.rotation.z = Math.PI * 0.03;
        lowerCove.position.set(0, 0.035, -0.35);
        const upperCove = lowerCove.clone();
        upperCove.position.y = 4.42;
        scene.add(lowerCove, upperCove);

        // Back wall etched titanium header plaque
        const plaqueCanvas = document.createElement('canvas');
        plaqueCanvas.width = 1024;
        plaqueCanvas.height = 160;
        const pCtx = plaqueCanvas.getContext('2d')!;
        pCtx.fillStyle = '#0D131F';
        pCtx.fillRect(0, 0, 1024, 160);
        pCtx.strokeStyle = 'rgba(198,164,107,0.45)';
        pCtx.lineWidth = 3;
        pCtx.strokeRect(10, 10, 1004, 140);
        pCtx.fillStyle = '#C6A46B';
        pCtx.font = 'bold 20px monospace';
        pCtx.textAlign = 'center';
        pCtx.fillText('VNIT NAGPUR · PAWAN SHAKTI · JARVIS 5.0', 512, 54);
        pCtx.fillStyle = '#F5F3EF';
        pCtx.font = 'bold 42px sans-serif';
        pCtx.fillText('YASHWANTH · DIGITAL ENGINEERING STUDIO', 512, 114);
        const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
        plaqueTex.colorSpace = THREE.SRGBColorSpace;
        managedTexs.push(plaqueTex);
        const plaqueMesh = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(3.8, 0.6)),
          trackMat(new THREE.MeshBasicMaterial({ map: plaqueTex }))
        );
        plaqueMesh.position.set(0, 4.02, -4.65);
        scene.add(plaqueMesh);

        // Soft studio ambient motes
        const particleCount = isMobile ? 55 : 140;
        const pPositions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          pPositions[i * 3] = (Math.random() - 0.5) * 14;
          pPositions[i * 3 + 1] = 0.6 + Math.random() * 4.4;
          pPositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
        }
        const pGeo = trackGeo(new THREE.BufferGeometry());
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
        const pMat = trackMat(new THREE.PointsMaterial({ color: '#C6A46B', size: 0.032, transparent: true, opacity: 0.42 }));
        const dustPoints = new THREE.Points(pGeo, pMat);
        scene.add(dustPoints);

        // Sculpted Chamfered Architectural Engineering Desk (ExtrudeGeometry with Bevel!)
        const deskGroup = new THREE.Group();
        const slabShape = makeRoundedRectShape(THREE, 6.6, 2.9, 0.24);
        const slabGeo = trackGeo(
          new THREE.ExtrudeGeometry(slabShape, {
            depth: 0.09,
            bevelEnabled: true,
            bevelThickness: 0.025,
            bevelSize: 0.025,
            bevelSegments: 3,
          })
        );
        slabGeo.rotateX(Math.PI / 2);
        const deskSlab = new THREE.Mesh(slabGeo, obsidianMat);
        deskSlab.position.set(0, 1.07, -0.35);
        deskSlab.castShadow = true;
        deskSlab.receiveShadow = true;

        // Brass perimeter inlay strip + architectural monitor bar
        const inlayShape = makeRoundedRectShape(THREE, 6.66, 2.96, 0.26);
        const inlayGeo = trackGeo(new THREE.ExtrudeGeometry(inlayShape, { depth: 0.018, bevelEnabled: false }));
        inlayGeo.rotateX(Math.PI / 2);
        const deskInlay = new THREE.Mesh(inlayGeo, brassMat);
        deskInlay.position.set(0, 1.03, -0.35);

        // Tactile Stitched Neoprene Desk Mat + CNC Mechanical Keyboard + Mouse + Espresso Cup
        const matGeo = trackGeo(
          new THREE.ExtrudeGeometry(makeRoundedRectShape(THREE, 2.35, 0.84, 0.06), {
            depth: 0.008,
            bevelEnabled: false,
          })
        );
        matGeo.rotateX(Math.PI / 2);
        const deskMat = new THREE.Mesh(
          matGeo,
          trackMat(new THREE.MeshStandardMaterial({ color: '#171E2C', roughness: 0.85, metalness: 0.08 }))
        );
        deskMat.position.set(0.05, 1.1, 0.28);

        const kbBody = new THREE.Mesh(
          trackGeo(
            new THREE.ExtrudeGeometry(makeRoundedRectShape(THREE, 0.72, 0.24, 0.02), {
              depth: 0.022,
              bevelEnabled: true,
              bevelThickness: 0.005,
              bevelSize: 0.005,
              bevelSegments: 2,
            })
          ),
          titaniumMat
        );
        kbBody.rotation.x = Math.PI / 2;
        kbBody.position.set(-0.22, 1.128, 0.28);

        const keyCapGeo = trackGeo(new THREE.BoxGeometry(0.032, 0.014, 0.032));
        const keyCapMat = trackMat(new THREE.MeshStandardMaterial({ color: '#202837', roughness: 0.42, metalness: 0.2 }));
        const keyInst = new THREE.InstancedMesh(keyCapGeo, keyCapMat, 48);
        const kDummy = new THREE.Object3D();
        let ki = 0;
        for (let kr = 0; kr < 4; kr++) {
          for (let kc = 0; kc < 12; kc++) {
            kDummy.position.set(-0.5 + kc * 0.046, 1.132, 0.21 + kr * 0.046);
            kDummy.updateMatrix();
            keyInst.setMatrixAt(ki++, kDummy.matrix);
          }
        }
        keyInst.instanceMatrix.needsUpdate = true;

        const cadMouse = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.038, 0.055, 6, 14)), titaniumMat);
        cadMouse.rotation.x = Math.PI / 2;
        cadMouse.scale.y = 0.65;
        cadMouse.position.set(-0.78, 1.118, 0.3);

        // Signature Machined Aluminum Coffee Cup (Studio Espresso)
        const mugGroup = new THREE.Group();
        mugGroup.position.set(0.88, 1.1, 0.32);
        const mugWall = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.058, 0.05, 0.125, 24)), titaniumMat);
        mugWall.position.y = 0.064;
        const mugCoffee = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20)),
          trackMat(new THREE.MeshStandardMaterial({ color: '#3E2212', roughness: 0.15, metalness: 0.1 }))
        );
        mugCoffee.position.y = 0.118;
        const mugHandle = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.032, 0.008, 8, 20, Math.PI)), brassMat);
        mugHandle.rotation.z = -Math.PI / 2;
        mugHandle.position.set(0.055, 0.068, 0);
        mugGroup.add(mugWall, mugCoffee, mugHandle);

        // Articulated Brass & Titanium Task Lamp on Left Desk Wing (clear of monitors & arm)
        const lampGroup = new THREE.Group();
        lampGroup.position.set(-2.36, 1.09, -1.04);
        lampGroup.rotation.y = 0.42;
        const lampBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.12, 0.032, 24)), brassMat);
        lampBase.position.y = 0.016;
        const lampCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.028, 0),
          new THREE.Vector3(-0.06, 0.28, -0.04),
          new THREE.Vector3(0.05, 0.52, 0.09),
          new THREE.Vector3(0.15, 0.54, 0.19),
        ]);
        const lampNeck = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(lampCurve, 18, 0.013, 10, false)), titaniumMat);
        const lampShade = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.095, 0.12, 24)), brassMat);
        lampShade.position.set(0.15, 0.51, 0.21);
        lampShade.rotation.x = 0.42;
        lampGroup.add(lampBase, lampNeck, lampShade);

        // Angled A-frame pedestal legs
        for (const lx of [-2.85, 2.85]) {
          const legPostF = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.075, 1.02, 16)), titaniumMat);
          legPostF.position.set(lx, 0.5, 0.65);
          legPostF.rotation.x = 0.14;
          const legPostB = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.075, 1.02, 16)), titaniumMat);
          legPostB.position.set(lx, 0.5, -1.25);
          legPostB.rotation.x = -0.14;
          const runner = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.06, 2.2)), brassMat);
          runner.position.set(lx, 0.03, -0.3);
          deskGroup.add(legPostF, legPostB, runner);
        }

        // Suspended overhead architectural light bar casting warm illumination onto the bench
        const lightBarMat = trackMat(new THREE.MeshBasicMaterial({ color: '#E8D5B0' }));
        const overheadBar = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.026, 3.9, 8, 16)), lightBarMat);
        overheadBar.rotation.z = Math.PI / 2;
        overheadBar.position.set(0, 3.16, -0.82);
        const cableL = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 2.5, 8)), titaniumMat);
        cableL.position.set(-1.6, 4.41, -0.82);
        const cableR = cableL.clone();
        cableR.position.x = 1.6;

        deskGroup.add(
          deskSlab,
          deskInlay,
          deskMat,
          kbBody,
          keyInst,
          cadMouse,
          mugGroup,
          lampGroup,
          overheadBar,
          cableL,
          cableR
        );
        scene.add(deskGroup);

        // Centerpiece Halo: Floating JARVIS Holographic Gyro-Core above center console
        const gyroGroup = new THREE.Group();
        gyroGroup.position.set(0, 2.72, -1.28);
        const coreShaderMat = trackMat(
          new THREE.ShaderMaterial({
            uniforms: {
              uTime: { value: 0 },
              uPulseRate: { value: 0.45 },
              uDispAmp: { value: 0.045 },
              uPrimaryColor: { value: new THREE.Color('#3BE8FF') },
              uSecondaryColor: { value: new THREE.Color('#C6A46B') },
              uEnergy: { value: 0.75 },
            },
            vertexShader: JARVIS_CORE_VERTEX_SHADER,
            fragmentShader: JARVIS_CORE_FRAGMENT_SHADER,
            transparent: true,
          })
        );
        const gyroCoreMesh = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(0.18, 3)), coreShaderMat);
        const gRing1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.28, 0.012, 12, 48)), brassMat);
        const gRing2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.34, 0.01, 12, 48)), cyanEmitMat);
        gRing2.rotation.x = Math.PI / 3;
        gyroGroup.add(gyroCoreMesh, gRing1, gRing2);
        scene.add(gyroGroup);

        const interactiveTargets: import('three').Object3D[] = [];
        const monitorHoloUniforms = new Map<UniverseStationId, { uHovered: { value: number }; uTime: { value: number } }>();

        const registerInteractive = (obj: import('three').Object3D, id: UniverseStationId) => {
          obj.traverse((child) => {
            child.userData.stationId = id;
          });
          interactiveTargets.push(obj);
        };

        // Sculpted Extruded Chamfered Monitors with Articulated Cantilever Arms
        const monitorTexUpdaters: Array<() => void> = [];
        const bezelShape = makeRoundedRectShape(THREE, 1.42, 0.88, 0.06);
        const bezelGeo = trackGeo(
          new THREE.ExtrudeGeometry(bezelShape, {
            depth: 0.045,
            bevelEnabled: true,
            bevelThickness: 0.012,
            bevelSize: 0.012,
            bevelSegments: 2,
          })
        );

        const addMonitor = (
          id: UniverseStationId,
          title: string,
          subtitle: string,
          accent: string,
          linesFn: () => string[],
          pos: [number, number, number],
          rotY: number
        ) => {
          const g = new THREE.Group();
          g.position.set(...pos);
          g.rotation.y = rotY;

          const bezel = new THREE.Mesh(bezelGeo, titaniumMat);
          bezel.position.z = -0.025;
          bezel.castShadow = true;

          // Sculpted articulated desk arm + foot base
          const neckCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, -0.03),
            new THREE.Vector3(0, -0.25, -0.18),
            new THREE.Vector3(0, -0.78, -0.14),
          ]);
          const arm = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(neckCurve, 14, 0.028, 10, false)), titaniumMat);
          const armBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.035, 20)), brassMat);
          armBase.position.set(0, -0.78, -0.14);

          const chinAccent = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(0.32, 0.014, 0.018)),
            trackMat(new THREE.MeshBasicMaterial({ color: accent }))
          );
          chinAccent.position.set(0, -0.415, 0.032);

          g.add(bezel, arm, armBase, chinAccent);

          const scr = makeMonitorCanvasTexture(THREE, title, subtitle, accent, linesFn);
          managedTexs.push(scr.tex);
          monitorTexUpdaters.push(() => scr.draw(linesFn()));

          const scrMesh = new THREE.Mesh(
            trackGeo(new THREE.PlaneGeometry(1.3, 0.76)),
            trackMat(new THREE.MeshBasicMaterial({ map: scr.tex }))
          );
          scrMesh.position.z = 0.035;
          g.add(scrMesh);

          const holoUni = { uTime: { value: 0 }, uColor: { value: new THREE.Color(accent) }, uHovered: { value: 0 } };
          monitorHoloUniforms.set(id, holoUni);
          const holoFrame = new THREE.Mesh(
            trackGeo(new THREE.PlaneGeometry(1.44, 0.9)),
            trackMat(
              new THREE.ShaderMaterial({
                uniforms: holoUni,
                vertexShader: STUDIO_HOLO_VERTEX_SHADER,
                fragmentShader: STUDIO_HOLO_FRAGMENT_SHADER,
                transparent: true,
                depthWrite: false,
              })
            )
          );
          holoFrame.position.z = 0.04;
          g.add(holoFrame);

          registerInteractive(g, id);
          scene.add(g);
        };

        addMonitor(
          'about',
          'ABOUT ME',
          'MONITOR 01 · IDENTITY',
          '#C6A46B',
          () => ['Yashwanth · VNIT Nagpur', 'PAWAN SHAKTI Wind Founder', 'Robotics & AI Systems', 'Click to read profile'],
          [-1.56, 1.86, -1.26],
          0.32
        );
        addMonitor(
          'projects',
          'PROJECTS',
          'MONITOR 02 · ARCHIVE',
          '#8BA8C8',
          () => [
            `Tracked Projects: ${stateRef.current.statsSummary.projectCount}`,
            `Open Actions: ${stateRef.current.statsSummary.openTasks}`,
            'Wind · Robotics · Software',
            'Click to open Projects',
          ],
          [0.0, 1.88, -1.48],
          0.0
        );
        addMonitor(
          'jarvis',
          'JARVIS CORE',
          'MONITOR 03 · COMPANION',
          '#3BE8FF',
          () => [
            `Cloud Providers: ${stateRef.current.statsSummary.providersReady} active`,
            `Local Agent: ${stateRef.current.statsSummary.localOnline ? 'ONLINE' : 'UNPAIRED'}`,
            'Gemini · GPT · Claude · Ollama',
            'Click for live AI terminal',
          ],
          [1.56, 1.86, -1.26],
          -0.32
        );
        addMonitor(
          'research',
          'SYSTEM / LABS',
          'MONITOR 04 · TELEMETRY',
          '#A78BFA',
          () => [
            `Lab Records: ${stateRef.current.statsSummary.roboticsCount}`,
            `Mood: ${(stateRef.current.lightingMood || 'cinema').toUpperCase()}`,
            `Turbine Wind: ${(stateRef.current.turbineWindMs ?? 6.5).toFixed(1)} m/s`,
            'Click for diagnostics',
          ],
          [2.84, 1.84, -0.74],
          -0.46
        );

        // Dynamic Desk/Floor Beacon Halo (glides on the actual desk surface or floor beneath each station)
        const beaconSpots: Record<UniverseStationId, readonly [number, number, number, number]> = {
          overview: [0.15, 1.12, 0.25, 0.01],
          about: [-1.56, 1.12, -1.4, 0.44],
          projects: [0.0, 1.12, -1.62, 0.46],
          jarvis: [1.56, 1.12, -1.4, 0.46],
          research: [2.84, 1.12, -0.88, 0.44],
          robotics: [-2.55, 1.12, -0.15, 0.64],
          energy: [3.68, 0.04, 0.68, 0.96],
          whiteboard: [-4.15, 0.04, -0.45, 1.1],
          experiment: [-2.15, 0.04, 1.55, 0.68],
          cube: [0.15, 1.12, 0.72, 0.56],
          workspace: [0.0, 1.12, 0.28, 0.85],
        };
        const beaconGroup = new THREE.Group();
        const beaconOuterMat = trackMat(
          new THREE.MeshBasicMaterial({ color: '#3BE8FF', transparent: true, opacity: 0.78 })
        );
        const beaconTargetColor = new THREE.Color('#3BE8FF');
        const beaconOuter = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(0.62, 0.016, 10, 48)),
          beaconOuterMat
        );
        beaconOuter.rotation.x = Math.PI / 2;
        const beaconInner = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(0.46, 0.011, 10, 42)),
          trackMat(new THREE.MeshBasicMaterial({ color: '#C6A46B', transparent: true, opacity: 0.82 }))
        );
        beaconInner.rotation.x = Math.PI / 2;
        beaconGroup.add(beaconOuter, beaconInner);
        beaconGroup.scale.setScalar(0.01);
        scene.add(beaconGroup);

        // Station 05: Sculpted PiPER 6-DOF Robotic Arm on Plinth
        const roboticsGroup = new THREE.Group();
        roboticsGroup.position.set(-2.55, 1.09, -0.15);
        const rPlinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.04, 32)), obsidianMat);
        rPlinth.position.y = 0.02;
        const rRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.34, 0.012, 12, 36)), cyanEmitMat);
        rRing.rotation.x = Math.PI / 2;
        rRing.position.y = 0.02;
        const rPedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 0.14, 24)), titaniumMat);
        rPedestal.position.y = 0.11;

        const rShoulder = new THREE.Group();
        rShoulder.position.y = 0.2;
        const j1Servo = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 20)), brassMat);
        j1Servo.rotation.x = Math.PI / 2;
        // Twin CNC side struts
        const strutL = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.036, 0.44, 6, 12)), titaniumMat);
        strutL.position.set(0, 0.26, 0.045);
        const strutR = strutL.clone();
        strutR.position.z = -0.045;

        const rElbow = new THREE.Group();
        rElbow.position.y = 0.52;
        const j2Servo = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 20)), cyanEmitMat);
        j2Servo.rotation.x = Math.PI / 2;
        const rForearm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.038, 0.055, 0.46, 18)), brassMat);
        rForearm.position.y = 0.23;
        const wrist = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 16, 16)), titaniumMat);
        wrist.position.y = 0.48;
        const jawL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.018, 0.12, 0.03)), cyanEmitMat);
        jawL.position.set(-0.04, 0.55, 0);
        const jawR = jawL.clone();
        jawR.position.x = 0.04;

        rElbow.add(j2Servo, rForearm, wrist, jawL, jawR);
        rShoulder.add(j1Servo, strutL, strutR, rElbow);
        roboticsGroup.add(rPlinth, rRing, rPedestal, rShoulder);
        registerInteractive(roboticsGroup, 'robotics');
        scene.add(roboticsGroup);

        // Station 06: Sculpted PAWAN SHAKTI Helical Wind Turbine on Architectural Side Test Stand (zero Monitor 04 overlap)
        const energyGroup = new THREE.Group();
        energyGroup.position.set(3.68, 1.09, 0.68);
        const eStandColumn = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.26, 1.09, 24)), obsidianMat);
        eStandColumn.position.y = -0.545;
        const eStandFloorCollar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.46, 0.04, 32)), titaniumMat);
        eStandFloorCollar.position.y = -1.07;
        const ePlinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.04, 32)), obsidianMat);
        ePlinth.position.y = 0.02;
        const eCollar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.34, 0.012, 10, 32)), brassMat);
        eCollar.rotation.x = Math.PI / 2;
        eCollar.position.y = 0.035;
        const eMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.072, 0.94, 24)), titaniumMat);
        eMast.position.y = 0.47;

        const nacelleProfile = [
          new THREE.Vector2(0.01, -0.25),
          new THREE.Vector2(0.11, -0.22),
          new THREE.Vector2(0.145, -0.05),
          new THREE.Vector2(0.135, 0.16),
          new THREE.Vector2(0.08, 0.24),
        ];
        const eNacelle = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(nacelleProfile, 28)), titaniumMat);
        eNacelle.rotation.x = Math.PI / 2;
        eNacelle.position.set(0, 0.94, -0.04);

        const statorCoil = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.145, 0.022, 12, 32)), brassMat);
        statorCoil.position.set(0, 0.94, 0.08);

        const tRotor = new THREE.Group();
        tRotor.position.set(0, 0.94, 0.2);
        const bladeMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#34D399',
            metalness: 0.5,
            roughness: 0.26,
            emissive: '#064E3B',
            emissiveIntensity: 0.25,
          })
        );
        for (let i = 0; i < 3; i++) {
          const pts: import('three').Vector3[] = [];
          for (let s = 0; s <= 12; s++) {
            const u = s / 12;
            const twist = u * 1.45;
            pts.push(new THREE.Vector3(Math.sin(twist) * 0.14, u * 0.56, -u * 0.24));
          }
          const bladeCurve = new THREE.CatmullRomCurve3(pts);
          const bladeGeo = trackGeo(new THREE.TubeGeometry(bladeCurve, 20, 0.042, 10, false));
          bladeGeo.scale(1.65, 1, 0.35);
          const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
          const holder = new THREE.Group();
          holder.rotation.z = (i * Math.PI * 2) / 3;
          holder.add(bladeMesh);
          tRotor.add(holder);
        }
        const hubProfile = [
          new THREE.Vector2(0.0, 0.15),
          new THREE.Vector2(0.06, 0.08),
          new THREE.Vector2(0.095, 0.0),
          new THREE.Vector2(0.095, -0.04),
        ];
        const tHub = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(hubProfile, 24)), brassMat);
        tHub.rotation.x = Math.PI / 2;
        tHub.position.z = 0.04;
        tRotor.add(tHub);

        const airflowUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#34D399') } };
        const airflowRibbon = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(1.15, 0.12, 24, 1)),
          trackMat(
            new THREE.ShaderMaterial({
              uniforms: airflowUniforms,
              vertexShader: AIRFLOW_STREAM_VERTEX_SHADER,
              fragmentShader: AIRFLOW_STREAM_FRAGMENT_SHADER,
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          )
        );
        airflowRibbon.rotation.y = Math.PI / 2;
        airflowRibbon.position.set(0.32, 0.94, 0.15);

        energyGroup.add(eStandColumn, eStandFloorCollar, ePlinth, eCollar, eMast, eNacelle, statorCoil, tRotor, airflowRibbon);
        registerInteractive(energyGroup, 'energy');
        scene.add(energyGroup);

        // Station 07: Sculpted Architectural Easel Whiteboard + Tray with Colored Markers
        const wbGroup = new THREE.Group();
        wbGroup.position.set(-4.15, 2.02, -0.45);
        wbGroup.rotation.y = 1.15;
        const wbBezel = new THREE.Mesh(
          trackGeo(new THREE.ExtrudeGeometry(makeRoundedRectShape(THREE, 2.38, 1.34, 0.05), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 })),
          titaniumMat
        );
        wbBezel.position.z = -0.025;
        const wbTray = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.035, 0.1)), brassMat);
        wbTray.position.set(0, -0.68, 0.06);
        const easelLegL = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.03, 2.3, 12)), titaniumMat);
        easelLegL.position.set(-0.9, -1.0, -0.1);
        const easelLegR = easelLegL.clone();
        easelLegR.position.x = 0.9;
        // 4 tactile colored markers on the tray
        ['#14171C', '#DC2626', '#059669', '#2563EB'].forEach((mc, idx) => {
          const m = new THREE.Mesh(
            trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 12)),
            trackMat(new THREE.MeshStandardMaterial({ color: mc, roughness: 0.35 }))
          );
          m.rotation.z = Math.PI / 2;
          m.position.set(-0.45 + idx * 0.22, -0.65, 0.08);
          wbGroup.add(m);
        });

        const wbCanvas = document.createElement('canvas');
        wbCanvas.width = 768;
        wbCanvas.height = 405;
        const wbCtx = wbCanvas.getContext('2d')!;
        wbCtx.fillStyle = '#CFCAC0';
        wbCtx.fillRect(0, 0, 768, 405);
        wbCtx.strokeStyle = 'rgba(20,23,28,0.08)';
        wbCtx.lineWidth = 1;
        for (let gx = 32; gx < 768; gx += 32) {
          wbCtx.beginPath();
          wbCtx.moveTo(gx, 0);
          wbCtx.lineTo(gx, 405);
          wbCtx.stroke();
        }
        wbCtx.fillStyle = '#14171C';
        wbCtx.font = 'bold 30px sans-serif';
        wbCtx.fillText('ENGINEERING WHITEBOARD', 48, 185);
        wbCtx.fillStyle = '#6B532F';
        wbCtx.font = '20px monospace';
        wbCtx.fillText('CLICK TO SKETCH · SYNC WITH JARVIS', 48, 228);
        const wbTex = new THREE.CanvasTexture(wbCanvas);
        wbTex.colorSpace = THREE.SRGBColorSpace;
        managedTexs.push(wbTex);
        whiteboardUpdateRef.current = (dataUrl: string) => {
          const img = new Image();
          img.onload = () => {
            wbCtx.clearRect(0, 0, 768, 405);
            wbCtx.drawImage(img, 0, 0, 768, 405);
            wbTex.needsUpdate = true;
          };
          img.src = dataUrl;
        };
        if (stateRef.current.whiteboardDataUrl) whiteboardUpdateRef.current(stateRef.current.whiteboardDataUrl);

        const wbSurface = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(2.24, 1.2)),
          trackMat(new THREE.MeshBasicMaterial({ map: wbTex }))
        );
        wbSurface.position.z = 0.036;
        wbGroup.add(wbBezel, wbTray, easelLegL, easelLegR, wbSurface);
        registerInteractive(wbGroup, 'whiteboard');
        scene.add(wbGroup);

        // Station 08: Sleek Industrial Simulation Console (inclined anodized aluminum + brass rotary dials!)
        const expGroup = new THREE.Group();
        expGroup.position.set(-2.15, 0.88, 1.55);
        expGroup.rotation.y = 0.52;
        const expPedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.26, 0.9, 24)), obsidianMat);
        expPedestal.position.y = -0.45;
        const expChassis = new THREE.Mesh(
          trackGeo(new THREE.ExtrudeGeometry(makeRoundedRectShape(THREE, 0.86, 0.72, 0.07), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 2 })),
          titaniumMat
        );
        expChassis.position.set(0, 0.22, -0.04);
        expChassis.rotation.x = -0.38;
        const expScreenScr = makeMonitorCanvasTexture(
          THREE,
          'EXPERIMENTS',
          'SIMULATION DECK',
          '#EC4899',
          () => ['01 Wind TSR Envelope', '02 Planar 2-Link IK', '03 77 GHz Chirp Wave', 'Click to simulate']
        );
        managedTexs.push(expScreenScr.tex);
        const expScrMesh = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(0.72, 0.44)),
          trackMat(new THREE.MeshBasicMaterial({ map: expScreenScr.tex }))
        );
        expScrMesh.position.set(0, 0.24, 0.115);
        expScrMesh.rotation.x = -0.38;
        // Brass rotary knobs along console chin
        for (const kx of [-0.22, 0, 0.22]) {
          const knob = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.035, 0.04, 16)), brassMat);
          knob.rotation.x = Math.PI / 2 - 0.38;
          knob.position.set(kx, -0.02, 0.21);
          expGroup.add(knob);
        }
        expGroup.add(expPedestal, expChassis, expScrMesh);
        registerInteractive(expGroup, 'experiment');
        scene.add(expGroup);

        // Station 09: Precision Satin Speedcube Rubik Calibration Cube on Brass Turntable
        const cubePlinthGroup = new THREE.Group();
        cubePlinthGroup.position.set(0.15, 1.1, 0.72);
        const cTray = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.31, 0.026, 32)), obsidianMat);
        cTray.position.y = 0.013;
        const cRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.295, 0.008, 10, 36)), brassMat);
        cRim.rotation.x = Math.PI / 2;
        cRim.position.y = 0.024;
        cubePlinthGroup.add(cTray, cRim);
        scene.add(cubePlinthGroup);

        const cubeRoot = new THREE.Group();
        cubeRoot.position.set(0.15, 1.4, 0.72);
        const cubePivot = new THREE.Group();
        cubeRoot.add(cubePivot);

        const cubies: import('three').Group[] = [];
        const coreBlackMat = trackMat(new THREE.MeshStandardMaterial({ color: '#0A0D14', metalness: 0.28, roughness: 0.56 }));
        const stickerColors = ['#DC2626', '#EA580C', '#AEB6C2', '#CA8A04', '#16A34A', '#2563EB']; // +X,-X,+Y,-Y,+Z,-Z (glare-free satin)
        const stickerMats = stickerColors.map((hex) =>
          trackMat(new THREE.MeshStandardMaterial({ color: hex, metalness: 0.08, roughness: 0.44 }))
        );
        const cubieBodyGeo = trackGeo(new THREE.BoxGeometry(0.106, 0.106, 0.106));
        const tileGeo = trackGeo(new THREE.BoxGeometry(0.088, 0.088, 0.006));

        for (let cx = -1; cx <= 1; cx++) {
          for (let cy = -1; cy <= 1; cy++) {
            for (let cz = -1; cz <= 1; cz++) {
              const cell = new THREE.Group();
              const inner = new THREE.Mesh(cubieBodyGeo, coreBlackMat);
              cell.add(inner);

              // Attach raised satin outer color tiles ONLY on exposed exterior faces!
              if (cx === 1) {
                const t = new THREE.Mesh(tileGeo, stickerMats[0]);
                t.rotation.y = Math.PI / 2;
                t.position.x = 0.055;
                cell.add(t);
              }
              if (cx === -1) {
                const t = new THREE.Mesh(tileGeo, stickerMats[1]);
                t.rotation.y = -Math.PI / 2;
                t.position.x = -0.055;
                cell.add(t);
              }
              if (cy === 1) {
                const t = new THREE.Mesh(tileGeo, stickerMats[2]);
                t.rotation.x = -Math.PI / 2;
                t.position.y = 0.055;
                cell.add(t);
              }
              if (cy === -1) {
                const t = new THREE.Mesh(tileGeo, stickerMats[3]);
                t.rotation.x = Math.PI / 2;
                t.position.y = -0.055;
                cell.add(t);
              }
              if (cz === 1) {
                const t = new THREE.Mesh(tileGeo, stickerMats[4]);
                t.position.z = 0.055;
                cell.add(t);
              }
              if (cz === -1) {
                const t = new THREE.Mesh(tileGeo, stickerMats[5]);
                t.rotation.y = Math.PI;
                t.position.z = -0.055;
                cell.add(t);
              }

              cell.position.set(cx * 0.118, cy * 0.118, cz * 0.118);
              cubeRoot.add(cell);
              cubies.push(cell);
            }
          }
        }

        type CubeMove = { axis: 'x' | 'y' | 'z'; layer: -1 | 0 | 1; dir: 1 | -1 };
        const cubeHistory: CubeMove[] = [];
        const solveQueue: CubeMove[] = [];
        let activeSliceTurn: {
          move: CubeMove;
          members: import('three').Group[];
          progress: number;
        } | null = null;

        const snapCubeMoveInstant = (mv: CubeMove) => {
          const rotVec =
            mv.axis === 'x'
              ? new THREE.Vector3(1, 0, 0)
              : mv.axis === 'y'
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(0, 0, 1);
          const q = new THREE.Quaternion().setFromAxisAngle(rotVec, (Math.PI / 2) * mv.dir);
          for (const c of cubies) {
            const coord =
              mv.axis === 'x'
                ? Math.round(c.position.x / 0.118)
                : mv.axis === 'y'
                ? Math.round(c.position.y / 0.118)
                : Math.round(c.position.z / 0.118);
            if (coord === mv.layer) {
              c.position.applyQuaternion(q);
              c.position.set(
                Math.round(c.position.x / 0.118) * 0.118,
                Math.round(c.position.y / 0.118) * 0.118,
                Math.round(c.position.z / 0.118) * 0.118
              );
              c.quaternion.premultiply(q);
            }
          }
        };

        const finalizeActiveTurn = () => {
          if (!activeSliceTurn) return;
          const { move, members } = activeSliceTurn;
          cubePivot.rotation.set(0, 0, 0);
          for (const c of members) {
            cubePivot.remove(c);
            cubeRoot.add(c);
          }
          snapCubeMoveInstant(move);
          activeSliceTurn = null;
        };

        const startNextTurnFromQueue = () => {
          if (activeSliceTurn || solveQueue.length === 0) return;
          const mv = solveQueue.shift()!;
          const members: import('three').Group[] = [];
          for (const c of cubies) {
            const coord =
              mv.axis === 'x'
                ? Math.round(c.position.x / 0.118)
                : mv.axis === 'y'
                ? Math.round(c.position.y / 0.118)
                : Math.round(c.position.z / 0.118);
            if (coord === mv.layer) {
              cubeRoot.remove(c);
              cubePivot.add(c);
              members.push(c);
            }
          }
          cubePivot.rotation.set(0, 0, 0);
          activeSliceTurn = { move: mv, members, progress: 0 };
        };

        const resetCubeSolved = () => {
          finalizeActiveTurn();
          cubeHistory.length = 0;
          solveQueue.length = 0;
          let idx = 0;
          for (let cx = -1; cx <= 1; cx++) {
            for (let cy = -1; cy <= 1; cy++) {
              for (let cz = -1; cz <= 1; cz++) {
                const c = cubies[idx++];
                c.position.set(cx * 0.118, cy * 0.118, cz * 0.118);
                c.quaternion.identity();
              }
            }
          }
          cubeRoot.rotation.set(0.28, -0.35, 0);
        };
        const projVec = new THREE.Vector3();
        cubeRoot.rotation.set(0.28, -0.35, 0);
        registerInteractive(cubeRoot, 'cube');
        scene.add(cubeRoot);

        // Soft Contact Shadow Discs under hero studio desk & plinths
        const shadowMat = trackMat(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.75 }));
        const deskShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(8.2, 4.4)), shadowMat);
        deskShadow.rotation.x = -Math.PI / 2;
        deskShadow.position.set(0, 0.01, -0.35);
        scene.add(deskShadow);

        // Raycaster + Pointer Drag
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const dragCube = { active: false, lastX: 0, lastY: 0, moved: false };

        const updatePointer = (ev: PointerEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        };

        const onPointerMove = (ev: PointerEvent) => {
          updatePointer(ev);
          raycaster.setFromCamera(pointer, camera);
          const hitFloor = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(floorPlane, hitFloor)) cursorWorld.copy(hitFloor);

          if (dragCube.active) {
            const dx = ev.clientX - dragCube.lastX;
            const dy = ev.clientY - dragCube.lastY;
            if (Math.hypot(dx, dy) > 2) dragCube.moved = true;
            cubeRoot.rotation.y += dx * 0.016;
            cubeRoot.rotation.x += dy * 0.016;
            dragCube.lastX = ev.clientX;
            dragCube.lastY = ev.clientY;
            return;
          }

          const hits = raycaster.intersectObjects(interactiveTargets, true);
          const hitId = (hits.find((h) => h.object.userData?.stationId)?.object.userData.stationId as UniverseStationId | undefined) ?? null;
          renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
          if (hitId !== stateRef.current.hoveredStation) {
            onHoverRef.current(hitId);
          }
        };

        const onPointerDown = (ev: PointerEvent) => {
          updatePointer(ev);
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(interactiveTargets, true);
          const hitId = hits.find((h) => h.object.userData?.stationId)?.object.userData.stationId as UniverseStationId | undefined;
          if (hitId === 'cube' && stateRef.current.activeStation === 'cube') {
            dragCube.active = true;
            dragCube.lastX = ev.clientX;
            dragCube.lastY = ev.clientY;
            dragCube.moved = false;
            orbit.enabled = false;
          }
        };

        const onPointerUp = (ev: PointerEvent) => {
          if (dragCube.active) {
            dragCube.active = false;
            orbit.enabled = true;
            if (dragCube.moved) return;
          }
          updatePointer(ev);
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(interactiveTargets, true);
          const hitId = hits.find((h) => h.object.userData?.stationId)?.object.userData.stationId as UniverseStationId | undefined;
          if (hitId) onSelectRef.current(hitId);
        };

        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        renderer.domElement.addEventListener('pointerup', onPointerUp);

        const resizeObs = new ResizeObserver(() => {
          if (!mount || !mounted) return;
          const w = Math.max(320, mount.clientWidth);
          const h = Math.max(300, mount.clientHeight);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          postfx.setSize(w, h);
        });
        resizeObs.observe(mount);

        const reduced = prefersReducedMotion();
        const desiredCam = new THREE.Vector3(...startMeta.cameraPos);
        const desiredTarget = new THREE.Vector3(...startMeta.lookAt);
        let lastStation = stateRef.current.activeStation;
        let lastEntered = stateRef.current.entered;
        let lastMood = stateRef.current.lightingMood;
        let camTransitionLeft = lastEntered ? 0 : 1.05;
        let rotorSpeedCurrent = 1.7;
        const onOrbitStart = () => {
          camTransitionLeft = 0;
        };
        orbit.addEventListener('start', onOrbitStart);

        let frames = 0;
        let fpsAccum = 0;
        let texRefreshAccum = 0;
        let airflowPhase = 0;
        let lastNow = performance.now();
        let raf = 0;

        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          if (document.hidden) return;
          const dt = Math.min(0.05, (now - lastNow) / 1000);
          lastNow = now;
          const t = now / 1000;

          if (stateRef.current.lightingMood !== lastMood) {
            lastMood = stateRef.current.lightingMood;
            const mood = STUDIO_LIGHTING_MOODS[lastMood] || STUDIO_LIGHTING_MOODS.cinema;
            scene.background = new THREE.Color(mood.bgHex);
            scene.fog = new THREE.FogExp2(mood.fogHex, 0.026);
            floorUniforms.uFloorBase.value.set(mood.floorHex);
            coveEmitMat.color.set(mood.coveHex);
            lighting.keyLight.color.setHex(mood.keyHex);
            lighting.keyLight.intensity = mood.keyIntensity;
            studioRimLight.color.setHex(mood.rimHex);
            renderer.toneMappingExposure = mood.exposure;
          }

          while (cubeQueueRef.current.length > 0) {
            const cmd = cubeQueueRef.current.shift()!;
            if (cmd.type === 'reset') {
              resetCubeSolved();
            } else if (cmd.type === 'scramble') {
              const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
              const layers: Array<-1 | 0 | 1> = [-1, 0, 1];
              for (let s = 0; s < 8; s++) {
                const mv: CubeMove = {
                  axis: axes[s % 3],
                  layer: layers[(s * 2) % 3],
                  dir: (s % 2 === 0 ? 1 : -1) as 1 | -1,
                };
                cubeHistory.push(mv);
                if (reduced) {
                  snapCubeMoveInstant(mv);
                } else {
                  solveQueue.push(mv);
                }
              }
            } else if (cmd.type === 'solve') {
              while (cubeHistory.length > 0) {
                const last = cubeHistory.pop()!;
                const inv: CubeMove = { axis: last.axis, layer: last.layer, dir: (last.dir * -1) as 1 | -1 };
                if (reduced) {
                  snapCubeMoveInstant(inv);
                } else {
                  solveQueue.push(inv);
                }
              }
            } else if (cmd.type === 'turn') {
              const mv: CubeMove = { axis: cmd.axis ?? 'y', layer: cmd.layer ?? 1, dir: cmd.dir ?? 1 };
              cubeHistory.push(mv);
              if (reduced) {
                snapCubeMoveInstant(mv);
              } else {
                solveQueue.push(mv);
              }
            }
          }

          if (!activeSliceTurn && solveQueue.length > 0) {
            startNextTurnFromQueue();
          }
          if (activeSliceTurn) {
            activeSliceTurn.progress += dt / 0.14;
            const rawP = Math.min(1, activeSliceTurn.progress);
            const eased = 1 - Math.pow(1 - rawP, 3);
            const angle = (Math.PI / 2) * activeSliceTurn.move.dir * eased;
            cubePivot.rotation.set(
              activeSliceTurn.move.axis === 'x' ? angle : 0,
              activeSliceTurn.move.axis === 'y' ? angle : 0,
              activeSliceTurn.move.axis === 'z' ? angle : 0
            );
            if (rawP >= 1) {
              finalizeActiveTurn();
              startNextTurnFromQueue();
            }
          }

          floorUniforms.uTime.value = t;
          coreShaderMat.uniforms.uTime.value = t;
          for (const [mid, uni] of monitorHoloUniforms.entries()) {
            uni.uTime.value = t;
            const targetHov = stateRef.current.hoveredStation === mid || stateRef.current.activeStation === mid ? 1 : 0;
            uni.uHovered.value += (targetHov - uni.uHovered.value) * Math.min(1, dt * 8);
          }

          if (!reduced) {
            const energyFocused = stateRef.current.activeStation === 'energy' || stateRef.current.hoveredStation === 'energy';
            const roboticsFocused =
              stateRef.current.activeStation === 'robotics' || stateRef.current.hoveredStation === 'robotics';
            const windMs = Math.max(0, stateRef.current.turbineWindMs ?? 6.5);
            const targetRotorSpeed = energyFocused ? windMs * 0.58 : Math.max(1.1, windMs * 0.25);
            rotorSpeedCurrent += (targetRotorSpeed - rotorSpeedCurrent) * Math.min(1, dt * 4);
            tRotor.rotation.z -= dt * rotorSpeedCurrent;
            airflowPhase += dt * (0.65 + rotorSpeedCurrent * 0.35);
            airflowUniforms.uTime.value = airflowPhase;

            const manualPose = stateRef.current.piperPose;
            if (manualPose && stateRef.current.activeStation === 'robotics') {
              const targetSh = (manualPose.shoulderDeg * Math.PI) / 180;
              const targetEl = (manualPose.elbowDeg * Math.PI) / 180;
              const k = Math.min(1, dt * 7);
              rShoulder.rotation.z += (targetSh - rShoulder.rotation.z) * k;
              rElbow.rotation.z += (targetEl - rElbow.rotation.z) * k;
            } else {
              const armReach = roboticsFocused ? 0.24 : 0.14;
              rShoulder.rotation.z = Math.sin(t * (roboticsFocused ? 0.95 : 0.65)) * armReach - 0.12;
              rElbow.rotation.z = Math.cos(t * (roboticsFocused ? 1.15 : 0.85)) * (armReach + 0.08) + 0.35;
            }

            gRing1.rotation.y += dt * 0.48;
            gRing1.rotation.x = Math.sin(t * 0.4) * 0.25;
            gRing2.rotation.z -= dt * 0.38;
            gyroGroup.position.y = 2.74 + Math.sin(t * 1.4) * 0.032;
            if (!dragCube.active && stateRef.current.activeStation !== 'cube') {
              cubeRoot.rotation.y += dt * 0.32;
            }
            dustPoints.rotation.y = t * 0.014;
          } else {
            airflowUniforms.uTime.value = t;
          }

          if (stateRef.current.entered && !lastEntered) {
            lastEntered = true;
            camTransitionLeft = 1.15;
          }
          const focusId = stateRef.current.hoveredStation || stateRef.current.activeStation;
          const focusSpot = beaconSpots[focusId] ?? beaconSpots.overview;
          const focusAccent = stationById(focusId).accentHex;
          beaconOuterMat.color.lerp(beaconTargetColor.set(focusAccent), Math.min(1, dt * 8));
          const bLerp = Math.min(1, dt * 6.5);
          beaconGroup.position.x += (focusSpot[0] - beaconGroup.position.x) * bLerp;
          beaconGroup.position.y += (focusSpot[1] - beaconGroup.position.y) * bLerp;
          beaconGroup.position.z += (focusSpot[2] - beaconGroup.position.z) * bLerp;
          const curScale = beaconGroup.scale.x + (focusSpot[3] - beaconGroup.scale.x) * bLerp;
          beaconGroup.scale.setScalar(curScale);
          if (!reduced) {
            beaconGroup.rotation.y += dt * 0.75;
          }

          if (stateRef.current.activeStation !== lastStation) {
            lastStation = stateRef.current.activeStation;
            const m = stationById(lastStation);
            desiredCam.set(...m.cameraPos);
            desiredTarget.set(...m.lookAt);
            camTransitionLeft = 0.95;
            if (reduced) {
              camera.position.copy(desiredCam);
              orbit.target.copy(desiredTarget);
              camTransitionLeft = 0;
            }
          }

          if (!reduced && camTransitionLeft > 0) {
            camTransitionLeft = Math.max(0, camTransitionLeft - dt);
            const f = settleFactor(4.8, dt);
            camera.position.lerp(desiredCam, f);
            orbit.target.lerp(desiredTarget, f);
          }
          orbit.update();

          texRefreshAccum += dt;
          if (texRefreshAccum >= 1.4) {
            texRefreshAccum = 0;
            monitorTexUpdaters.forEach((fn) => fn());
          }

          frames++;
          fpsAccum += dt;
          if (fpsAccum >= 1.0) {
            const fps = Math.round(frames / fpsAccum);
            onMetricsRef.current?.({
              tier: isMobile ? 'medium' : 'high',
              fps,
              webglActive: true,
            });
            if (typeof window !== 'undefined') {
              (window as unknown as { __UNIVERSE_METRICS__?: unknown }).__UNIVERSE_METRICS__ = {
                fps,
                webglActive: true,
                activeStation: stateRef.current.activeStation,
                lightingMood: stateRef.current.lightingMood,
              };
            }
            frames = 0;
            fpsAccum = 0;
          }

          postfx.render(t);

          // Update projected 3D spatial pins smoothly without React re-renders
          if (stateRef.current.activeStation === 'overview' && stateRef.current.showPins) {
            const w = mount.clientWidth;
            const h = mount.clientHeight;
            for (const anchor of SCENE_PIN_ANCHORS) {
              const el = pinRefs.current[anchor.id];
              if (!el) continue;
              projVec.set(anchor.pos[0], anchor.pos[1], anchor.pos[2]).project(camera);
              const visible = projVec.z >= -1 && projVec.z <= 1;
              if (!visible) {
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
              } else {
                const px = (projVec.x * 0.5 + 0.5) * w;
                const py = (-projVec.y * 0.5 + 0.5) * h;
                el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -100%)`;
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
              }
            }
          }
        };
        raf = requestAnimationFrame(tick);

        cleanup = () => {
          cancelAnimationFrame(raf);
          resizeObs.disconnect();
          renderer.domElement.removeEventListener('pointermove', onPointerMove);
          renderer.domElement.removeEventListener('pointerdown', onPointerDown);
          renderer.domElement.removeEventListener('pointerup', onPointerUp);
          orbit.removeEventListener('start', onOrbitStart);
          orbit.dispose();
          postfx.dispose();
          lighting.dispose();
          studioRimLight.dispose();
          deskLampLight.dispose();
          pbrMaps.dispose();
          managedGeos.forEach((g) => g.dispose());
          managedMats.forEach((m) => m.dispose());
          managedTexs.forEach((tx) => tx.dispose());
          renderer.dispose();
        };
      } catch {
        onFallbackRef.current();
      }
    })();

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute inset-0 w-full h-full touch-none" data-testid="universe-webgl-canvas" />
      {activeStation === 'overview' && showPins && (
        <div className="pointer-events-none hidden md:block absolute inset-0 z-10 overflow-hidden">
          {SCENE_PIN_ANCHORS.map((pin) => (
            <button
              key={pin.id}
              ref={(el) => {
                pinRefs.current[pin.id] = el;
              }}
              type="button"
              onClick={() => onSelectStation(pin.id)}
              onMouseEnter={() => onHoverStation(pin.id)}
              onMouseLeave={() => onHoverStation(null)}
              style={{ opacity: 0 }}
              className="absolute top-0 left-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#090D16]/78 backdrop-blur-md border border-white/15 hover:border-[#C6A46B] text-[10px] font-semibold text-slate-100 shadow-lg transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pin.accent }} />
              <span>{pin.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
