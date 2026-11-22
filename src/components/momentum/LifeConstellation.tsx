import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { GoalForecast } from '../../lib/momentum';

export interface ConstellationHabit {
  id: string;
  title: string;
  goalId?: string;
  /** 0–1: check-ins vs. target over the last 14 days. */
  consistency: number;
  /** Current streak length (drives orbit speed). */
  streak: number;
}

interface LifeConstellationProps {
  score: number | null;
  forecasts: GoalForecast[];
  habits: ConstellationHabit[];
  /** Focus minutes over the last 7 days (drives the energy ring density). */
  focusMinutes: number;
  /** Journal entries overall (faint "memory" stars in the background). */
  memories: number;
  /** Called when a goal planet or its list entry is chosen. */
  onSelectGoal?: (goalId: string) => void;
  selectedGoalId?: string | null;
}

const PACE_LABEL: Record<GoalForecast['pace'], string> = {
  ahead: 'Ahead of pace',
  'on-track': 'On track',
  'at-risk': 'Behind pace',
  'no-plan': 'No milestones planned',
  'no-deadline': 'No deadline',
};

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A 3D map of your life system: momentum at the centre, goals as planets (size
 * = planned milestones, colour = pace), habits as moons (brightness =
 * consistency, speed = streak), deep work as an energy ring, journal entries as
 * background stars. Purely a visual summary — every fact it shows is also in
 * the list beside it, which is the keyboard/screen-reader path.
 */
