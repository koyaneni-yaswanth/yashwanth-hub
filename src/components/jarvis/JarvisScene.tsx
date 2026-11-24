/**
 * JarvisScene: the Jarvis core and its orbiting workspace nodes (three r187, WebGLRenderer).
 *
 * Structure
 * - JarvisCore: a luminous gold heart inside a faceted shell, three precision rings at different
 *   tilts, a gimbal dial of 120 instanced ticks, and two steel arc segments.
 * - WorkspaceNodes: one faceted node per real workspace on a tilted orbit; colour from the area.
 * - Atmosphere, LightingDirector, PostFX, PerformanceManager and CinematicCameraRig are the shared
 *   modules from src/components/momentum/cinema (one config, one look across the app).
 *
 * The 3D is decorative for assistive tech (aria-hidden canvas). Every node is mirrored by a real,
 * focusable button positioned over it, which is also the direct (no-animation) way to navigate.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { WorkspaceNode } from '../../lib/jarvisWorkspaces';
import { nodeAngles } from '../../lib/jarvisWorkspaces';
import { CINEMA, easeInOutCubic } from '../momentum/cinema/cinemaConfig';
import { CinematicCameraRig } from '../momentum/cinema/CinematicCameraRig';
import { LightingDirector } from '../momentum/cinema/LightingDirector';
import { Atmosphere } from '../momentum/cinema/Atmosphere';
import { PostFX } from '../momentum/cinema/PostFX';
import { PerformanceManager } from '../momentum/cinema/PerformanceManager';
import { NodeButtons } from './NodeButtons';

/** Tunables specific to this scene (shared look lives in CINEMA). */
const JARVIS = {
  cameraHome: [0, 4.6, 14.2] as const,
  nodeRingRadius: 5.6,
  nodeRingTilt: 0.32,
  nodeSpin: 0.035, // rad/s, the whole node ring
  coreSpin: [0.18, -0.12, 0.07] as const, // ring speeds
  glideSeconds: 0.75, // camera move before opening a workspace
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
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

type Props = {
  nodes: WorkspaceNode[];
  onOpen: (node: WorkspaceNode) => void;
  onOpenCore: () => void;
};

export const JarvisScene: React.FC<Props> = ({ nodes, onOpen, onOpenCore }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const coreLabelRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const api = useRef<{ highlight: (id: string | null) => void; glide: (id: string, done: () => void) => boolean }>({
    highlight: () => {},
    glide: () => false,
  });
  const openRef = useRef({ onOpen, onOpenCore });
  useEffect(() => {
    openRef.current = { onOpen, onOpenCore };
  }, [onOpen, onOpenCore]);
  const [panelWidth, setPanelWidth] = useState(800);
  const busy = useRef(false);
  // Rebuild only when the set of nodes (not their status text) changes.
  const key = nodes.map((n) => `${n.id}|${n.color}`).join(',');

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
        mods = { EffectComposer: ec.EffectComposer, RenderPass: rp.RenderPass, UnrealBloomPass: ub.UnrealBloomPass, OutputPass: op.OutputPass, ShaderPass: sp.ShaderPass, RoomEnvironment: re.RoomEnvironment };
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
      const perf = new PerformanceManager(PerformanceManager.readDevice(width, reduced), (_tier, set) => {
        const ratio = Math.min(window.devicePixelRatio, set.pixelRatioCap);
        renderer.setPixelRatio(ratio);
        postFX.setPixelRatio(ratio);
        postFX.setSize(width, height);
        postFX.setQuality({ bloom: set.bloom, grain: set.grain });
        if (!set.glassTransmission) toSheen();
        if (atmosphere.dust && set.dust === 0) atmosphere.dust.visible = false;
        needsRender = true;
      });
      const tier = perf.settings;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatioCap));
      renderer.setSize(width, height);
      renderer.setClearColor(CINEMA.palette.background, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = CINEMA.renderer.exposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(CINEMA.palette.background);
      const lighting = new LightingDirector(THREE, renderer, scene, mods.RoomEnvironment);
      const disc = radialTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
      const atmosphere = new Atmosphere(THREE, scene, disc, (i, o, s) => radialTexture(THREE, i, o, s), {
        starsFar: Math.round(tier.starsFar * 0.6),
        starsNear: Math.round(tier.starsNear * 0.6),
        dust: tier.dust,
      });

      const camera = new THREE.PerspectiveCamera(CINEMA.camera.fov, width / height, 0.1, 400);
      const home = new THREE.Vector3(...JARVIS.cameraHome);
      // Narrow (portrait) panels need the camera further back to keep the ring in frame.
      const fit = () => Math.max(1, 1.45 / Math.max(0.6, width / height));
      const base = new THREE.Vector3().copy(home).multiplyScalar(fit());
      camera.position.copy(base);
      // Aim slightly below the core so the orbit (and its front node) sits fully inside the panel.
      const aim = new THREE.Vector3(0, -0.9, 0);
      const target = aim.clone();
      camera.lookAt(target);

      // ------------------------------------------------------------------ JarvisCore
      const gold = new THREE.Color(CINEMA.palette.accent);
      const steel = new THREE.Color(CINEMA.palette.steel);
      const core = new THREE.Group();
      scene.add(core);
      core.add(lighting.coreLight);
      const heart = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.62, 3),
        new THREE.MeshStandardMaterial({ color: gold, emissive: gold, emissiveIntensity: 1.25, roughness: 0.4 })
      );
      core.add(heart);
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.15, 1),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.08,
          transmission: tier.glassTransmission ? 1 : 0,
          transparent: !tier.glassTransmission,
          opacity: tier.glassTransmission ? 1 : 0.22,
          thickness: 1.1,
          ior: 1.4,
          clearcoat: 1,
          attenuationColor: gold,
          attenuationDistance: 2.5,
          flatShading: true,
          envMapIntensity: 1.2,
        })
      );
      core.add(shell);
      function toSheen() {
        const m = shell.material as import('three').MeshPhysicalMaterial;
        if (m.transmission === 0) return;
        m.transmission = 0;
        m.transparent = true;
        m.opacity = 0.22;
        m.needsUpdate = true;
      }
      const metal = new THREE.MeshStandardMaterial({ color: CINEMA.palette.metal, metalness: 1, roughness: 0.26, envMapIntensity: 1.3 });
      const rings = [
        { r: 1.65, tube: 0.032, rot: [Math.PI / 2.1, 0, 0] },
        { r: 1.95, tube: 0.018, rot: [Math.PI / 2.8, 0.6, 0.2] },
        { r: 2.3, tube: 0.012, rot: [Math.PI / 1.7, -0.4, 0.5] },
      ].map((d) => {
        const holder = new THREE.Object3D();
        holder.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(d.r, d.tube, 12, 200), metal);
        holder.add(ring);
        core.add(holder);
        return ring;
      });
      // Precision gimbal dial: 120 instanced ticks, every 10th one longer and gold.
      const tickGeo = new THREE.BoxGeometry(0.018, 0.018, 0.14);
      const ticks = new THREE.InstancedMesh(tickGeo, new THREE.MeshStandardMaterial({ color: 0xbfb8aa, metalness: 0.8, roughness: 0.35 }), 120);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      const ps = new THREE.Vector3();
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const major = i % 10 === 0;
        ps.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
        sc.set(1, 1, major ? 2.2 : 1);
        ticks.setMatrixAt(i, m4.compose(ps, q, sc));
        if (major) ticks.setColorAt(i, gold);
      }
      const dial = new THREE.Object3D();
      dial.rotation.x = 0.08;
      dial.add(ticks);
      core.add(dial);
      // Two steel arc segments: emissive, slow counter-rotation.
      const arcs = [0, 1].map((k) => {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(3.1 + k * 0.18, 0.012, 6, 120, Math.PI * (0.55 - k * 0.15)),
          new THREE.MeshBasicMaterial({ color: steel, toneMapped: false, transparent: true, opacity: 0.75 })
        );
        arc.rotation.x = Math.PI / 2 + 0.08;
        arc.rotation.z = k * Math.PI;
        core.add(arc);
        return arc;
      });
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: radialTexture(THREE, 'rgba(198,164,107,0.2)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      halo.scale.setScalar(6.2);
      core.add(halo);

      // ------------------------------------------------------------------ WorkspaceNodes
      const ring = new THREE.Object3D();
      ring.rotation.x = JARVIS.nodeRingTilt;
      scene.add(ring);
      const orbitPts = Array.from({ length: 241 }, (_, k) => {
        const a = (k / 240) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * JARVIS.nodeRingRadius, 0, Math.sin(a) * JARVIS.nodeRingRadius);
      });
      ring.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPts), new THREE.LineBasicMaterial({ color: steel, transparent: true, opacity: 0.16 })));
      const angles = nodeAngles(nodes.length);
      const nodeObjs = nodes.map((n, i) => {
        const color = new THREE.Color(n.color);
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.3, 0),
          new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.22, clearcoat: 1, flatShading: true })
        );
        mesh.position.set(Math.cos(angles[i]) * JARVIS.nodeRingRadius, 0, Math.sin(angles[i]) * JARVIS.nodeRingRadius);
        ring.add(mesh);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: radialTexture(THREE, `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},0.55)`), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        glow.scale.setScalar(1.6);
        mesh.add(glow);
        return { id: n.id, mesh, glow };
      });
      let highlighted: string | null = null;
      api.current.highlight = (id) => {
        highlighted = id;
        for (const o of nodeObjs) {
          const on = o.id === id;
          o.mesh.scale.setScalar(on ? 1.35 : 1);
          (o.mesh.material as import('three').MeshPhysicalMaterial).emissiveIntensity = on ? 0.9 : 0.35;
          (o.glow.material as import('three').SpriteMaterial).opacity = on ? 1 : 0;
        }
        needsRender = true;
      };

      // ------------------------------------------------------------------ Post, camera rig
      const postFX = new PostFX(THREE, mods, renderer, scene, camera, { width, height }, { bloom: tier.bloom, grain: tier.grain });
      let needsRender = true;
      const rig = new CinematicCameraRig(THREE, mount, { motion: !reduced, intro: true, onChange: () => (needsRender = true) });

      // Click → short camera glide towards the node, then open the workspace.
      const glide = { id: '', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), look: new THREE.Vector3(), done: null as null | (() => void) };
      const world = new THREE.Vector3();
      api.current.glide = (id, done) => {
        const o = nodeObjs.find((x) => x.id === id);
        if (!o || reduced) return false;
        rig.skipIntro();
        o.mesh.getWorldPosition(world);
        glide.id = id;
        glide.t = 0;
        glide.from.copy(base);
        glide.look.copy(world);
        glide.to.copy(world).multiplyScalar(1.35).add(new THREE.Vector3(0, 1.4, 2.4));
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
          o.mesh.getWorldPosition(proj);
          const depth = proj.z;
          proj.project(camera);
          const x = (proj.x * 0.5 + 0.5) * w;
          const y = (-proj.y * 0.5 + 0.5) * h;
          // Labels sit under their node, or above it near the bottom edge so they never clip.
          const below = y < h - 48;
          el.style.transform = below ? `translate(${x}px, ${y + 20}px) translate(-50%, 0)` : `translate(${x}px, ${y - 20}px) translate(-50%, -100%)`;
          // Nodes behind the core recede (still focusable and readable on focus).
          el.dataset.depth = depth < -1 ? 'back' : 'front';
        }
        const c = coreLabelRef.current;
        if (c) {
          proj.set(0, -1.9, 0).project(camera);
          c.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px) translate(-50%, 0)`;
        }
      };

      // ------------------------------------------------------------------ Resize, visibility, context loss
      const ro = new ResizeObserver(() => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height);
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

      // ------------------------------------------------------------------ Loop
      const timer = new THREE.Timer();
      let raf = 0;
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
        if (animate) {
          perf.sample(dt);
          rings[0].rotation.z += JARVIS.coreSpin[0] * dt;
          rings[1].rotation.z += JARVIS.coreSpin[1] * dt;
          rings[2].rotation.z += JARVIS.coreSpin[2] * dt;
          dial.rotation.y -= 0.02 * dt;
          arcs[0].rotation.z += 0.09 * dt;
          arcs[1].rotation.z -= 0.06 * dt;
          shell.rotation.y += 0.05 * dt;
          heart.scale.setScalar(1 + Math.sin(t * 0.8) * 0.025);
          halo.scale.setScalar(6.2 + Math.sin(t * 0.8) * 0.25);
          // The orbit holds still while a node is hovered or focused, so it's easy to hit.
          if (!glide.done && !highlighted) ring.rotation.y += JARVIS.nodeSpin * dt;
          for (const o of nodeObjs) o.mesh.rotation.y += 0.4 * dt;
          atmosphere.update(dt, t, 1);
        }
        if (glide.done) {
          glide.t += dt / JARVIS.glideSeconds;
          const e = easeInOutCubic(glide.t);
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
    api.current.highlight(id);
    const el = id ? labelRefs.current.get(id) : null;
    const box = mountRef.current?.getBoundingClientRect();
    if (!el || !box) {
      setTip(null);
      return;
    }
    // Anchor the tooltip to the focused label's on-screen position.
    const r = el.getBoundingClientRect();
    setPanelWidth(box.width);
    setTip({ x: r.left + r.width / 2 - box.left, y: r.top - box.top });
  };
  const openNode = (n: WorkspaceNode) => {
    if (busy.current) return;
    busy.current = true;
    const started = api.current.glide(n.id, () => openRef.current.onOpen(n));
    if (!started) openRef.current.onOpen(n);
  };

  if (status === 'unsupported') {
    return (
      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
        <p className="mb-3 text-xs text-[var(--hub-muted)]">The 3D view isn’t available on this device.</p>
        <NodeButtons nodes={nodes} onOpen={onOpen} />
      </div>
    );
  }

  const hoveredNode = nodes.find((n) => n.id === hovered);
  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" />
      {status === 'loading' && <NodeButtons nodes={nodes} onOpen={onOpen} className="absolute inset-x-4 bottom-4 sm:inset-x-5" />}
      {status === 'ready' && (
        <>
          <ul className="absolute inset-0 pointer-events-none" aria-label="Workspaces">
            {nodes.map((n) => (
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
                  aria-label={`${n.label}${n.status ? `, ${n.status}` : ''}. Open workspace`}
                  className="jarvis-node-label pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-[var(--hub-ink)] bg-[rgba(5,6,8,0.55)] border border-white/10 hover:border-[var(--hub-accent)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] cursor-pointer transition-opacity duration-300 data-[depth=back]:opacity-45 hover:opacity-100 focus-visible:opacity-100"
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            ref={coreLabelRef}
            type="button"
            onClick={() => onOpenCore()}
            className="absolute left-0 top-0 rounded-full px-3 py-1 text-[0.6875rem] font-medium text-[var(--hub-accent)] bg-[rgba(5,6,8,0.55)] border border-[var(--hub-accent)]/30 hover:border-[var(--hub-accent)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] cursor-pointer"
          >
            Ask Jarvis
          </button>
          {hoveredNode && tip && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-0 top-0 w-60 rounded-xl border border-white/10 bg-[rgba(10,13,18,0.92)] p-3 shadow-lg"
              style={{ transform: `translate(${Math.min(Math.max(tip.x, 130), panelWidth - 130)}px, ${Math.max(8, tip.y - 8)}px) translate(-50%, -100%)` }}
            >
              <p className="font-heading text-sm font-semibold text-[var(--hub-ink)]">{hoveredNode.label}</p>
              <p className="mt-0.5 text-xs text-[var(--hub-muted)]">{hoveredNode.description}</p>
              <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--hub-accent)]">{hoveredNode.status ?? 'Open workspace'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
