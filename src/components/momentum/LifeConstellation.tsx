import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { hash01 } from '../../lib/lifeDomains';
import { CINEMA, settleFactor, tierSettings, type QualityTier } from './cinema/cinemaConfig';
import { CinematicCameraRig } from './cinema/CinematicCameraRig';
import { LightingDirector } from './cinema/LightingDirector';
import { Atmosphere } from './cinema/Atmosphere';
import { PostFX } from './cinema/PostFX';
import { PerformanceManager } from './cinema/PerformanceManager';
import { createProceduralDetailMaps } from './cinema/proceduralMaterials';

export interface SceneGoal {
  id: string;
  title: string;
  color: string;
  /** 0–1 milestone progress. */
  progress: number;
  /** Relative importance → planet size (planned milestones, near deadline). */
  importance: number;
  atRisk: boolean;
  paused: boolean;
}

export interface SceneHabit {
  id: string;
  title: string;
  goalId?: string;
  color: string;
  /** 0–1 check-ins vs. target, last 14 days. */
  consistency: number;
  streak: number;
  /** A long streak: drawn as a visible orbital ring. */
  streakRing?: boolean;
}

export interface SceneProject {
  id: string;
  title: string;
  color: string;
  progress: number;
  openTasks: number;
  doneTasks: number;
  milestones: { done: boolean }[];
}

export interface SceneMemory {
  id: string;
  date: string;
  tags: string[];
}

export interface LifeConstellationProps {
  score: number | null;
  goals: SceneGoal[];
  habits: SceneHabit[];
  /** Focus minutes (last 7 days) linked to each goal: drawn as energy streams. */
  streams: { goalId: string; minutes: number }[];
  /** Focus minutes not linked to a goal: drawn as the core's energy ring. */
  unlinkedFocusMinutes: number;
  memories: SceneMemory[];
  projects?: SceneProject[];
  selectedGoalId?: string | null;
  selectedProjectId?: string | null;
  selectedMemoryId?: string | null;
  onSelectGoal?: (goalId: string) => void;
  onSelectProject?: (projectId: string) => void;
  onSelectMemory?: (memoryId: string) => void;
  onHover?: (label: string | null) => void;
  /** Fire a check-in light pulse on this habit's satellite (change `key` to re-fire). */
  pulse?: { habitId: string; key: number } | null;
  /** While a deep-work session runs: a calmer scene and a soft halo on the goal it serves. */
  focusField?: { goalId?: string } | null;
  /** Onboarding tour: where the camera should be. Overrides the current selection while set. */
  tourStop?: TourStop | null;
}

export type TourStop = { kind: 'home' | 'core' | 'memories' } | { kind: 'goal' | 'project'; id: string };

/** Brand gold: core, energy ring, streams and the focus halo. */
const ACCENT = CINEMA.palette.accent;
const NO_PROJECTS: SceneProject[] = [];

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** Soft radial sprite texture (stars, glows, nebula). */
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

/**
 * The cinematic Life Constellation: a glass-and-metal core (momentum), crystal
 * planets for goals (colour = life domain, size = importance, ring = progress),
 * habit satellites (bright trails when consistent, dim and drifting when
 * missed), deep-work energy streams from the core to the goals they served,
 * and journal entries as memory nodes linked by shared tags.
 *
 * Purely visual: the page shows every fact in text beside it.
 */
