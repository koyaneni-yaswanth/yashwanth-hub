/**
 * BuddyCoreScene: Dedicated Three.js r187 3D companion core for /buddy.
 * Expresses all 8 JARVIS 4.0 visual states cleanly without clutter:
 * idle | listening | thinking | speaking | observing | working | attention | error
 */
import React, { useEffect, useRef, useState } from 'react';
import { BUDDY_VISUAL_STATES } from '../../lib/companionIdentity';
import { LightingDirector } from '../momentum/cinema/LightingDirector';
import { Atmosphere } from '../momentum/cinema/Atmosphere';
import { PostFX } from '../momentum/cinema/PostFX';
import { PerformanceManager } from '../momentum/cinema/PerformanceManager';
import {
  HEX_FLOOR_FRAGMENT_SHADER,
  HEX_FLOOR_VERTEX_SHADER,
  JARVIS_CORE_FRAGMENT_SHADER,
  JARVIS_CORE_VERTEX_SHADER,
} from '../jarvis/jarvisShaders';
import type { BuddyVisualState } from '../../types';

interface Props {
  visualState: BuddyVisualState;
  micLevel?: number; // 0..1 when listening
  speakingEnergy?: number; // 0..1 when speaking
  onCoreClick?: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function detectSoftwareGpu(renderer: import('three').WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software|mesa offscreen|microsoft basic render/i.test(raw);
  } catch {
    return false;
  }
}

