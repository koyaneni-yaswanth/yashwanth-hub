import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { hash01 } from '../../lib/lifeDomains';

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
  selectedGoalId?: string | null;
  onSelectGoal?: (goalId: string) => void;
  onHover?: (label: string | null) => void;
}

const ACCENT = '#7dd3fc';

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
  const { score, goals, habits, streams, unlinkedFocusMinutes, memories, selectedGoalId } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const pausedRef = useRef(paused);
  const resetRef = useRef<() => void>(() => {});
  const highlightRef = useRef<(id: string | null) => void>(() => {});
  const requestRenderRef = useRef<() => void>(() => {});
  const cbRef = useRef({ onSelectGoal: props.onSelectGoal, onHover: props.onHover });

  useEffect(() => {
    cbRef.current = { onSelectGoal: props.onSelectGoal, onHover: props.onHover };
  }, [props.onSelectGoal, props.onHover]);
  useEffect(() => {
    pausedRef.current = paused;
    requestRenderRef.current();
  }, [paused]);
  useEffect(() => {
    highlightRef.current(selectedGoalId ?? null);
  }, [selectedGoalId, status]);

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
      }),
    [score, goals, habits, streams, unlinkedFocusMinutes, memories]
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
      };
      try {
        THREE = await import('three');
        const [oc, ec, rp, ub, op, re] = await Promise.all([
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/postprocessing/EffectComposer.js'),
          import('three/examples/jsm/postprocessing/RenderPass.js'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/postprocessing/OutputPass.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        mods = {
          OrbitControls: oc.OrbitControls,
          EffectComposer: ec.EffectComposer,
          RenderPass: rp.RenderPass,
          UnrealBloomPass: ub.UnrealBloomPass,
          OutputPass: op.OutputPass,
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
      let height = mount.clientHeight || 500;
      const small = width < 640;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 1.75));
      renderer.setSize(width, height);
      renderer.setClearColor(0x04060d, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'pan-y';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x050914, 0.011);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new mods.RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      scene.environmentIntensity = 0.35;

      const accent = new THREE.Color(ACCENT);
      const world = new THREE.Group();
      scene.add(world);

      // --- Layout maths ---
      const coreR = 1.15 + ((score ?? 35) / 100) * 0.85;
      const orbitR = (i: number) => 5.4 + i * 2.15;
      const outerR = goals.length ? orbitR(goals.length - 1) + 1.6 : coreR * 3.5;
      const memR = outerR + 4.5;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 400);
      // Portrait frames (phones) need the camera further back so outer planets aren't cut off.
      const portrait = Math.max(1, 1.2 / Math.max(0.45, width / height));
      const home = new THREE.Vector3(0, (outerR * 0.58 + 3) * portrait, (outerR * 1.72 + 6) * portrait);
      camera.position.copy(home);

      const controls = new mods.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = false; // page scroll stays page scroll
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = 1.75;

      // --- Lights ---
      scene.add(new THREE.AmbientLight(0x6f86b8, 0.25));
      const coreLight = new THREE.PointLight(ACCENT, 60, 0, 1.6);
      world.add(coreLight);
      const rim = new THREE.DirectionalLight(0x9fb8ff, 1.4);
      rim.position.set(-12, 9, -14);
      scene.add(rim);
      const key = new THREE.DirectionalLight(0xffffff, 0.6);
      key.position.set(10, 6, 12);
      scene.add(key);

      // --- Nebula + stars (behind everything, unaffected by fog) ---
      const disc = radialTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
      const nebulaColors = ['rgba(98,64,214,0.55)', 'rgba(29,78,216,0.5)', 'rgba(14,116,144,0.45)'];
      nebulaColors.forEach((c, i) => {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: radialTexture(THREE, c, 'rgba(0,0,0,0)', 256), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
        );
        s.position.set([-40, 35, 5][i], [12, -6, 22][i], -90 - i * 12);
        s.scale.setScalar(110 + i * 20);
        scene.add(s);
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
          new THREE.PointsMaterial({ map: disc, size, sizeAttenuation: true, color: 0xdfe8ff, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
        );
        scene.add(pts);
        return pts;
      };
      const starsFar = makeStars(small ? 700 : 1400, 90, 160, 0.9, 0.7);
      const starsNear = makeStars(small ? 160 : 320, 40, 80, 0.55, 0.55);

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
      core.add(glass);
      const metal = new THREE.MeshStandardMaterial({ color: 0xc9d4e8, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(coreR * 1.42, 0.04, 16, 180), metal);
      ringA.rotation.x = Math.PI / 2.15;
      core.add(ringA);
      const ringB = new THREE.Mesh(new THREE.TorusGeometry(coreR * 1.72, 0.022, 12, 180), metal);
      ringB.rotation.set(Math.PI / 2.6, 0.5, 0);
      core.add(ringB);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(125,211,252,0.38)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
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
      const orbitMat = new THREE.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.1 });
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
            roughness: 0.16,
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
          p.mesh.scale.setScalar(on ? 1.3 : 1);
          (p.mesh.material as import('three').MeshPhysicalMaterial).emissiveIntensity = on ? p.baseEmissive + 0.8 : p.baseEmissive;
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
      const memMat = new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(200,185,255,0.9)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 });
      memories.slice(0, 70).forEach((m) => {
        const theta = hash01(m.id) * Math.PI * 2;
        const phi = Math.acos(2 * hash01(m.id + 'p') - 1);
        const r = memR + (hash01(m.id + 'r') - 0.5) * 4;
        const v = new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.45, r * Math.sin(phi) * Math.sin(theta));
        memPos.push(v);
        const s = new THREE.Sprite(memMat);
        s.position.copy(v);
        s.scale.setScalar(0.9);
        memGroup.add(s);
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
        memGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false })));
      }

      // --- Post-processing: gentle bloom ---
      const composer = new mods.EffectComposer(renderer);
      composer.addPass(new mods.RenderPass(scene, camera));
      const bloom = new mods.UnrealBloomPass(new THREE.Vector2(width, height), small ? 0.42 : 0.5, 0.5, 0.22);
      composer.addPass(bloom);
      composer.addPass(new mods.OutputPass());

      // --- Interaction: picking, parallax, reset ---
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
      let downAt = 0;
      const pickables = planets.map((p) => p.mesh);
      const pick = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(pickables, false)[0]?.object;
      };
      const onMove = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        parallax.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 0.16;
        parallax.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 0.08;
        const hit = pick(e);
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        cbRef.current.onHover?.(hit ? (hit.userData.title as string) : null);
        requestRender();
      };
      const onLeave = () => {
        parallax.tx = 0;
        parallax.ty = 0;
        cbRef.current.onHover?.(null);
      };
      const onDown = () => (downAt = performance.now());
      const onUp = (e: PointerEvent) => {
        if (performance.now() - downAt > 250) return; // a drag, not a click
        const hit = pick(e);
        if (hit) cbRef.current.onSelectGoal?.(hit.userData.goalId as string);
      };
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerleave', onLeave);
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      let needsRender = true;
      const requestRender = () => (needsRender = true);
      requestRenderRef.current = requestRender;
      controls.addEventListener('change', requestRender);
      resetRef.current = () => {
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
        composer.setSize(width, height);
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
      // Adaptive quality: if the first few animated seconds run below ~28 fps, step down
      // once — lower resolution and swap glass refraction (an extra render pass) for shine.
      const perf = { frames: 0, time: 0, done: false };
      const stepDown = () => {
        perf.done = true;
        renderer.setPixelRatio(1);
        composer.setPixelRatio(1);
        composer.setSize(width, height);
        const gm = glass.material as import('three').MeshPhysicalMaterial;
        gm.transmission = 0;
        gm.transparent = true;
        gm.opacity = 0.28;
        gm.needsUpdate = true;
      };
      const tick = () => {
        raf = requestAnimationFrame(tick);
        timer.update();
        const dt = Math.min(0.05, timer.getDelta());
        if (!visible || document.hidden) return;
        const animate = !pausedRef.current;
        const damping = controls.update();
        if (!animate && !needsRender && !damping) return;
        needsRender = false;
        const t = timer.getElapsed();
        if (animate && !perf.done) {
          perf.frames++;
          perf.time += dt;
          if (perf.time >= 3) {
            if (perf.frames / perf.time < 28) stepDown();
            else perf.done = true;
          }
        }

        if (animate) {
          world.rotation.y += 0.012 * dt;
          for (const p of planets) {
            p.pivot.rotation.y += p.speed * dt;
            p.mesh.rotation.y += 0.25 * dt;
            p.mesh.rotation.x += 0.1 * dt;
            p.arc.rotation.z += 0.15 * dt;
          }
          ringA.rotation.z += 0.12 * dt;
          ringB.rotation.z -= 0.08 * dt;
          energyRing.rotation.y += 0.09 * dt;
          memGroup.rotation.y -= 0.006 * dt;
          starsNear.rotation.y += 0.004 * dt;
          starsFar.rotation.y += 0.0015 * dt;
          halo.scale.setScalar(coreR * (6.5 + Math.sin(t * 0.8) * 0.35));
          parallax.x += (parallax.tx - parallax.x) * 0.04;
          parallax.y += (parallax.ty - parallax.y) * 0.04;
          scene.rotation.y = parallax.x;
          scene.rotation.x = parallax.y;
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
              tr.positions.set([tmp.x, tmp.y, tmp.z], 0);
              tr.filled = Math.min(N, tr.filled + 1);
              for (let k = 0; k < N; k++) {
                const f = 1 - k / N;
                tr.colors.set([tr.color.r * f, tr.color.g * f, tr.color.b * f], k * 3);
              }
              tr.geo.setDrawRange(0, tr.filled);
              (tr.geo.attributes.position as import('three').BufferAttribute).needsUpdate = true;
              (tr.geo.attributes.color as import('three').BufferAttribute).needsUpdate = true;
            }
          }
        }
        updateStreams(animate ? dt : 0);
        composer.render();
      };
      // Pre-fill trails so they exist even when motion starts paused.
      for (let k = 0; k < 46; k++) {
        for (const s of sats) s.angle -= s.speed * 0.05;
      }
      tick();
      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        composer.dispose();
        pmrem.dispose();
        envTex.dispose();
        scene.traverse((o) => {
          const m = o as import('three').Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as import('three').Material | import('three').Material[] | undefined;
          const disposeMat = (x: import('three').Material) => {
            const anyMat = x as import('three').Material & { map?: import('three').Texture | null };
            anyMat.map?.dispose?.();
            x.dispose();
          };
          if (Array.isArray(mat)) mat.forEach(disposeMat);
          else if (mat) disposeMat(mat);
        });
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
