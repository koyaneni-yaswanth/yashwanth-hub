import React, { useEffect, useRef } from 'react';
import type { UniverseStationId } from '../../lib/universeConfig';
import { stationById } from '../../lib/universeConfig';
import { settleFactor } from '../momentum/cinema/cinemaConfig';
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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function makeMonitorCanvasTexture(
  THREE: typeof import('three'),
  title: string,
  subtitle: string,
  accent: string,
  lines: string[]
): { tex: import('three').CanvasTexture; canvas: HTMLCanvasElement; draw: (nextLines: string[]) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = (currentLines: string[]) => {
    ctx.fillStyle = '#070B13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle header rule
    ctx.fillStyle = accent;
    ctx.fillRect(24, 24, 96, 4);

    ctx.fillStyle = '#E6F1FF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(title, 24, 62);

    ctx.fillStyle = accent;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(subtitle, 24, 88);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(24, 108);
    ctx.lineTo(488, 108);
    ctx.stroke();

    ctx.font = '15px monospace';
    currentLines.slice(0, 5).forEach((ln, idx) => {
      ctx.fillStyle = idx === 0 ? '#F5F3EF' : '#9FB1C8';
      ctx.fillText(ln.slice(0, 48), 24, 140 + idx * 30);
    });

    ctx.fillStyle = 'rgba(198,164,107,0.35)';
    ctx.fillRect(24, 272, 464, 2);
    tex.needsUpdate = true;
  };

  draw(lines);
  return { tex, canvas, draw };
}