function makeRadialTexture(
  THREE: typeof import('three'),
  inner: string,
  outer = 'rgba(0,0,0,0)',
  size = 128
): import('three').CanvasTexture {
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

export const BuddyCoreScene: React.FC<Props> = ({
  visualState,
  micLevel = 0,
  speakingEnergy = 0,
  onCoreClick,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglStatus, setWebglStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');

  const liveRef = useRef({ visualState, micLevel, speakingEnergy });
  useEffect(() => {
    liveRef.current = { visualState, micLevel, speakingEnergy };
    if (typeof window !== 'undefined') {
      const prev = (window as any).__BUDDY_SCENE_STATE__ || {};
      (window as any).__BUDDY_SCENE_STATE__ = {
        ...prev,
        visualState,
        micLevel,
        speakingEnergy,
      };
    }
  }, [visualState, micLevel, speakingEnergy]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let isMounted = true;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import('three');
        const [
          { EffectComposer },
          { RenderPass },
          { UnrealBloomPass },
          { OutputPass },
          { ShaderPass },
          { RoomEnvironment },
        ] = await Promise.all([
          import('three/examples/jsm/postprocessing/EffectComposer.js'),
          import('three/examples/jsm/postprocessing/RenderPass.js'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/postprocessing/OutputPass.js'),
          import('three/examples/jsm/postprocessing/ShaderPass.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        if (!isMounted) return;

        const reduced = prefersReducedMotion();
        const width = Math.max(260, mount.clientWidth || 440);
        const height = Math.max(240, mount.clientHeight || 340);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
        const isSoft = detectSoftwareGpu(renderer);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoft ? 1.0 : 1.75));
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        mount.innerHTML = '';
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#05070D');

        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 140);
        camera.position.set(0, 0.45, 7.6);
        camera.lookAt(0, 0, 0);

        const radialFn = (inner: string, outer?: string, size?: number) =>
          makeRadialTexture(THREE, inner, outer, size);
        const discTex = makeRadialTexture(THREE, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)', 64);

        const initialDevice = PerformanceManager.readDevice(width, reduced || isSoft);
        let postFX: PostFX | null = null;
        const perf = new PerformanceManager(initialDevice, (nextTier, nextSettings) => {
          postFX?.setQuality({
            bloom: !isSoft && nextSettings.bloom,
            grain: nextSettings.grain,
            chromaticAberration: nextTier === 'high' && !isSoft,
            renderScale: nextSettings.renderScale,
          });
          lighting.setShadowQuality(nextTier === 'high' ? 'high' : nextTier === 'medium' ? 'medium' : 'off');
        });

        const lighting = new LightingDirector(THREE, renderer, scene, RoomEnvironment, {
          shadows: isSoft || reduced ? 'off' : 'medium',
        });
        const atmosphere = new Atmosphere(
          THREE,
          scene,
          discTex,
          radialFn,
          isSoft || reduced ? { starsFar: 180, starsNear: 60, dust: 0 } : { starsFar: 420, starsNear: 120, dust: 60 },
          { fogDensity: 0.022 }
        );
        postFX = new PostFX(
          THREE,
          { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass },
          renderer,
          scene,
          camera,
          { width, height },
          {
            bloom: !isSoft && !reduced && perf.settings.bloom,
            grain: !reduced && perf.settings.grain,
            renderScale: perf.settings.renderScale,
          }
        );

        // Central holographic companion icosphere
        const coreGroup = new THREE.Group();
        scene.add(coreGroup);
        coreGroup.add(lighting.coreLight);

        const coreGeo = new THREE.IcosahedronGeometry(1.38, 4);
        const initialSpec = BUDDY_VISUAL_STATES[liveRef.current.visualState];
        const primaryColor = new THREE.Color(initialSpec.primaryHex);
        const secondaryColor = new THREE.Color(initialSpec.secondaryHex);

        const coreMat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uPulseRate: { value: initialSpec.pulseRate },
            uDispAmp: { value: initialSpec.displacementAmp },
            uPrimaryColor: { value: primaryColor.clone() },
            uSecondaryColor: { value: secondaryColor.clone() },
            uEnergy: { value: 0.72 },
          },
          vertexShader: JARVIS_CORE_VERTEX_SHADER,
          fragmentShader: JARVIS_CORE_FRAGMENT_SHADER,
          transparent: true,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreGroup.add(coreMesh);

        // Outer translucent geodesic cage
        const cageGeo = new THREE.IcosahedronGeometry(1.68, 2);
        const cageMat = new THREE.MeshBasicMaterial({
          color: initialSpec.primaryHex,
          wireframe: true,
          transparent: true,
          opacity: 0.24,
        });
        const cageMesh = new THREE.Mesh(cageGeo, cageMat);
        coreGroup.add(cageMesh);

        // Three concentric orbital rings
        const rings: Array<{ mesh: import('three').Mesh; mat: import('three').MeshBasicMaterial }> = [];
        const ringRadii = [2.05, 2.38, 2.72];
        const ringTilts: Array<[number, number]> = [
          [Math.PI / 2.2, 0.25],
          [Math.PI / 3.1, -0.55],
          [-Math.PI / 4, 0.42],
        ];
        ringRadii.forEach((radius, idx) => {
          const rg = new THREE.TorusGeometry(radius, 0.014, 12, 96);
          const rm = new THREE.MeshBasicMaterial({
            color: idx % 2 === 0 ? initialSpec.primaryHex : initialSpec.secondaryHex,
            transparent: true,
            opacity: 0.42 - idx * 0.08,
          });
          const ring = new THREE.Mesh(rg, rm);
          ring.rotation.set(ringTilts[idx][0], 0, ringTilts[idx][1]);
          coreGroup.add(ring);
          rings.push({ mesh: ring, mat: rm });
        });

        // Volumetric hex radar floor beneath companion
        const floorGeo = new THREE.PlaneGeometry(24, 24);
        const floorMat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uGridColor: { value: new THREE.Color('#13243B') },
            uAccentColor: { value: new THREE.Color('#3BE8FF') },
          },
          vertexShader: HEX_FLOOR_VERTEX_SHADER,
          fragmentShader: HEX_FLOOR_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
        });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = -2.45;
        scene.add(floorMesh);

        const ro = new ResizeObserver((entries) => {
          if (!isMounted) return;
          for (const entry of entries) {
            const w = Math.max(240, Math.round(entry.contentRect.width));
            const h = Math.max(220, Math.round(entry.contentRect.height));
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            postFX?.setSize(w, h);
          }
        });
        ro.observe(mount);

        setWebglStatus('ready');
        if (typeof window !== 'undefined') {
          (window as any).__BUDDY_SCENE_STATE__ = {
            ...(window as any).__BUDDY_SCENE_STATE__,
            webglActive: true,
            reducedMotion: reduced,
            tier: perf.tier,
          };
        }

        let raf = 0;
        let lastTs = performance.now();
        let elapsed = 0;
        const targetPrimary = new THREE.Color();
        const targetSecondary = new THREE.Color();

        const renderFrame = (nowTs: number) => {
          if (!isMounted) return;
          const dt = Math.min(0.05, Math.max(0.001, (nowTs - lastTs) / 1000));
          lastTs = nowTs;
          const current = liveRef.current;
          const spec = BUDDY_VISUAL_STATES[current.visualState] || BUDDY_VISUAL_STATES.idle;

          if (!reduced) {
            elapsed += dt;
            perf.sample(dt);
          }

          const voiceBoost =
            current.visualState === 'listening'
              ? current.micLevel * 0.85
              : current.visualState === 'speaking'
              ? (0.35 + 0.45 * Math.abs(Math.sin(elapsed * 8.5))) * (0.4 + current.speakingEnergy)
              : 0;

          targetPrimary.set(spec.primaryHex);
          targetSecondary.set(spec.secondaryHex);

          (coreMat.uniforms.uPrimaryColor.value as import('three').Color).lerp(targetPrimary, Math.min(1, dt * 6));
          (coreMat.uniforms.uSecondaryColor.value as import('three').Color).lerp(targetSecondary, Math.min(1, dt * 6));
          coreMat.uniforms.uTime.value = elapsed;
          coreMat.uniforms.uPulseRate.value += (spec.pulseRate - coreMat.uniforms.uPulseRate.value) * Math.min(1, dt * 5);
          coreMat.uniforms.uDispAmp.value +=
            (spec.displacementAmp + voiceBoost * 0.045 - coreMat.uniforms.uDispAmp.value) * Math.min(1, dt * 7);
          coreMat.uniforms.uEnergy.value = 0.65 + voiceBoost * 0.85 + (current.visualState === 'thinking' ? 0.35 : 0);

          const scaleBreath =
            1 +
            (reduced ? 0 : Math.sin(elapsed * (1.2 + spec.pulseRate)) * 0.025) +
            voiceBoost * 0.085;
          coreMesh.scale.setScalar(scaleBreath);

          cageMat.color.lerp(targetPrimary, Math.min(1, dt * 6));
          cageMat.opacity = current.visualState === 'error' ? 0.36 : 0.22 + voiceBoost * 0.14;
          floorMat.uniforms.uTime.value = elapsed;
          (floorMat.uniforms.uAccentColor.value as import('three').Color).lerp(targetPrimary, Math.min(1, dt * 4));
          lighting.coreLight.color.lerp(targetPrimary, Math.min(1, dt * 5));

          if (!reduced) {
            coreMesh.rotation.y += dt * 0.18 * spec.spinMultiplier;
            cageMesh.rotation.y -= dt * 0.12 * spec.spinMultiplier;
            cageMesh.rotation.x += dt * 0.06 * spec.spinMultiplier;
            rings.forEach((r, idx) => {
              const dir = idx % 2 === 0 ? 1 : -1;
              r.mesh.rotation.z += dt * (0.16 + idx * 0.07) * dir * spec.spinMultiplier;
              r.mesh.rotation.x += dt * 0.05 * dir * spec.spinMultiplier;
              const s = 1 + voiceBoost * (0.06 + idx * 0.02);
              r.mesh.scale.setScalar(s);
              r.mat.color.lerp(idx % 2 === 0 ? targetPrimary : targetSecondary, Math.min(1, dt * 5));
            });
            atmosphere.update(dt, elapsed, 1);
          }

          postFX?.render(elapsed);

          if (!reduced) {
            raf = requestAnimationFrame(renderFrame);
          }
        };

        renderFrame(performance.now());
        cleanup = () => {
          isMounted = false;
          cancelAnimationFrame(raf);
          ro.disconnect();
          coreGeo.dispose();
          coreMat.dispose();
          cageGeo.dispose();
          cageMat.dispose();
          floorGeo.dispose();
          floorMat.dispose();
          rings.forEach((r) => {
            r.mesh.geometry.dispose();
            r.mat.dispose();
          });
          discTex.dispose();
          atmosphere.dispose();
          lighting.dispose();
          postFX?.dispose();
          renderer.dispose();
          if (mount.contains(renderer.domElement)) {
            mount.removeChild(renderer.domElement);
          }
        };
      } catch {
        if (isMounted) {
          setWebglStatus('fallback');
          if (typeof window !== 'undefined') {
            (window as any).__BUDDY_SCENE_STATE__ = {
              ...(window as any).__BUDDY_SCENE_STATE__,
              webglActive: false,
            };
          }
        }
      }
    })();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  const spec = BUDDY_VISUAL_STATES[visualState] || BUDDY_VISUAL_STATES.idle;

  return (
    <div
      className="relative w-full h-[250px] sm:h-[310px] rounded-2xl overflow-hidden border border-white/10 bg-[#05070D] select-none cursor-pointer"
      onClick={onCoreClick}
      role="img"
      aria-label={`JARVIS Companion Core state: ${spec.label}. ${spec.shortHint}`}
      data-buddy-state={visualState}
    >
      <div ref={mountRef} className="w-full h-full" />

      {webglStatus === 'fallback' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070D]">
          <div
            className="w-32 h-32 rounded-full animate-pulse transition-all duration-500"
            style={{
              background: `radial-gradient(circle, ${spec.primaryHex}66 0%, ${spec.secondaryHex}28 55%, transparent 72%)`,
              boxShadow: `0 0 48px ${spec.primaryHex}44, inset 0 0 28px ${spec.primaryHex}55`,
              transform: `scale(${1 + micLevel * 0.18 + speakingEnergy * 0.14})`,
            }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-md border border-white/10 px-3 py-1 text-[11px] font-medium text-slate-200">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: spec.primaryHex,
            boxShadow: `0 0 10px ${spec.primaryHex}`,
          }}
        />
        <span>{spec.label}</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-400">{spec.shortHint}</span>
      </div>
    </div>
  );
};