export const LifeConstellation: React.FC<LifeConstellationProps> = ({
  score,
  forecasts,
  habits,
  focusMinutes,
  memories,
  onSelectGoal,
  selectedGoalId,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const [hovered, setHovered] = useState<string | null>(null);
  const pausedRef = useRef(paused);
  const resetRef = useRef<() => void>(() => {});
  const selectRef = useRef(onSelectGoal);
  const highlightRef = useRef<(id: string | null) => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    selectRef.current = onSelectGoal;
  }, [onSelectGoal]);
  useEffect(() => {
    highlightRef.current(selectedGoalId ?? null);
  }, [selectedGoalId, status]);

  // Rebuild the scene only when the data meaningfully changes.
  const signature = useMemo(
    () =>
      JSON.stringify({
        s: score,
        g: forecasts.map((f) => [f.goal.id, f.total, f.pace, Math.round(f.progress * 20)]),
        h: habits.map((h) => [h.id, h.goalId, Math.round(h.consistency * 10), Math.min(h.streak, 30)]),
        f: Math.round(focusMinutes / 30),
        m: Math.min(memories, 300),
      }),
    [score, forecasts, habits, focusMinutes, memories]
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let THREE: typeof import('three');
      let OrbitControlsCtor: typeof import('three/examples/jsm/controls/OrbitControls.js').OrbitControls;
      try {
        THREE = await import('three');
        ({ OrbitControls: OrbitControlsCtor } = await import('three/examples/jsm/controls/OrbitControls.js'));
      } catch {
        if (!disposed) setStatus('unsupported');
        return;
      }
      if (disposed) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      } catch {
        setStatus('unsupported');
        return;
      }

      const accent = new THREE.Color(cssVar('--viz-series-1', '#1f9e92'));
      const amber = new THREE.Color(cssVar('--hub-amber', '#f0a24b'));
      const muted = new THREE.Color(cssVar('--hub-muted', '#9bb4b7'));
      const ink = new THREE.Color(cssVar('--hub-ink', '#e6f0ef'));
      const isDark = document.documentElement.classList.contains('dark');

      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'pan-y';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
      // Frame the outermost orbit so no planet is clipped at the edges.
      const outer = 6 + Math.max(0, forecasts.length - 1) * 2.6 + 1.5;
      const home = new THREE.Vector3(0, outer * 0.95 + 3, outer * 2.1 + 6);
      camera.position.copy(home);

      const controls = new OrbitControlsCtor(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 10;
      controls.maxDistance = 80;
      controls.enableZoom = false; // page scroll stays page scroll
      resetRef.current = () => {
        camera.position.copy(home);
        controls.target.set(0, 0, 0);
        controls.update();
      };

      scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.45 : 0.85));
      const key = new THREE.PointLight(0xffffff, isDark ? 120 : 80, 0, 2);
      scene.add(key);

      // --- Core: momentum ---
      const coreSize = 1.2 + ((score ?? 30) / 100) * 1.3;
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(coreSize, 48, 48),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: isDark ? 0.9 : 0.5, roughness: 0.35 })
      );
      scene.add(core);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(coreSize * 1.7, 32, 32),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: isDark ? 0.12 : 0.08, depthWrite: false })
      );
      scene.add(glow);

      // --- Memory stars (journal) ---
      const starCount = Math.min(300, 40 + memories * 6);
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const r = 30 + Math.random() * 25;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        starPos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.6, r * Math.sin(p) * Math.sin(t)], i * 3);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: isDark ? ink : muted, size: 0.18, transparent: true, opacity: isDark ? 0.55 : 0.4, depthWrite: false })
      );
      scene.add(stars);

      // --- Energy ring (deep work) ---
      const ringCount = Math.min(900, 60 + Math.round(focusMinutes * 0.9));
      const ringPos = new Float32Array(ringCount * 3);
      for (let i = 0; i < ringCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = coreSize * 2.2 + (Math.random() - 0.5) * 0.9;
        ringPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.25, Math.sin(a) * r], i * 3);
      }
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
      const ring = new THREE.Points(ringGeo, new THREE.PointsMaterial({ color: accent, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = 0.35;
      scene.add(ring);

      // --- Goals (planets) and habits (moons) ---
      type Body = { pivot: import('three').Object3D; speed: number; mesh: import('three').Mesh; goalId?: string; baseScale: number };
      const bodies: Body[] = [];
      const pickables: import('three').Mesh[] = [];
      const orbitMat = new THREE.LineBasicMaterial({ color: muted, transparent: true, opacity: isDark ? 0.18 : 0.28 });

      const addOrbitLine = (radius: number, parent: import('three').Object3D) => {
        const pts = Array.from({ length: 129 }, (_, i) => {
          const a = (i / 128) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        });
        parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat));
      };

      const goalNodes = new Map<string, import('three').Object3D>();
      forecasts.forEach((f, i) => {
        const radius = 6 + i * 2.6;
        const tilt = new THREE.Object3D();
        tilt.rotation.x = 0.18 * ((i % 3) - 1);
        scene.add(tilt);
        addOrbitLine(radius, tilt);
        const pivot = new THREE.Object3D();
        pivot.rotation.y = (i / Math.max(1, forecasts.length)) * Math.PI * 2;
        tilt.add(pivot);
        const color = f.pace === 'at-risk' ? amber : f.goal.status === 'paused' ? muted : accent;
        const size = 0.45 + Math.min(1.1, f.total * 0.08);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(size, 32, 32),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 + f.progress * 0.6, roughness: 0.5 })
        );
        mesh.position.x = radius;
        mesh.userData = { goalId: f.goal.id, title: f.goal.title };
        pivot.add(mesh);
        pickables.push(mesh);
        goalNodes.set(f.goal.id, mesh);
        bodies.push({ pivot, speed: 0.05 + 0.08 / (i + 1), mesh, goalId: f.goal.id, baseScale: 1 });
      });

      habits.forEach((h, i) => {
        const parent = (h.goalId && goalNodes.get(h.goalId)) || core;
        const isMoon = parent !== core;
        const radius = isMoon ? 1.4 + (i % 3) * 0.45 : coreSize * 2.9 + (i % 4) * 0.6;
        const pivot = new THREE.Object3D();
        pivot.rotation.y = i * 1.7;
        pivot.rotation.x = isMoon ? 0.4 : 0.35;
        parent.add(pivot);
        const color = accent.clone().lerp(muted, 1 - h.consistency);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(isMoon ? 0.18 : 0.22, 16, 16),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 + h.consistency * 0.8 })
        );
        mesh.position.x = radius;
        pivot.add(mesh);
        bodies.push({ pivot, speed: 0.25 + Math.min(1.2, h.streak * 0.06), mesh, baseScale: 1 });
      });

      highlightRef.current = (id) => {
        for (const b of bodies) {
          if (!b.goalId) continue;
          const on = b.goalId === id;
          b.mesh.scale.setScalar(on ? 1.35 : 1);
          (b.mesh.material as import('three').MeshStandardMaterial).emissiveIntensity = on ? 1.1 : 0.4;
        }
      };
      highlightRef.current(selectedGoalId ?? null);

      // --- Picking ---
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let downAt = 0;
      const pick = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(pickables, false)[0]?.object;
      };
      const onMove = (e: PointerEvent) => {
        const hit = pick(e);
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        setHovered(hit ? (hit.userData.title as string) : null);
      };
      const onDown = () => {
        downAt = performance.now();
      };
      const onUp = (e: PointerEvent) => {
        if (performance.now() - downAt > 250) return; // a drag, not a click
        const hit = pick(e);
        if (hit) selectRef.current?.(hit.userData.goalId as string);
      };
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);
      renderer.domElement.addEventListener('pointerleave', () => setHovered(null));

      // --- Resize ---
      const ro = new ResizeObserver(() => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(mount);

      // --- Loop (pauses when off-screen or the tab is hidden) ---
      let visible = true;
      const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
      io.observe(mount);
      const timer = new THREE.Timer();
      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        timer.update();
        const dt = Math.min(0.05, timer.getDelta());
        if (!visible || document.hidden) return;
        if (!pausedRef.current) {
          for (const b of bodies) b.pivot.rotation.y += b.speed * dt;
          ring.rotation.y += 0.08 * dt;
          stars.rotation.y += 0.004 * dt;
          const breathe = 1 + Math.sin(timer.getElapsed() * 0.8) * 0.04;
          glow.scale.setScalar(breathe);
        }
        controls.update();
        renderer.render(scene, camera);
      };
      tick();
      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        scene.traverse((o) => {
          const m = o as import('three').Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as import('three').Material | import('three').Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose?.();
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
    <div className="grid lg:grid-cols-[1fr_16rem] gap-4">
      <div className="relative rounded-2xl overflow-hidden border border-[var(--hub-line)] bg-[radial-gradient(ellipse_at_center,var(--hub-surface-raised),var(--hub-bg))] min-h-[320px] sm:min-h-[380px]">
        <div ref={mountRef} className="absolute inset-0" />
        {status === 'loading' && (
          <div className="absolute inset-0 grid place-items-center text-sm text-[var(--hub-muted)]">Loading constellation…</div>
        )}
        {status === 'unsupported' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[var(--hub-muted)]">
            3D view isn’t available on this device. Everything it shows is in the list beside it.
          </div>
        )}
        {status === 'ready' && (
          <>
            <div className="absolute top-3 left-3 rounded-xl px-3 py-2 bg-[var(--hub-surface)]/85 backdrop-blur border border-[var(--hub-line)]">
              <p className="text-[11px] uppercase tracking-wider text-[var(--hub-muted)]">Momentum</p>
              <p className="text-2xl font-semibold text-[var(--hub-ink)] leading-tight">{score ?? '—'}</p>
            </div>
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}
                aria-label={paused ? 'Resume constellation motion' : 'Pause constellation motion'}
                className="p-2 rounded-lg bg-[var(--hub-surface)]/85 backdrop-blur border border-[var(--hub-line)] text-[var(--hub-ink)] cursor-pointer"
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => resetRef.current()}
                aria-label="Reset constellation view"
                className="p-2 rounded-lg bg-[var(--hub-surface)]/85 backdrop-blur border border-[var(--hub-line)] text-[var(--hub-ink)] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <p className="absolute bottom-3 left-3 right-3 text-xs text-[var(--hub-muted)] pointer-events-none" aria-hidden="true">
              {hovered ? <span className="font-semibold text-[var(--hub-ink)]">{hovered}</span> : 'Drag to rotate · click a planet to see its goal'}
            </p>
          </>
        )}
      </div>

      {/* The accessible, readable twin of the scene */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--hub-ink)]">In this constellation</h3>
        {forecasts.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)]">No goals yet. Add one in Goals &amp; Habits and it appears as a planet.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Goals in the constellation">
            {forecasts.map((f) => (
              <li key={f.goal.id}>
                <button
                  type="button"
                  onClick={() => onSelectGoal?.(f.goal.id)}
                  aria-pressed={selectedGoalId === f.goal.id}
                  className={`w-full text-left rounded-xl border px-3 py-2 cursor-pointer ${
                    selectedGoalId === f.goal.id
                      ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10'
                      : 'border-[var(--hub-line)] hover:bg-[var(--hub-surface-hover)]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: f.pace === 'at-risk' ? 'var(--hub-amber)' : f.goal.status === 'paused' ? 'var(--hub-muted)' : 'var(--viz-series-1)' }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-[var(--hub-ink)] truncate">{f.goal.title}</span>
                  </span>
                  <span className="block text-xs text-[var(--hub-muted)] mt-0.5">
                    {PACE_LABEL[f.pace]} · {f.done}/{f.total} milestones
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <dl className="text-xs text-[var(--hub-muted)] space-y-1 pt-2 border-t border-[var(--hub-line)]">
          <div className="flex justify-between gap-2">
            <dt>Habits (moons)</dt>
            <dd className="text-[var(--hub-ink)]">{habits.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Deep work, 7 days (ring)</dt>
            <dd className="text-[var(--hub-ink)]">{Math.round(focusMinutes)} min</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Journal entries (stars)</dt>
            <dd className="text-[var(--hub-ink)]">{memories}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-[var(--hub-muted)]">
          Planet size = milestones planned. Teal = on track, amber = behind pace, grey = paused. Brighter moons = more consistent habits.
        </p>
      </div>
    </div>
  );
};