export const UniverseStudioScene: React.FC<UniverseStudioSceneProps> = ({
  activeStation,
  hoveredStation,
  onHoverStation,
  onSelectStation,
  whiteboardDataUrl,
  cubeCommand,
  statsSummary,
  onMetricsUpdate,
  onWebglUnavailable,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    activeStation,
    hoveredStation,
    whiteboardDataUrl,
    statsSummary,
  });

  const onHoverRef = useRef(onHoverStation);
  const onSelectRef = useRef(onSelectStation);
  const onMetricsRef = useRef(onMetricsUpdate);
  const onFallbackRef = useRef(onWebglUnavailable);

  useEffect(() => {
    stateRef.current = { activeStation, hoveredStation, whiteboardDataUrl, statsSummary };
    onHoverRef.current = onHoverStation;
    onSelectRef.current = onSelectStation;
    onMetricsRef.current = onMetricsUpdate;
    onFallbackRef.current = onWebglUnavailable;
  }, [
    activeStation,
    hoveredStation,
    whiteboardDataUrl,
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
        const [{ OrbitControls }] = await Promise.all([
          import('three/examples/jsm/controls/OrbitControls.js'),
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
        renderer.toneMappingExposure = 1.08;
        mount.innerHTML = '';
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#050608');
        scene.fog = new THREE.FogExp2('#07090E', 0.042);

        const startMeta = stationById(stateRef.current.activeStation);
        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
        camera.position.set(...startMeta.cameraPos);

        const orbit = new OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.07;
        orbit.maxPolarAngle = Math.PI * 0.48;
        orbit.minDistance = 1.6;
        orbit.maxDistance = 14;
        orbit.target.set(...startMeta.lookAt);

        // Lighting
        const hemi = new THREE.HemisphereLight('#8BA8C8', '#090B10', 0.65);
        const keyLight = new THREE.DirectionalLight('#FFE5BE', 2.15);
        keyLight.position.set(6, 8, 5);
        const rimLight = new THREE.DirectionalLight('#60A5FA', 1.45);
        rimLight.position.set(-7, 5, -6);
        const deskSpot = new THREE.PointLight('#C6A46B', 9, 10, 1.8);
        deskSpot.position.set(0, 3.2, -0.4);
        scene.add(hemi, keyLight, rimLight, deskSpot);

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

        // Custom GLSL Studio Floor
        const cursorWorld = new THREE.Vector3(0, 0, 0);
        const floorUniforms = {
          uTime: { value: 0 },
          uCursorWorld: { value: cursorWorld },
          uAccentGold: { value: new THREE.Color('#C6A46B') },
          uAccentSteel: { value: new THREE.Color('#8BA8C8') },
          uFloorBase: { value: new THREE.Color('#07090D') },
        };
        const floorMat = trackMat(
          new THREE.ShaderMaterial({
            uniforms: floorUniforms,
            vertexShader: STUDIO_FLOOR_VERTEX_SHADER,
            fragmentShader: STUDIO_FLOOR_FRAGMENT_SHADER,
            transparent: true,
          })
        );
        const floorMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(36, 36)), floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        scene.add(floorMesh);

        // Ambient particles (reduced cleanly on mobile)
        const particleCount = isMobile ? 70 : 180;
        const pPositions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          pPositions[i * 3] = (Math.random() - 0.5) * 18;
          pPositions[i * 3 + 1] = 0.5 + Math.random() * 5.2;
          pPositions[i * 3 + 2] = (Math.random() - 0.5) * 14;
        }
        const pGeo = trackGeo(new THREE.BufferGeometry());
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
        const pMat = trackMat(new THREE.PointsMaterial({ color: '#C6A46B', size: 0.038, transparent: true, opacity: 0.55 }));
        const dustPoints = new THREE.Points(pGeo, pMat);
        scene.add(dustPoints);

        // Engineering Workbench Desk
        const deskGroup = new THREE.Group();
        const darkSlateMat = trackMat(new THREE.MeshStandardMaterial({ color: '#141923', metalness: 0.55, roughness: 0.42 }));
        const brushedMetalMat = trackMat(new THREE.MeshStandardMaterial({ color: '#273142', metalness: 0.85, roughness: 0.25 }));
        const brassTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: '#C6A46B', metalness: 0.88, roughness: 0.22 }));

        const deskTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 0.12, 2.8)), darkSlateMat);
        deskTop.position.set(0, 1.02, -0.35);
        const deskTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.46, 0.04, 2.86)), brassTrimMat);
        deskTrim.position.set(0, 1.06, -0.35);
        deskGroup.add(deskTop, deskTrim);

        for (const [lx, lz] of [[-2.95, -1.5], [2.95, -1.5], [-2.95, 0.85], [2.95, 0.85]]) {
          const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 1.0, 0.14)), brushedMetalMat);
          leg.position.set(lx, 0.5, lz);
          deskGroup.add(leg);
        }
        scene.add(deskGroup);

        const interactiveTargets: import('three').Object3D[] = [];
        const monitorHoloUniforms: Map<UniverseStationId, { uHovered: { value: number }; uTime: { value: number } }> = new Map();

        const registerInteractive = (obj: import('three').Object3D, id: UniverseStationId) => {
          obj.traverse((child) => {
            child.userData.stationId = id;
          });
          interactiveTargets.push(obj);
        };

        // Helper: Sculpted Physical 3D Monitor
        const monitorTexUpdaters: Array<() => void> = [];
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

          const bezel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.38, 0.84, 0.06)), brushedMetalMat);
          const stand = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.06, 0.42, 16)), brushedMetalMat);
          stand.position.set(0, -0.58, -0.04);
          g.add(bezel, stand);

          const scr = makeMonitorCanvasTexture(THREE, title, subtitle, accent, linesFn());
          managedTexs.push(scr.tex);
          monitorTexUpdaters.push(() => scr.draw(linesFn()));

          const scrMat = trackMat(new THREE.MeshBasicMaterial({ map: scr.tex }));
          const scrMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.28, 0.75)), scrMat);
          scrMesh.position.z = 0.032;
          g.add(scrMesh);

          const holoUni = { uTime: { value: 0 }, uColor: { value: new THREE.Color(accent) }, uHovered: { value: 0 } };
          monitorHoloUniforms.set(id, holoUni);
          const holoFrame = new THREE.Mesh(
            trackGeo(new THREE.PlaneGeometry(1.42, 0.88)),
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
          holoFrame.position.z = 0.036;
          g.add(holoFrame);

          registerInteractive(g, id);
          scene.add(g);
        };

        addMonitor(
          'about',
          'ABOUT ME',
          'MONITOR 01 · YASHWANTH',
          '#C6A46B',
          () => ['VNIT Nagpur · Mechanical Eng.', 'Founder · PAWAN SHAKTI Wind', 'Robotics · ROS2 / PiPER / Swarm', 'Click to read profile'],
          [-1.55, 1.84, -1.28],
          0.32
        );
        addMonitor(
          'projects',
          'PROJECTS',
          'MONITOR 02 · LIVE ARCHIVE',
          '#8BA8C8',
          () => [
            `Tracked Projects: ${stateRef.current.statsSummary.projectCount}`,
            `Open Tasks: ${stateRef.current.statsSummary.openTasks}`,
            'Wind Turbine · Robotics · AI OS',
            'Click to open Projects',
          ],
          [0.0, 1.86, -1.48],
          0.0
        );
        addMonitor(
          'jarvis',
          'JARVIS CORE',
          'MONITOR 03 · PERSONAL AI',
          '#3BE8FF',
          () => [
            `Providers Ready: ${stateRef.current.statsSummary.providersReady}`,
            `Local Agent: ${stateRef.current.statsSummary.localOnline ? 'ONLINE' : 'UNPAIRED'}`,
            'Gemini · GPT · Claude · Ollama',
            'Click to chat on Monitor 03',
          ],
          [1.55, 1.84, -1.28],
          -0.32
        );
        addMonitor(
          'research',
          'SYSTEM / LABS',
          'MONITOR 04 · DIAGNOSTICS',
          '#A78BFA',
          () => [
            `Robotics Logs: ${stateRef.current.statsSummary.roboticsCount}`,
            'GitHub CI + Vercel Prod Health',
            'arXiv & Semantic Memory Vault',
            'Click to inspect diagnostics',
          ],
          [2.58, 1.82, -0.78],
          -0.78
        );

        // Station 05: Left Robotics Workbench (Articulated 6-DOF Arm)
        const roboticsGroup = new THREE.Group();
        roboticsGroup.position.set(-2.55, 1.08, -0.15);
        const rBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.14, 24)), brushedMetalMat);
        rBase.position.y = 0.07;
        const rShoulder = new THREE.Group();
        rShoulder.position.y = 0.14;
        const rLink1 = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.11, 0.56, 0.11)),
          trackMat(new THREE.MeshStandardMaterial({ color: '#38BDF8', metalness: 0.65, roughness: 0.25 }))
        );
        rLink1.position.y = 0.28;
        const rElbow = new THREE.Group();
        rElbow.position.y = 0.56;
        const rLink2 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.06, 0.48, 16)), brassTrimMat);
        rLink2.position.y = 0.24;
        const rGripper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.08, 0.08)), brushedMetalMat);
        rGripper.position.y = 0.5;
        rElbow.add(rLink2, rGripper);
        rShoulder.add(rLink1, rElbow);
        roboticsGroup.add(rBase, rShoulder);
        registerInteractive(roboticsGroup, 'robotics');
        scene.add(roboticsGroup);

        // Station 06: Right Energy Lab (PAWAN SHAKTI Helical Turbine + Airflow Shader)
        const energyGroup = new THREE.Group();
        energyGroup.position.set(2.75, 1.08, 0.15);
        const tMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.08, 0.92, 20)), brushedMetalMat);
        tMast.position.y = 0.46;
        const tNacelle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 20)), darkSlateMat);
        tNacelle.rotation.x = Math.PI / 2;
        tNacelle.position.set(0, 0.92, -0.05);
        const tRotor = new THREE.Group();
        tRotor.position.set(0, 0.92, 0.18);
        const tBladeMat = trackMat(new THREE.MeshStandardMaterial({ color: '#34D399', metalness: 0.45, roughness: 0.3 }));
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.09, 0.55, 0.025)), tBladeMat);
          b.position.y = 0.27;
          b.rotation.y = 0.35;
          const h = new THREE.Group();
          h.rotation.z = (i * Math.PI * 2) / 3;
          h.add(b);
          tRotor.add(h);
        }
        const tHub = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.09, 0.2, 20)), brassTrimMat);
        tHub.rotation.x = Math.PI / 2;
        tHub.position.z = 0.06;
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
        airflowRibbon.position.set(0.28, 0.92, 0.15);
        energyGroup.add(tMast, tNacelle, tRotor, airflowRibbon);
        registerInteractive(energyGroup, 'energy');
        scene.add(energyGroup);

        // Station 07: Functional Physical Whiteboard (left studio wall)
        const wbGroup = new THREE.Group();
        wbGroup.position.set(-4.15, 2.05, -0.45);
        wbGroup.rotation.y = 1.15;
        const wbFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 1.3, 0.08)), brushedMetalMat);
        const wbCanvas = document.createElement('canvas');
        wbCanvas.width = 512;
        wbCanvas.height = 270;
        const wbCtx = wbCanvas.getContext('2d')!;
        wbCtx.fillStyle = '#F7F5F0';
        wbCtx.fillRect(0, 0, 512, 270);
        wbCtx.fillStyle = '#14171C';
        wbCtx.font = 'bold 20px sans-serif';
        wbCtx.fillText('WHITEBOARD · CLICK TO DRAW', 28, 128);
        wbCtx.fillStyle = '#A88650';
        wbCtx.font = '14px monospace';
        wbCtx.fillText('PAWAN SHAKTI · ROBOTICS SKETCHPAD', 28, 158);
        const wbTex = new THREE.CanvasTexture(wbCanvas);
        wbTex.colorSpace = THREE.SRGBColorSpace;
        managedTexs.push(wbTex);
        whiteboardUpdateRef.current = (dataUrl: string) => {
          const img = new Image();
          img.onload = () => {
            wbCtx.clearRect(0, 0, 512, 270);
            wbCtx.drawImage(img, 0, 0, 512, 270);
            wbTex.needsUpdate = true;
          };
          img.src = dataUrl;
        };
        if (stateRef.current.whiteboardDataUrl) whiteboardUpdateRef.current(stateRef.current.whiteboardDataUrl);

        const wbSurface = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(2.22, 1.18)),
          trackMat(new THREE.MeshBasicMaterial({ map: wbTex }))
        );
        wbSurface.position.z = 0.045;
        wbGroup.add(wbFrame, wbSurface);
        registerInteractive(wbGroup, 'whiteboard');
        scene.add(wbGroup);

        // Station 08: Simulation & Experiment Arcade Cabinet (front-left)
        const expGroup = new THREE.Group();
        expGroup.position.set(-2.15, 0.9, 1.55);
        expGroup.rotation.y = 0.52;
        const expCabinet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 1.45, 0.72)), darkSlateMat);
        expCabinet.position.y = -0.18;
        const expTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.86, 0.06, 0.76)), brassTrimMat);
        expTrim.position.y = 0.56;
        const expScreenScr = makeMonitorCanvasTexture(
          THREE,
          'EXPERIMENTS',
          'SIMULATION DECK',
          '#EC4899',
          ['01 Wind TSR / Betz Curve', '02 Planar 2-Link IK', '03 77 GHz FMCW Chirp', 'Click to launch sims']
        );
        managedTexs.push(expScreenScr.tex);
        const expScrMesh = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(0.66, 0.44)),
          trackMat(new THREE.MeshBasicMaterial({ map: expScreenScr.tex }))
        );
        expScrMesh.position.set(0, 0.34, 0.365);
        expScrMesh.rotation.x = -0.18;
        expGroup.add(expCabinet, expTrim, expScrMesh);
        registerInteractive(expGroup, 'experiment');
        scene.add(expGroup);

        // Station 09: Interactive 27-Cubie Rubik Calibration Cube (front-center workbench)
        const cubeRoot = new THREE.Group();
        cubeRoot.position.set(0.15, 1.36, 0.72);
        const cubies: import('three').Mesh[] = [];
        const faceMats = [
          trackMat(new THREE.MeshStandardMaterial({ color: '#EF4444', roughness: 0.3 })), // +X red
          trackMat(new THREE.MeshStandardMaterial({ color: '#F97316', roughness: 0.3 })), // -X orange
          trackMat(new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.3 })), // +Y white
          trackMat(new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.3 })), // -Y yellow
          trackMat(new THREE.MeshStandardMaterial({ color: '#22C55E', roughness: 0.3 })), // +Z green
          trackMat(new THREE.MeshStandardMaterial({ color: '#3B82F6', roughness: 0.3 })), // -Z blue
        ];
        const cubieGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.11, 0.11));
        for (let cx = -1; cx <= 1; cx++) {
          for (let cy = -1; cy <= 1; cy++) {
            for (let cz = -1; cz <= 1; cz++) {
              const cubie = new THREE.Mesh(cubieGeo, faceMats);
              cubie.position.set(cx * 0.12, cy * 0.12, cz * 0.12);
              cubie.userData.grid = new THREE.Vector3(cx, cy, cz);
              cubeRoot.add(cubie);
              cubies.push(cubie);
            }
          }
        }
        const rotateCubeSlice = (axis: 'x' | 'y' | 'z', layer: -1 | 0 | 1, dir: 1 | -1) => {
          const rotVec =
            axis === 'x'
              ? new THREE.Vector3(1, 0, 0)
              : axis === 'y'
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(0, 0, 1);
          const angle = (Math.PI / 2) * dir;
          const q = new THREE.Quaternion().setFromAxisAngle(rotVec, angle);
          for (const c of cubies) {
            const coord = axis === 'x' ? Math.round(c.position.x / 0.12) : axis === 'y' ? Math.round(c.position.y / 0.12) : Math.round(c.position.z / 0.12);
            if (coord === layer) {
              c.position.applyQuaternion(q);
              c.position.set(
                Math.round(c.position.x / 0.12) * 0.12,
                Math.round(c.position.y / 0.12) * 0.12,
                Math.round(c.position.z / 0.12) * 0.12
              );
              c.quaternion.premultiply(q);
            }
          }
        };
        const resetCubeSolved = () => {
          let idx = 0;
          for (let cx = -1; cx <= 1; cx++) {
            for (let cy = -1; cy <= 1; cy++) {
              for (let cz = -1; cz <= 1; cz++) {
                const c = cubies[idx++];
                c.position.set(cx * 0.12, cy * 0.12, cz * 0.12);
                c.quaternion.identity();
              }
            }
          }
          cubeRoot.rotation.set(0, 0, 0);
        };
        registerInteractive(cubeRoot, 'cube');
        scene.add(cubeRoot);

        // Raycaster + Pointer Drag on Cube or Cursor Glow
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
          if (raycaster.ray.intersectPlane(floorPlane, hitFloor)) {
            cursorWorld.copy(hitFloor);
          }

          if (dragCube.active) {
            const dx = ev.clientX - dragCube.lastX;
            const dy = ev.clientY - dragCube.lastY;
            if (Math.hypot(dx, dy) > 2) dragCube.moved = true;
            cubeRoot.rotation.y += dx * 0.015;
            cubeRoot.rotation.x += dy * 0.015;
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
          if (hitId) {
            onSelectRef.current(hitId);
          }
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
        });
        resizeObs.observe(mount);

        const reduced = prefersReducedMotion();
        const desiredCam = new THREE.Vector3(...startMeta.cameraPos);
        const desiredTarget = new THREE.Vector3(...startMeta.lookAt);
        let lastStation = stateRef.current.activeStation;
        let frames = 0;
        let fpsAccum = 0;
        let texRefreshAccum = 0;
        let lastNow = performance.now();
        let raf = 0;

        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          if (document.hidden) return;
          const dt = Math.min(0.05, (now - lastNow) / 1000);
          lastNow = now;
          const t = now / 1000;

          // Consume queued Rubik cube actions
          while (cubeQueueRef.current.length > 0) {
            const cmd = cubeQueueRef.current.shift()!;
            if (cmd.type === 'reset') resetCubeSolved();
            else if (cmd.type === 'scramble') {
              const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
              const layers: Array<-1 | 0 | 1> = [-1, 0, 1];
              for (let s = 0; s < 8; s++) {
                rotateCubeSlice(axes[s % 3], layers[(s * 2) % 3], s % 2 === 0 ? 1 : -1);
              }
            } else if (cmd.type === 'turn') {
              rotateCubeSlice(cmd.axis ?? 'y', cmd.layer ?? 1, cmd.dir ?? 1);
            }
          }

          floorUniforms.uTime.value = t;
          airflowUniforms.uTime.value = t;
          for (const [mid, uni] of monitorHoloUniforms.entries()) {
            uni.uTime.value = t;
            const targetHov = stateRef.current.hoveredStation === mid || stateRef.current.activeStation === mid ? 1 : 0;
            uni.uHovered.value += (targetHov - uni.uHovered.value) * Math.min(1, dt * 8);
          }

          if (!reduced) {
            tRotor.rotation.z -= dt * 1.45;
            rShoulder.rotation.z = Math.sin(t * 0.7) * 0.14 - 0.12;
            rElbow.rotation.z = Math.cos(t * 0.85) * 0.2 + 0.35;
            if (!dragCube.active && stateRef.current.activeStation !== 'cube') {
              cubeRoot.rotation.y += dt * 0.35;
            }
            dustPoints.rotation.y = t * 0.015;
          }

          // Camera glide when station changes
          if (stateRef.current.activeStation !== lastStation) {
            lastStation = stateRef.current.activeStation;
            const m = stationById(lastStation);
            desiredCam.set(...m.cameraPos);
            desiredTarget.set(...m.lookAt);
            if (reduced) {
              camera.position.copy(desiredCam);
              orbit.target.copy(desiredTarget);
            }
          }

          if (!reduced) {
            const f = settleFactor(4.8, dt);
            if (stateRef.current.activeStation !== 'overview') {
              camera.position.lerp(desiredCam, f);
            }
            orbit.target.lerp(desiredTarget, f);
          }
          orbit.update();

          texRefreshAccum += dt;
          if (texRefreshAccum >= 2.0) {
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
              };
            }
            frames = 0;
            fpsAccum = 0;
          }

          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);

        cleanup = () => {
          cancelAnimationFrame(raf);
          resizeObs.disconnect();
          renderer.domElement.removeEventListener('pointermove', onPointerMove);
          renderer.domElement.removeEventListener('pointerdown', onPointerDown);
          renderer.domElement.removeEventListener('pointerup', onPointerUp);
          orbit.dispose();
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

  return <div ref={mountRef} className="absolute inset-0 w-full h-full touch-none" data-testid="universe-webgl-canvas" />;
};