export const LifeConstellation: React.FC<LifeConstellationProps> = (props) => {
  const { score, goals, habits, streams, unlinkedFocusMinutes, memories, selectedGoalId, selectedProjectId, selectedMemoryId, pulse, focusField, tourStop } = props;
  const projects = props.projects ?? NO_PROJECTS;
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const pausedRef = useRef(paused);
  const resetRef = useRef<() => void>(() => {});
  const highlightRef = useRef<(id: string | null) => void>(() => {});
  const requestRenderRef = useRef<() => void>(() => {});
  const cbRef = useRef({ onSelectGoal: props.onSelectGoal, onSelectProject: props.onSelectProject, onSelectMemory: props.onSelectMemory, onHover: props.onHover });
  const focusRef = useRef<(sel: { kind: 'goal' | 'project' | 'memory'; id: string } | null) => void>(() => {});
  const firePulseRef = useRef<(habitId: string) => void>(() => {});
  const pendingPulseRef = useRef<{ habitId: string; at: number } | null>(null);
  /** Camera kept across rebuilds (e.g. after a habit check-in) so the view doesn't jump. */
  const cameraStateRef = useRef<{ pos: number[]; target: number[] } | null>(null);
  const selectionRef = useRef<{ kind: 'goal' | 'project' | 'memory'; id: string } | null>(null);
  const focusFieldRef = useRef<{ goalId?: string } | null>(null);
  const tourRef = useRef<TourStop | null>(null);
  const tourStopRef = useRef<(stop: TourStop | null) => void>(() => {});

  useEffect(() => {
    cbRef.current = { onSelectGoal: props.onSelectGoal, onSelectProject: props.onSelectProject, onSelectMemory: props.onSelectMemory, onHover: props.onHover };
  }, [props.onSelectGoal, props.onSelectProject, props.onSelectMemory, props.onHover]);
  useEffect(() => {
    pausedRef.current = paused;
    requestRenderRef.current();
  }, [paused]);
  useEffect(() => {
    highlightRef.current(selectedGoalId ?? null);
    const sel = selectedGoalId
      ? ({ kind: 'goal', id: selectedGoalId } as const)
      : selectedProjectId
        ? ({ kind: 'project', id: selectedProjectId } as const)
        : selectedMemoryId
          ? ({ kind: 'memory', id: selectedMemoryId } as const)
          : null;
    selectionRef.current = sel;
    if (!tourRef.current) focusRef.current(sel);
  }, [selectedGoalId, selectedProjectId, selectedMemoryId, status]);
  useEffect(() => {
    focusFieldRef.current = focusField ?? null;
    requestRenderRef.current();
  }, [focusField]);
  useEffect(() => {
    tourRef.current = tourStop ?? null;
    if (tourStop) tourStopRef.current(tourStop);
    else focusRef.current(selectionRef.current);
  }, [tourStop, status]);
  useEffect(() => {
    if (!pulse) return;
    pendingPulseRef.current = { habitId: pulse.habitId, at: Date.now() };
    firePulseRef.current(pulse.habitId);
  }, [pulse]);

  // Rebuild only when the data meaningfully changes.
  const signature = useMemo(
    () =>
      JSON.stringify({
        s: score,
        g: goals.map((g) => [g.id, g.color, Math.round(g.progress * 20), Math.round(g.importance * 10), g.atRisk, g.paused]),
        h: habits.map((h) => [h.id, h.goalId, h.color, Math.round(h.consistency * 10), Math.min(30, h.streak)]),
        st: streams.map((x) => [x.goalId, Math.round(x.minutes / 15)]),
        u: Math.round(unlinkedFocusMinutes / 15),
        m: memories.map((m) => m.id).join(','),
        p: projects.map((x) => [x.id, x.color, Math.round(x.progress * 20), x.openTasks, x.doneTasks, x.milestones.map((m) => (m.done ? 1 : 0)).join('')]),
        r: habits.map((h) => (h.streakRing ? 1 : 0)).join(''),
      }),
    [score, goals, habits, streams, unlinkedFocusMinutes, memories, projects]
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let THREE: typeof import('three');
      let mods: {
        OrbitControls: typeof import('three/examples/jsm/controls/OrbitControls.js').OrbitControls;
        EffectComposer: typeof import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer;
        RenderPass: typeof import('three/examples/jsm/postprocessing/RenderPass.js').RenderPass;
        UnrealBloomPass: typeof import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
        OutputPass: typeof import('three/examples/jsm/postprocessing/OutputPass.js').OutputPass;
        RoomEnvironment: typeof import('three/examples/jsm/environments/RoomEnvironment.js').RoomEnvironment;
        ShaderPass: typeof import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
      };
      try {
        THREE = await import('three');
        const [oc, ec, rp, ub, op, re, sp] = await Promise.all([
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/postprocessing/EffectComposer.js'),
          import('three/examples/jsm/postprocessing/RenderPass.js'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/postprocessing/OutputPass.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
          import('three/examples/jsm/postprocessing/ShaderPass.js'),
        ]);
        mods = {
          OrbitControls: oc.OrbitControls,
          EffectComposer: ec.EffectComposer,
          RenderPass: rp.RenderPass,
          UnrealBloomPass: ub.UnrealBloomPass,
          OutputPass: op.OutputPass,
          RoomEnvironment: re.RoomEnvironment,
          ShaderPass: sp.ShaderPass,
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
      let height = mount.clientHeight || 500;
      const reducedMotion = prefersReducedMotion();
      // Quality tier: device hints now, measured fps later (PerformanceManager steps down only).
      const perfMgr = new PerformanceManager(PerformanceManager.readDevice(width, reducedMotion), (tier, set) => applyTier(tier, set));
      const tierSet = perfMgr.settings;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, tierSet.pixelRatioCap));
      renderer.setSize(width, height);
      renderer.setClearColor(CINEMA.palette.background, 1);
      // Colour management: linear lighting, ACES filmic tone mapping, sRGB output.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = CINEMA.renderer.exposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'pan-y';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const lighting = new LightingDirector(THREE, renderer, scene, mods.RoomEnvironment, {
        shadows: tierSet.shadowQuality,
      });
      const detailMaps = createProceduralDetailMaps(THREE);

      const accent = new THREE.Color(ACCENT);
      const world = new THREE.Group();
      scene.add(world);

      // --- Layout maths ---
      const coreR = 1.15 + ((score ?? 35) / 100) * 0.85;
      const orbitR = (i: number) => 5.4 + i * 2.15;
      // Frame at least two orbits' worth of space, so an empty or one-goal scene
      // doesn't zoom in until the core fills the view.
      const outerR = Math.max(goals.length ? orbitR(goals.length - 1) + 1.6 : 0, orbitR(1) + 1.6);
      const memR = outerR + 4.5;

      const camera = new THREE.PerspectiveCamera(CINEMA.camera.fov, width / height, 0.1, 400);
      // Portrait frames (phones) need the camera further back so outer planets aren't cut off.
      const portrait = Math.max(1, 1.2 / Math.max(0.45, width / height));
      // Projects orbit outside the goals; include them in the framing when present.
      const frameR = projects.length ? outerR + 3.6 : outerR;
      const home = new THREE.Vector3(0, (frameR * 0.58 + 3) * portrait, (frameR * 1.72 + 6) * portrait);
      camera.position.copy(home);

      const controls = new mods.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = false; // page scroll stays page scroll
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = 1.75;

      // --- Lights: warm key, cool rim, low hemispheric fill, the core as a practical light ---
      world.add(lighting.coreLight);

      // --- Atmosphere: fog, brand-tinted nebulae, star layers, midground dust ---
      const disc = radialTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
      const atmosphere = new Atmosphere(THREE, scene, disc, (inner, outer, size) => radialTexture(THREE, inner, outer, size), {
        starsFar: tierSet.starsFar,
        starsNear: tierSet.starsNear,
        dust: tierSet.dust,
      });

      // --- Core: momentum (glass shell, luminous heart, metal rings) ---
      const core = new THREE.Group();
      world.add(core);
      const heart = new THREE.Mesh(
        new THREE.SphereGeometry(coreR * 0.58, 48, 48),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5, toneMapped: true })
      );
      core.add(heart);
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(coreR, 64, 64),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.04,
          transmission: 1,
          thickness: 1.4,
          ior: 1.45,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          attenuationColor: accent,
          attenuationDistance: 3,
          envMapIntensity: 1.2,
        })
      );
      glass.castShadow = true;
      glass.receiveShadow = true;
      core.add(glass);
      const metal = new THREE.MeshStandardMaterial({
        color: CINEMA.palette.metal,
        metalness: 1,
        roughness: 0.28,
        roughnessMap: detailMaps.metalRoughness,
        bumpMap: detailMaps.metalBump,
        bumpScale: 0.008,
        envMapIntensity: 1.35,
      });
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(coreR * 1.42, 0.04, 16, 180), metal);
      ringA.rotation.x = Math.PI / 2.15;
      ringA.castShadow = true;
      ringA.receiveShadow = true;
      core.add(ringA);
      const ringB = new THREE.Mesh(new THREE.TorusGeometry(coreR * 1.72, 0.022, 12, 180), metal);
      ringB.rotation.set(Math.PI / 2.6, 0.5, 0);
      ringB.castShadow = true;
      ringB.receiveShadow = true;
      core.add(ringB);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(198,164,107,0.3)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      halo.scale.setScalar(coreR * 6.5);
      core.add(halo);

      // --- Unlinked deep work: the core's energy ring ---
      const ringCount = Math.min(900, 80 + Math.round(unlinkedFocusMinutes * 0.9));
      const ringPos = new Float32Array(ringCount * 3);
      for (let i = 0; i < ringCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = coreR * 2.25 + (Math.random() - 0.5) * 0.8;
        ringPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.18, Math.sin(a) * r], i * 3);
      }
      const energyRingGeo = new THREE.BufferGeometry();
      energyRingGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
      const energyRing = new THREE.Points(
        energyRingGeo,
        new THREE.PointsMaterial({ map: disc, color: accent, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      energyRing.rotation.x = 0.32;
      world.add(energyRing);

      // --- Goals: crystal planets with progress arcs ---
      type Planet = {
        id: string;
        pivot: import('three').Object3D;
        anchor: import('three').Object3D;
        mesh: import('three').Mesh;
        arc: import('three').Mesh;
        speed: number;
        baseEmissive: number;
        color: import('three').Color;
      };
      const planets: Planet[] = [];
      const orbitMat = new THREE.LineBasicMaterial({ color: CINEMA.palette.steel, transparent: true, opacity: 0.1 });
      goals.forEach((g, i) => {
        const r = orbitR(i);
        const tilt = new THREE.Object3D();
        tilt.rotation.x = 0.16 * ((i % 3) - 1);
        tilt.rotation.z = 0.08 * ((i % 2) * 2 - 1);
        world.add(tilt);
        const pts = Array.from({ length: 181 }, (_, k) => {
          const a = (k / 180) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
        });
        tilt.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat));
        const pivot = new THREE.Object3D();
        pivot.rotation.y = hash01(g.id) * Math.PI * 2;
        tilt.add(pivot);
        const anchor = new THREE.Object3D();
        anchor.position.x = r;
        pivot.add(anchor);

        const color = new THREE.Color(g.paused ? '#6b7a96' : g.color);
        const size = 0.5 + Math.min(1, g.importance) * 0.75;
        const baseEmissive = 0.12 + g.progress * 0.5;
        const mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(size, 1),
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.2,
            roughness: 0.2,
            roughnessMap: detailMaps.crystalRoughness,
            bumpMap: detailMaps.crystalBump,
            bumpScale: 0.01,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            iridescence: 0.55,
            iridescenceIOR: 1.35,
            emissive: color,
            emissiveIntensity: baseEmissive,
            flatShading: true,
            envMapIntensity: 1.3,
          })
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { goalId: g.id, title: g.title };
        anchor.add(mesh);

        const track = new THREE.Mesh(
          new THREE.TorusGeometry(size * 1.7, 0.018, 8, 120),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14 })
        );
        track.rotation.x = Math.PI / 2;
        anchor.add(track);
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(size * 1.7, 0.035, 8, 120, Math.PI * 2 * Math.max(0.015, g.progress)),
          new THREE.MeshBasicMaterial({ color, toneMapped: false })
        );
        arc.rotation.x = Math.PI / 2;
        anchor.add(arc);
        if (g.atRisk) {
          // A faint amber halo marks a goal behind pace (also stated in text).
          const warn = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(240,180,90,0.45)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
          );
          warn.scale.setScalar(size * 4.2);
          anchor.add(warn);
        }
        planets.push({ id: g.id, pivot, anchor, mesh, arc, speed: 0.045 + 0.07 / (i + 1), baseEmissive, color });
      });
      const planetById = new Map(planets.map((p) => [p.id, p]));

      highlightRef.current = (id) => {
        for (const p of planets) {
          const on = p.id === id;
          p.mesh.scale.setScalar(on ? 1.15 : 1);
          (p.mesh.material as import('three').MeshPhysicalMaterial).emissiveIntensity = on ? p.baseEmissive + 0.3 : p.baseEmissive;
          p.arc.scale.setScalar(on ? 1.12 : 1);
        }
        requestRenderRef.current();
      };

      // --- Habits: satellites with trails (consistent) or drift (missed) ---
      type Sat = {
        holder: import('three').Object3D;
        mesh: import('three').Mesh;
        angle: number;
        speed: number;
        radius: number;
        drift: number;
        trail?: { geo: import('three').BufferGeometry; positions: Float32Array; colors: Float32Array; filled: number; color: import('three').Color };
      };
      const sats: Sat[] = [];
      const satById = new Map<string, Sat>();
      const tmp = new THREE.Vector3();
      habits.forEach((h, i) => {
        const parentPlanet = h.goalId ? planetById.get(h.goalId) : undefined;
        const holder = new THREE.Object3D();
        holder.rotation.x = 0.45 + (hash01(h.id) - 0.5) * 0.6;
        (parentPlanet ? parentPlanet.anchor : core).add(holder);
        const radius = parentPlanet ? 1.75 + (i % 3) * 0.42 : coreR * 3.1 + (i % 4) * 0.55;
        const c = new THREE.Color(h.color);
        const missed = h.consistency < 0.4;
        const color = missed ? c.clone().lerp(new THREE.Color('#4a5670'), 0.55) : c;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(parentPlanet ? 0.15 : 0.19, 20, 20),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: missed ? 0.15 : 0.5 + h.consistency * 1.8 })
        );
        holder.add(mesh);
        if (h.streakRing) {
          // A long streak leaves a visible orbit: momentum you can see.
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.012, 6, 160),
            new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
          );
          ring.rotation.x = Math.PI / 2;
          holder.add(ring);
        }
        const sat: Sat = {
          holder,
          mesh,
          angle: hash01(h.id + 'a') * Math.PI * 2,
          speed: 0.45 + Math.min(1.1, h.streak * 0.05),
          radius,
          drift: missed ? (1 - h.consistency) * 0.55 : 0,
        };
        if (h.consistency >= 0.5) {
          const N = 46;
          const positions = new Float32Array(N * 3);
          const colors = new Float32Array(N * 3);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          geo.setDrawRange(0, 0);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          line.frustumCulled = false;
          world.add(line);
          sat.trail = { geo, positions, colors, filled: 0, color: c.clone().multiplyScalar(0.6 + h.consistency * 0.6) };
        }
        sats.push(sat);
        satById.set(h.id, sat);
      });

      // --- Deep work linked to goals: energy streams from the core ---
      type Stream = { planet: Planet; t: Float32Array; speed: Float32Array; geo: import('three').BufferGeometry; positions: Float32Array };
      const streamObjs: Stream[] = [];
      for (const s of streams) {
        const planet = planetById.get(s.goalId);
        if (!planet || s.minutes <= 0) continue;
        const n = Math.max(14, Math.min(140, Math.round(14 + s.minutes / 4)));
        const t = new Float32Array(n);
        const speed = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          t[i] = Math.random();
          speed[i] = 0.12 + Math.random() * 0.1;
        }
        const positions = new Float32Array(n * 3);
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const mix = accent.clone().lerp(planet.color, t[i]);
          colors.set([mix.r, mix.g, mix.b], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const pts = new THREE.Points(
          geo,
          new THREE.PointsMaterial({ map: disc, size: 0.2, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        pts.frustumCulled = false;
        world.add(pts);
        streamObjs.push({ planet, t, speed, geo, positions });
      }
      const p0 = new THREE.Vector3();
      const p1 = new THREE.Vector3();
      const pc = new THREE.Vector3();
      const updateStreams = (dt: number) => {
        for (const s of streamObjs) {
          s.planet.anchor.getWorldPosition(p1);
          world.worldToLocal(p1);
          p0.set(0, 0, 0);
          pc.copy(p1).multiplyScalar(0.5);
          pc.y += 2.6 + p1.length() * 0.08;
          for (let i = 0; i < s.t.length; i++) {
            if (dt) s.t[i] = (s.t[i] + s.speed[i] * dt) % 1;
            const u = s.t[i];
            const a = (1 - u) * (1 - u);
            const b = 2 * (1 - u) * u;
            const c = u * u;
            s.positions[i * 3] = a * p0.x + b * pc.x + c * p1.x;
            s.positions[i * 3 + 1] = a * p0.y + b * pc.y + c * p1.y;
            s.positions[i * 3 + 2] = a * p0.z + b * pc.z + c * p1.z;
          }
          (s.geo.attributes.position as import('three').BufferAttribute).needsUpdate = true;
        }
      };

      // --- Journal: memory nodes and light threads ---
      const memGroup = new THREE.Group();
      world.add(memGroup);
      const memPos: import('three').Vector3[] = [];
      const memSprites = new Map<string, import('three').Sprite>();
      const memMat = new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(214,224,238,0.85)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 });
      memories.slice(0, 70).forEach((m) => {
        const theta = hash01(m.id) * Math.PI * 2;
        const phi = Math.acos(2 * hash01(m.id + 'p') - 1);
        const r = memR + (hash01(m.id + 'r') - 0.5) * 4;
        const v = new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.45, r * Math.sin(phi) * Math.sin(theta));
        memPos.push(v);
        const s = new THREE.Sprite(memMat);
        s.position.copy(v);
        s.scale.setScalar(0.9);
        s.userData = { memoryId: m.id, title: 'Journal entry' };
        memGroup.add(s);
        memSprites.set(m.id, s);
      });
      // Threads: each memory links to at most its two nearest neighbours that share a tag
      // (or, untagged, to the next entry in time) — a delicate web, not a tangle.
      const segs: number[] = [];
      const shown = memories.slice(0, 70);
      const maxLen = memR * 0.75;
      const seen = new Set<string>();
      const link = (i: number, j: number) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key) || memPos[i].distanceTo(memPos[j]) > maxLen) return;
        seen.add(key);
        segs.push(...memPos[i].toArray(), ...memPos[j].toArray());
      };
      shown.forEach((m, i) => {
        const near = shown
          .map((o, j) => ({ j, d: memPos[i].distanceTo(memPos[j]), share: j !== i && m.tags.some((t) => o.tags.includes(t)) }))
          .filter((x) => x.share)
          .sort((x, y) => x.d - y.d)
          .slice(0, 2);
        if (near.length) near.forEach((x) => link(i, x.j));
        else if (i + 1 < shown.length) link(i, i + 1);
      });
      if (segs.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
        memGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: CINEMA.palette.steel, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false })));
      }

      // --- Projects: orbital systems (task satellites, milestone waypoints, progress field) ---
      type ProjectSys = { id: string; pivot: import('three').Object3D; anchor: import('three').Object3D; spin: import('three').Object3D; core: import('three').Mesh; speed: number };
      const projectSystems: ProjectSys[] = [];
      const projR = outerR + 2.3;
      projects.slice(0, 8).forEach((pr, i) => {
        const color = new THREE.Color(pr.color);
        const pivot = new THREE.Object3D();
        pivot.rotation.y = hash01(pr.id) * Math.PI * 2 + i * 0.7;
        const tilt = new THREE.Object3D();
        tilt.rotation.x = -0.12 + (i % 3) * 0.08;
        world.add(tilt);
        tilt.add(pivot);
        const anchor = new THREE.Object3D();
        anchor.position.x = projR + (i % 2) * 0.8;
        pivot.add(anchor);
        const coreMesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32, 0),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 + pr.progress * 0.8, metalness: 0.6, roughness: 0.25, flatShading: true })
        );
        coreMesh.userData = { projectId: pr.id, title: pr.title };
        anchor.add(coreMesh);
        // Progress as an energy field that grows as the project advances.
        const field = new THREE.Mesh(
          new THREE.SphereGeometry(0.55 + pr.progress * 0.75, 24, 24),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05 + pr.progress * 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        anchor.add(field);
        const spin = new THREE.Object3D();
        spin.rotation.x = 0.5;
        anchor.add(spin);
        // Milestones as waypoints on a thin ring: bright when done.
        const wayR = 1.25;
        const ringLine = new THREE.Mesh(new THREE.TorusGeometry(wayR, 0.008, 4, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 }));
        ringLine.rotation.x = Math.PI / 2;
        spin.add(ringLine);
        pr.milestones.slice(0, 12).forEach((m, k, arr) => {
          const a = (k / arr.length) * Math.PI * 2;
          const wp = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.08, 0),
            new THREE.MeshBasicMaterial({ color: m.done ? color : new THREE.Color('#55627e'), toneMapped: !m.done })
          );
          wp.position.set(Math.cos(a) * wayR, 0, Math.sin(a) * wayR);
          spin.add(wp);
        });
        // Tasks as small satellites: done ones bright, open ones dim (max 14 drawn).
        const total = Math.min(14, pr.openTasks + pr.doneTasks);
        const doneShown = Math.round((pr.doneTasks / Math.max(1, pr.openTasks + pr.doneTasks)) * total);
        for (let k = 0; k < total; k++) {
          const a = (k / Math.max(1, total)) * Math.PI * 2 + 0.3;
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 8),
            new THREE.MeshBasicMaterial({ color: k < doneShown ? color : new THREE.Color('#3e4a63'), toneMapped: k >= doneShown })
          );
          dot.position.set(Math.cos(a) * 0.8, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.8);
          spin.add(dot);
        }
        projectSystems.push({ id: pr.id, pivot, anchor, spin, core: coreMesh, speed: 0.02 + 0.02 / (i + 1) });
      });
      const projectById = new Map(projectSystems.map((x) => [x.id, x]));

      // --- Check-in pulse: an expanding ring of light at a habit's satellite ---
      const pulseTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d')!;
        g.strokeStyle = 'rgba(255,255,255,1)';
        g.lineWidth = 10;
        g.beginPath();
        g.arc(64, 64, 52, 0, Math.PI * 2);
        g.stroke();
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const pulses: { sprite: import('three').Sprite; age: number }[] = [];
      firePulseRef.current = (habitId) => {
        const sat = satById.get(habitId);
        if (!sat) return;
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: pulseTex, color: (sat.mesh.material as import('three').MeshStandardMaterial).color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        sat.mesh.getWorldPosition(sp.position);
        world.worldToLocal(sp.position);
        sp.scale.setScalar(0.4);
        world.add(sp);
        pulses.push({ sprite: sp, age: 0 });
        requestRender();
      };

      // --- Selection: camera glides to the chosen goal, project or memory; the rest dims ---
      const focus = { kind: null as null | 'goal' | 'project' | 'memory' | 'core' | 'memories', id: '', dim: 0, returning: false };
      const tgt = new THREE.Vector3();
      const desiredCam = new THREE.Vector3();
      const reduced = prefersReducedMotion();
      const objectFor = (kind: 'goal' | 'project' | 'memory' | 'core' | 'memories', id: string): import('three').Object3D | undefined =>
        kind === 'goal' ? planetById.get(id)?.anchor : kind === 'project' ? projectById.get(id)?.anchor : kind === 'memory' ? memSprites.get(id) : core;
      focusRef.current = (sel) => {
        if (sel && objectFor(sel.kind, sel.id)) {
          focus.kind = sel.kind;
          focus.id = sel.id;
          focus.returning = false;
        } else if (focus.kind) {
          focus.kind = null;
          focus.returning = true;
        }
        memSprites.forEach((sp, id) => sp.scale.setScalar(sel?.kind === 'memory' && sel.id === id ? 1.5 : 0.9));
        requestRender();
      };
      tourStopRef.current = (stop) => {
        if (!stop || stop.kind === 'home') {
          if (focus.kind) focus.returning = true;
          focus.kind = null;
        } else if (stop.kind === 'core' || stop.kind === 'memories') {
          focus.kind = stop.kind;
          focus.id = '';
          focus.returning = false;
        } else if ('id' in stop && objectFor(stop.kind, stop.id)) {
          focus.kind = stop.kind;
          focus.id = stop.id;
          focus.returning = false;
        }
        highlightRef.current(stop && 'id' in stop && stop.kind === 'goal' ? stop.id : null);
        requestRender();
      };
      const baseFog = (scene.fog as import('three').FogExp2).density;
      const updateFocus = (dt: number): boolean => {
        // Exponential settle (no linear motion): ~95% of the way in about 1 s.
        const k = reduced ? 1 : settleFactor(CINEMA.camera.focusRate, dt);
        let moving = false;
        if (focus.kind === 'memories') {
          // Tour overview of the journal shell: pull back and up so the whole web is visible.
          controls.target.lerp(tgt.set(0, 0, 0), k);
          desiredCam.copy(home).multiplyScalar(1.35);
          desiredCam.y += memR * 0.35;
          camera.position.lerp(desiredCam, k);
          moving = camera.position.distanceTo(desiredCam) > 0.03;
        } else if (focus.kind) {
          const obj = objectFor(focus.kind, focus.id);
          if (obj) {
            obj.getWorldPosition(tgt);
            const dist = focus.kind === 'core' ? coreR * 7 : focus.kind === 'memory' ? 13 : focus.kind === 'project' ? 12 : 15;
            desiredCam.copy(camera.position).sub(controls.target).normalize().multiplyScalar(dist).add(tgt);
            desiredCam.y = Math.max(desiredCam.y, tgt.y + 2.2);
            controls.target.lerp(tgt, k);
            camera.position.lerp(desiredCam, k);
            moving = camera.position.distanceTo(desiredCam) > 0.02 || controls.target.distanceTo(tgt) > 0.02;
          }
        } else if (focus.returning) {
          controls.target.lerp(tgt.set(0, 0, 0), k);
          camera.position.lerp(home, k);
          moving = camera.position.distanceTo(home) > 0.03;
          if (!moving) focus.returning = false;
        }
        const dimTarget = focus.kind && focus.kind !== 'core' && focus.kind !== 'memories' ? 1 : 0;
        const prevDim = focus.dim;
        focus.dim += (dimTarget - focus.dim) * (reduced ? 1 : Math.min(1, dt * 3));
        if (Math.abs(focus.dim - prevDim) > 0.001) {
          (scene.fog as import('three').FogExp2).density = baseFog + focus.dim * 0.005 + ff.level * 0.004;
          orbitMat.opacity = 0.1 * (1 - focus.dim * 0.6);
          memMat.opacity = 0.75 * (focus.kind === 'memory' ? 1 : 1 - focus.dim * 0.55);
          moving = true;
        }
        return moving;
      };

      // --- Focus field: while deep work runs, the scene quiets and the goal gets a soft halo ---
      const ff = { level: 0 };
      const ffHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(198,164,107,0.5)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      world.add(ffHalo);
      const updateFocusField = (dt: number, t: number): boolean => {
        const target = focusFieldRef.current ? 1 : 0;
        const prev = ff.level;
        ff.level += (target - ff.level) * (reduced ? 1 : Math.min(1, dt * 1.2));
        const active = ff.level > 0.002;
        if (active) {
          const goal = focusFieldRef.current?.goalId ? planetById.get(focusFieldRef.current.goalId) : undefined;
          (goal ? goal.anchor : core).getWorldPosition(ffHalo.position);
          world.worldToLocal(ffHalo.position);
          const base = goal ? 4.2 : coreR * 8;
          ffHalo.scale.setScalar(base * (1 + (reduced ? 0 : Math.sin(t * 0.6) * 0.06)));
          (ffHalo.material as import('three').SpriteMaterial).opacity = ff.level * 0.55;
          energyRing.scale.setScalar(1 - ff.level * 0.2);
          atmosphere.setNebulaLevel(1 - ff.level * 0.55);
          (scene.fog as import('three').FogExp2).density = baseFog + focus.dim * 0.005 + ff.level * 0.004;
        } else if (prev > 0) {
          (ffHalo.material as import('three').SpriteMaterial).opacity = 0;
        }
        return Math.abs(ff.level - prev) > 0.001;
      };

      // --- Post-processing: bloom on true highlights, ACES output, mild vignette + faint grain ---
      const postFX = new PostFX(THREE, mods, renderer, scene, camera, { width, height }, {
        bloom: tierSet.bloom,
        grain: tierSet.grain,
        chromaticAberration: tierSet.chromaticAberration,
        renderScale: tierSet.renderScale,
      });
      // --- Cinematic camera: reveal (first open only), scroll path, micro-parallax, idle breath ---
      const rig = new CinematicCameraRig(THREE, mount, {
        motion: !reducedMotion,
        intro: !cameraStateRef.current,
        onChange: () => requestRenderRef.current(),
      });

      // --- Interaction: picking, parallax, reset ---
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let downAt = 0;
      const pickables: import('three').Object3D[] = [...planets.map((p) => p.mesh), ...projectSystems.map((x) => x.core), ...memSprites.values()];
      const pick = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(pickables, false)[0]?.object;
      };
      const onMove = (e: PointerEvent) => {
        const hit = pick(e);
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        cbRef.current.onHover?.(hit ? (hit.userData.title as string) : null);
        requestRender();
      };
      const onLeave = () => {
        cbRef.current.onHover?.(null);
      };
      const onDown = () => {
        downAt = performance.now();
        rig.skipIntro(); // the user takes the camera: don't keep gliding
      };
      const onUp = (e: PointerEvent) => {
        if (performance.now() - downAt > 250) return; // a drag, not a click
        const hit = pick(e);
        if (!hit) return;
        if (hit.userData.goalId) cbRef.current.onSelectGoal?.(hit.userData.goalId as string);
        else if (hit.userData.projectId) cbRef.current.onSelectProject?.(hit.userData.projectId as string);
        else if (hit.userData.memoryId) cbRef.current.onSelectMemory?.(hit.userData.memoryId as string);
      };
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerleave', onLeave);
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      let needsRender = true;
      const requestRender = () => (needsRender = true);
      requestRenderRef.current = requestRender;
      controls.addEventListener('change', requestRender);
      // Restore the previous camera after a rebuild (e.g. a habit check-in).
      if (cameraStateRef.current) {
        camera.position.fromArray(cameraStateRef.current.pos);
        controls.target.fromArray(cameraStateRef.current.target);
        controls.update();
      }
      resetRef.current = () => {
        focus.kind = null;
        focus.returning = false;
        camera.position.copy(home);
        controls.target.set(0, 0, 0);
        controls.update();
        world.rotation.set(0, 0, 0);
        requestRender();
      };

      const ro = new ResizeObserver(() => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height);
        postFX.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        requestRender();
      });
      ro.observe(mount);

      // --- Loop: animates only while visible and not paused; otherwise renders on demand ---
      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) requestRender();
      });
      io.observe(mount);
      const timer = new THREE.Timer();
      let raf = 0;
      // Adaptive quality: PerformanceManager measures fps in 2 s windows and steps the tier down.
      function applyTier(tier: QualityTier, set: ReturnType<typeof tierSettings>) {
        const ratio = Math.min(window.devicePixelRatio, set.pixelRatioCap);
        lighting.setShadowQuality(set.shadowQuality);
        renderer.setPixelRatio(ratio);
        postFX.setPixelRatio(ratio);
        postFX.setSize(width, height);
        postFX.setQuality({
          bloom: set.bloom,
          grain: set.grain,
          chromaticAberration: set.chromaticAberration,
          renderScale: set.renderScale,
        });
        if (!set.glassTransmission) switchGlassToSheen();
        if (atmosphere.dust && tier === 'low') atmosphere.dust.visible = false;
        requestRender();
      }
      // Glass refraction costs an extra scene render: below "high" it becomes a cheap sheen.
      function switchGlassToSheen() {
        const gm = glass.material as import('three').MeshPhysicalMaterial;
        if (gm.transmission === 0) return;
        gm.transmission = 0;
        gm.transparent = true;
        gm.opacity = 0.28;
        gm.needsUpdate = true;
      }
      if (!tierSet.glassTransmission) switchGlassToSheen();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        timer.update();
        const dt = Math.min(0.05, timer.getDelta());
        if (!visible || document.hidden) {
          perfMgr.resetWindow();
          return;
        }
        const animate = !pausedRef.current;
        const focusing = updateFocus(dt) || updateFocusField(dt, timer.getElapsed());
        const calm = 1 - ff.level * 0.75;
        const damping = controls.update();
        if (!animate && !needsRender && !damping && !focusing && !pulses.length && !rig.revealing) return;
        needsRender = false;
        const t = timer.getElapsed();
        if (animate) perfMgr.sample(dt);
        else perfMgr.resetWindow();

        if (animate) {
          world.rotation.y += 0.012 * dt * calm;
          for (const p of planets) {
            p.pivot.rotation.y += p.speed * dt;
            p.mesh.rotation.y += 0.25 * dt;
            p.mesh.rotation.x += 0.1 * dt;
            p.arc.rotation.z += 0.15 * dt;
          }
          ringA.rotation.z += 0.12 * dt;
          ringB.rotation.z -= 0.08 * dt;
          energyRing.rotation.y += 0.09 * dt * (1 - ff.level * 0.4);
          memGroup.rotation.y -= 0.006 * dt;
          for (const ps of projectSystems) {
            ps.pivot.rotation.y += ps.speed * dt;
            ps.spin.rotation.y += 0.3 * dt;
            ps.core.rotation.y += 0.5 * dt;
          }
          atmosphere.update(dt, t, calm);
          // Slow "breathing" on the hero: the core's glow swells very slightly.
          halo.scale.setScalar(coreR * (6.5 + Math.sin(t * 0.7) * 0.3));
          heart.scale.setScalar(1 + Math.sin(t * 0.7) * 0.015);
        }
        for (const s of sats) {
          if (animate) s.angle += s.speed * dt;
          const r = s.radius + Math.sin(t * 0.7 + s.angle) * s.drift;
          s.mesh.position.set(Math.cos(s.angle) * r, s.drift ? Math.sin(t * 0.9 + s.angle) * s.drift * 0.6 : 0, Math.sin(s.angle) * r);
          if (s.trail) {
            s.mesh.getWorldPosition(tmp);
            world.worldToLocal(tmp);
            const tr = s.trail;
            const N = tr.positions.length / 3;
            if (animate || tr.filled === 0) {
              tr.positions.copyWithin(3, 0, (N - 1) * 3);
              tr.positions[0] = tmp.x;
              tr.positions[1] = tmp.y;
              tr.positions[2] = tmp.z;
              tr.filled = Math.min(N, tr.filled + 1);
              for (let k = 0; k < N; k++) {
                const f = 1 - k / N;
                const k3 = k * 3;
                tr.colors[k3] = tr.color.r * f;
                tr.colors[k3 + 1] = tr.color.g * f;
                tr.colors[k3 + 2] = tr.color.b * f;
              }
              tr.geo.setDrawRange(0, tr.filled);
              (tr.geo.attributes.position as import('three').BufferAttribute).needsUpdate = true;
              (tr.geo.attributes.color as import('three').BufferAttribute).needsUpdate = true;
            }
          }
        }
        updateStreams(animate ? dt : 0);
        for (let i = pulses.length - 1; i >= 0; i--) {
          const ps = pulses[i];
          ps.age += Math.max(dt, 1 / 60);
          const f = ps.age / 1.4;
          ps.sprite.scale.setScalar(0.4 + f * 4);
          (ps.sprite.material as import('three').SpriteMaterial).opacity = Math.max(0, 1 - f);
          if (f >= 1) {
            world.remove(ps.sprite);
            (ps.sprite.material as import('three').SpriteMaterial).dispose();
            pulses.splice(i, 1);
          }
        }
        // Cinematic offset is added for this frame only, so OrbitControls never sees it.
        rig.apply(camera, controls.target, t, dt);
        postFX.render(t);
        rig.restore(camera, controls.target);
      };
      // Pre-fill trails so they exist even when motion starts paused.
      for (let k = 0; k < 46; k++) {
        for (const s of sats) s.angle -= s.speed * 0.05;
      }
      tick();
      setStatus('ready');
      // Re-apply selection and any check-in pulse that arrived while rebuilding.
      highlightRef.current(selectionRef.current?.kind === 'goal' ? selectionRef.current.id : null);
      if (tourRef.current) tourStopRef.current(tourRef.current);
      else focusRef.current(selectionRef.current);
      if (pendingPulseRef.current && Date.now() - pendingPulseRef.current.at < 4000) {
        firePulseRef.current(pendingPulseRef.current.habitId);
        pendingPulseRef.current = null;
      }

      cleanup = () => {
        cameraStateRef.current = { pos: camera.position.toArray(), target: controls.target.toArray() };
        cancelAnimationFrame(raf);
        pulseTex.dispose();
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        rig.dispose();
        postFX.dispose();
        lighting.dispose();
        detailMaps.dispose();
        scene.traverse((o) => {
          const m = o as import('three').Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as import('three').Material | import('three').Material[] | undefined;
          const disposeMat = (x: import('three').Material) => {
            const anyMat = x as import('three').Material & {
              map?: import('three').Texture | null;
              roughnessMap?: import('three').Texture | null;
              bumpMap?: import('three').Texture | null;
              normalMap?: import('three').Texture | null;
              metalnessMap?: import('three').Texture | null;
            };
            anyMat.map?.dispose?.();
            anyMat.roughnessMap?.dispose?.();
            anyMat.bumpMap?.dispose?.();
            anyMat.normalMap?.dispose?.();
            anyMat.metalnessMap?.dispose?.();
            x.dispose();
          };
          if (Array.isArray(mat)) mat.forEach(disposeMat);
          else if (mat) disposeMat(mat);
        });
        atmosphere.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" />
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-[var(--hub-muted)]">Loading constellation…</div>}
      {status === 'unsupported' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[var(--hub-muted)]">
          3D isn’t available on this device. Everything it shows is in the panels on this page.
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute bottom-3 right-3 flex gap-1.5 z-10">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? 'Resume constellation motion' : 'Pause constellation motion'}
            className="os-chip p-2 cursor-pointer"
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button type="button" onClick={() => resetRef.current()} aria-label="Reset constellation view" className="os-chip p-2 cursor-pointer">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
