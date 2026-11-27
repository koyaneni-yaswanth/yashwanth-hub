import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Download,
  Expand,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  Minimize2,
  RotateCcw,
  Shrink,
  Sparkles,
  Sun,
} from 'lucide-react';
import { CAD_ASSEMBLY_PRESETS, type CadModelPresetId } from '../../lib/universeConfig';
import { createProceduralDetailMaps } from '../momentum/cinema/proceduralMaterials';

interface EngineeringModelViewerProps {
  preset: CadModelPresetId;
  title?: string;
  compact?: boolean;
}

type LightingMode = 'studio' | 'blueprint' | 'contrast';

function disposeObjectTree(THREE: typeof import('three'), root: import('three').Object3D) {
  root.traverse((obj) => {
    const mesh = obj as import('three').Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
  void THREE;
}

export const EngineeringModelViewer: React.FC<EngineeringModelViewerProps> = ({
  preset,
  title,
  compact = false,
}) => {
  const spec = CAD_ASSEMBLY_PRESETS[preset];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [webglStatus, setWebglStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [exploded, setExploded] = useState(0); // 0..1
  const [lighting, setLighting] = useState<LightingMode>('studio');
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(spec.parts[0]?.id ?? null);
  const [hiddenParts, setHiddenParts] = useState<Record<string, boolean>>({});
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jointJ1Deg, setJointJ1Deg] = useState(18);
  const [jointJ2Deg, setJointJ2Deg] = useState(-28);
  const [jointJ3Deg, setJointJ3Deg] = useState(42);
  const [uploadedBlobUrl, setUploadedBlobUrl] = useState<{ url: string; ext: string } | null>(null);
  const resetCamRef = useRef<() => void>(() => {});
  const exportStlRef = useRef<(() => Promise<void>) | null>(null);

  const controlsRef = useRef({
    wireframe,
    autoRotate,
    exploded,
    lighting,
    selectedPartId,
    hiddenParts,
    jointJ1Deg,
    jointJ2Deg,
    jointJ3Deg,
  });

  useEffect(() => {
    controlsRef.current = {
      wireframe,
      autoRotate,
      exploded,
      lighting,
      selectedPartId,
      hiddenParts,
      jointJ1Deg,
      jointJ2Deg,
      jointJ3Deg,
    };
  }, [wireframe, autoRotate, exploded, lighting, selectedPartId, hiddenParts, jointJ1Deg, jointJ2Deg, jointJ3Deg]);

  // Reset part selection on preset swap
  useEffect(() => {
    setSelectedPartId(CAD_ASSEMBLY_PRESETS[preset].parts[0]?.id ?? null);
    setHiddenParts({});
    setExploded(0);
    setCustomFileName(null);
    setUploadedBlobUrl((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setLoadError(null);
  }, [preset]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let mounted = true;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import('three');
        const [{ OrbitControls }, { RoomEnvironment }] = await Promise.all([
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);

        if (!mounted || !mount) return;
        let renderer: import('three').WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        } catch {
          if (mounted) setWebglStatus('fallback');
          return;
        }

        const width = Math.max(280, mount.clientWidth || 520);
        const height = Math.max(240, mount.clientHeight || (compact ? 260 : 380));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        mount.innerHTML = '';
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#06080E');

        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTex;
        scene.environmentIntensity = 0.55;
        const pbrMaps = createProceduralDetailMaps(THREE);

        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
        camera.position.set(3.2, 2.25, 3.6);

        const orbit = new OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.08;
        orbit.target.set(0, 0.65, 0);
        orbit.minDistance = 1.3;
        orbit.maxDistance = 12;

        resetCamRef.current = () => {
          camera.position.set(3.2, 2.25, 3.6);
          orbit.target.set(0, 0.65, 0);
          orbit.update();
        };

        const ambLight = new THREE.HemisphereLight('#C7D5E5', '#0A0D14', 0.85);
        const keyLight = new THREE.DirectionalLight('#FFE5BE', 2.2);
        keyLight.position.set(4, 6, 4);
        const rimLight = new THREE.DirectionalLight('#60A5FA', 1.4);
        rimLight.position.set(-5, 3, -4);
        scene.add(ambLight, keyLight, rimLight);

        const grid = new THREE.GridHelper(8, 24, '#C6A46B', '#1E293B');
        scene.add(grid);

        const rootGroup = new THREE.Group();
        scene.add(rootGroup);

        exportStlRef.current = async () => {
          const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
          const exporter = new STLExporter();
          const binary = exporter.parse(rootGroup, { binary: true }) as DataView;
          const bytes = new Uint8Array(binary.byteLength);
          bytes.set(new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength));
          const blob = new Blob([bytes], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${preset}-reference.stl`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        };

        const partNodes = new Map<string, { group: import('three').Object3D; basePos: import('three').Vector3; explodeVec: import('three').Vector3 }>();
        const managedMaterials: import('three').MeshStandardMaterial[] = [];

        const makeMat = (hex: string, metal = 0.55, rough = 0.3, emissive = '#000000') => {
          const mat = new THREE.MeshStandardMaterial({
            color: hex,
            metalness: metal,
            roughness: rough,
            roughnessMap: pbrMaps.metalRoughness,
            bumpMap: pbrMaps.metalBump,
            bumpScale: 0.008,
            emissive,
            emissiveIntensity: 0.35,
          });
          managedMaterials.push(mat);
          return mat;
        };

        // Load user CAD file if selected, else build accurate parametric reference assembly
        let customModelRoot: import('three').Object3D | null = null;
        let robotJ1: import('three').Group | null = null;
        let robotJ2: import('three').Group | null = null;
        let robotJ3: import('three').Group | null = null;
        let rotorSpinner: import('three').Group | null = null;

        if (uploadedBlobUrl) {
          try {
            const ext = uploadedBlobUrl.ext.toLowerCase();
            if (ext === 'stl') {
              const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
              const loader = new STLLoader();
              const geom = await loader.loadAsync(uploadedBlobUrl.url);
              geom.computeVertexNormals();
              const mat = makeMat('#C6A46B', 0.55, 0.32);
              const mesh = new THREE.Mesh(geom, mat);
              mesh.userData.partId = 'uploaded_cad';
              customModelRoot = new THREE.Group();
              customModelRoot.add(mesh);
            } else if (ext === 'obj') {
              const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
              const loader = new OBJLoader();
              customModelRoot = await loader.loadAsync(uploadedBlobUrl.url);
            } else {
              const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
                import('three/examples/jsm/loaders/GLTFLoader.js'),
                import('three/examples/jsm/loaders/DRACOLoader.js'),
              ]);
              const gltfLoader = new GLTFLoader();
              const draco = new DRACOLoader();
              draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
              gltfLoader.setDRACOLoader(draco);
              const gltf = await gltfLoader.loadAsync(uploadedBlobUrl.url);
              customModelRoot = gltf.scene;
              draco.dispose();
            }

            if (customModelRoot) {
              const box = new THREE.Box3().setFromObject(customModelRoot);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              const scale = 2.1 / Math.max(0.001, size.x, size.y, size.z);
              customModelRoot.scale.setScalar(scale);
              customModelRoot.position.set(-center.x * scale, -box.min.y * scale + 0.05, -center.z * scale);
              customModelRoot.traverse((child) => {
                const m = child as import('three').Mesh;
                if (m.isMesh && m.material) {
                  const mats = Array.isArray(m.material) ? m.material : [m.material];
                  for (const item of mats) {
                    if (item instanceof THREE.MeshStandardMaterial) managedMaterials.push(item);
                  }
                }
              });
              rootGroup.add(customModelRoot);
            }
          } catch (err) {
            if (mounted) {
              setLoadError(err instanceof Error ? err.message : 'Could not parse uploaded CAD file.');
            }
          }
        } else if (preset === 'pawan-turbine') {
          const registerPart = (id: string, group: import('three').Object3D, explodeVec: import('three').Vector3) => {
            rootGroup.add(group);
            partNodes.set(id, { group, basePos: group.position.clone(), explodeVec });
          };

          // Nacelle & mast (lathed aerodynamic shroud)
          const nacelle = new THREE.Group();
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.115, 1.35, 28), makeMat('#334155', 0.8, 0.25));
          mast.position.y = 0.675;
          const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 28), makeMat('#C6A46B', 0.85, 0.22));
          baseCollar.position.y = 0.04;
          const shroud = new THREE.Mesh(
            new THREE.LatheGeometry([
              new THREE.Vector2(0.02, -0.42),
              new THREE.Vector2(0.18, -0.38),
              new THREE.Vector2(0.25, -0.05),
              new THREE.Vector2(0.24, 0.28),
              new THREE.Vector2(0.16, 0.42),
            ], 28),
            makeMat('#1E293B', 0.78, 0.28)
          );
          shroud.rotation.x = Math.PI / 2;
          shroud.position.set(0, 1.32, -0.15);
          nacelle.add(mast, baseCollar, shroud);
          nacelle.traverse((o) => (o.userData.partId = 'nacelle'));
          registerPart('nacelle', nacelle, new THREE.Vector3(0, -0.35, -0.45));

          // Generator stator
          const generator = new THREE.Group();
          const stator = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 16, 36), makeMat('#C6A46B', 0.85, 0.22, '#78552B'));
          stator.position.set(0, 1.32, 0.16);
          generator.add(stator);
          generator.traverse((o) => (o.userData.partId = 'generator'));
          registerPart('generator', generator, new THREE.Vector3(0, 0, -0.1));

          // Planetary gearbox stage
          const gearbox = new THREE.Group();
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 28, 1, true), makeMat('#8BA8C8', 0.85, 0.25));
          ring.rotation.x = Math.PI / 2;
          ring.position.set(0, 1.32, 0.34);
          gearbox.add(ring);
          for (let i = 0; i < 3; i++) {
            const ang = (i * Math.PI * 2) / 3;
            const planet = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 16), makeMat('#F59E0B', 0.8, 0.25));
            planet.rotation.x = Math.PI / 2;
            planet.position.set(Math.cos(ang) * 0.12, 1.32 + Math.sin(ang) * 0.12, 0.34);
            gearbox.add(planet);
          }
          gearbox.traverse((o) => (o.userData.partId = 'gearbox'));
          registerPart('gearbox', gearbox, new THREE.Vector3(0, 0, 0.32));

          // Hub nosecone (lathed parabolic spinner)
          const hub = new THREE.Group();
          const cone = new THREE.Mesh(
            new THREE.LatheGeometry([
              new THREE.Vector2(0.0, 0.24),
              new THREE.Vector2(0.1, 0.13),
              new THREE.Vector2(0.175, -0.02),
              new THREE.Vector2(0.18, -0.1),
            ], 28),
            makeMat('#E2E8F0', 0.82, 0.2)
          );
          cone.rotation.x = Math.PI / 2;
          cone.position.set(0, 1.32, 0.68);
          hub.add(cone);
          hub.traverse((o) => (o.userData.partId = 'hub'));
          registerPart('hub', hub, new THREE.Vector3(0, 0, 0.85));

          // Archimedes helical blades x3
          rotorSpinner = new THREE.Group();
          rotorSpinner.position.set(0, 1.32, 0.56);
          const bladeMat = makeMat('#34D399', 0.45, 0.32, '#065F46');
          for (let i = 0; i < 3; i++) {
            const pts: import('three').Vector3[] = [];
            for (let s = 0; s <= 14; s++) {
              const u = s / 14;
              const r = 0.14 + u * 0.86;
              const twist = u * 1.45;
              pts.push(new THREE.Vector3(Math.cos(twist) * r * 0.25, u * 0.92, -u * 0.38));
            }
            const curve = new THREE.CatmullRomCurve3(pts);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.085, 10, false), bladeMat);
            tube.scale.set(1.75, 1, 0.42);
            const holder = new THREE.Group();
            holder.rotation.z = (i * Math.PI * 2) / 3;
            holder.add(tube);
            rotorSpinner.add(holder);
          }
          rotorSpinner.traverse((o) => (o.userData.partId = 'blades'));
          registerPart('blades', rotorSpinner, new THREE.Vector3(0, 0, 0.6));
        } else if (preset === 'piper-arm') {
          const base = new THREE.Group();
          const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.22, 28), makeMat('#1E293B', 0.8, 0.3));
          pedestal.position.y = 0.11;
          base.add(pedestal);
          base.traverse((o) => (o.userData.partId = 'base'));
          rootGroup.add(base);
          partNodes.set('base', { group: base, basePos: base.position.clone(), explodeVec: new THREE.Vector3(0, -0.2, 0) });

          robotJ1 = new THREE.Group();
          robotJ1.position.y = 0.22;
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.36, 24), makeMat('#38BDF8', 0.65, 0.3));
          turret.position.y = 0.18;
          turret.userData.partId = 'base';
          robotJ1.add(turret);
          rootGroup.add(robotJ1);

          robotJ2 = new THREE.Group();
          robotJ2.position.y = 0.36;
          const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.88, 0.16), makeMat('#E2E8F0', 0.72, 0.26));
          upper.position.y = 0.44;
          upper.userData.partId = 'upper_arm';
          robotJ2.add(upper);
          robotJ1.add(robotJ2);
          partNodes.set('upper_arm', { group: upper, basePos: upper.position.clone(), explodeVec: new THREE.Vector3(0.25, 0.15, 0) });

          robotJ3 = new THREE.Group();
          robotJ3.position.y = 0.88;
          const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.78, 20), makeMat('#C6A46B', 0.8, 0.24));
          forearm.position.y = 0.39;
          forearm.userData.partId = 'forearm';
          const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 18), makeMat('#38BDF8', 0.75, 0.25));
          wrist.position.y = 0.8;
          wrist.userData.partId = 'wrist';
          const gripperBase = new THREE.Group();
          gripperBase.position.y = 0.92;
          const jawL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.05), makeMat('#F59E0B', 0.7, 0.28));
          jawL.position.set(-0.06, 0.08, 0);
          const jawR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.05), makeMat('#F59E0B', 0.7, 0.28));
          jawR.position.set(0.06, 0.08, 0);
          gripperBase.add(jawL, jawR);
          gripperBase.traverse((o) => (o.userData.partId = 'gripper'));
          robotJ3.add(forearm, wrist, gripperBase);
          robotJ2.add(robotJ3);
          partNodes.set('forearm', { group: forearm, basePos: forearm.position.clone(), explodeVec: new THREE.Vector3(0, 0.25, 0.25) });
          partNodes.set('wrist', { group: wrist, basePos: wrist.position.clone(), explodeVec: new THREE.Vector3(0, 0.35, 0.35) });
          partNodes.set('gripper', { group: gripperBase, basePos: gripperBase.position.clone(), explodeVec: new THREE.Vector3(0, 0.5, 0.4) });
        } else {
          // Drone swarm + AWR2944 FOV
          const buildDrone = (color: string, x: number, y: number, z: number, pid: string) => {
            const g = new THREE.Group();
            g.position.set(x, y, z);
            const hub = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.24), makeMat(color, 0.65, 0.3));
            g.add(hub);
            for (const [rx, rz] of [[-0.26, -0.22], [0.26, -0.22], [-0.26, 0.22], [0.26, 0.22]]) {
              const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), makeMat('#94A3B8', 0.8, 0.3));
              arm.rotation.z = Math.PI / 2;
              arm.rotation.y = Math.atan2(rz, rx);
              arm.position.set(rx * 0.5, 0, rz * 0.5);
              const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.015, 18), makeMat('#3BE8FF', 0.3, 0.4));
              rotor.position.set(rx, 0.05, rz);
              g.add(arm, rotor);
            }
            g.traverse((o) => (o.userData.partId = pid));
            return g;
          };

          const leader = buildDrone('#C6A46B', 0, 1.1, 0, 'leader');
          rootGroup.add(leader);
          partNodes.set('leader', { group: leader, basePos: leader.position.clone(), explodeVec: new THREE.Vector3(0, 0.45, 0) });

          const wingmen = new THREE.Group();
          wingmen.add(buildDrone('#8BA8C8', -1.05, 0.82, -0.65, 'wingmen'), buildDrone('#8BA8C8', 1.05, 0.82, -0.65, 'wingmen'));
          rootGroup.add(wingmen);
          partNodes.set('wingmen', { group: wingmen, basePos: wingmen.position.clone(), explodeVec: new THREE.Vector3(0, -0.25, -0.45) });

          const radarGroup = new THREE.Group();
          const coneMat = new THREE.MeshBasicMaterial({
            color: '#3BE8FF',
            transparent: true,
            opacity: 0.14,
            wireframe: true,
          });
          const fov = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 24, 1, true), coneMat);
          fov.rotation.x = Math.PI / 2;
          fov.position.set(0, 1.05, 0.9);
          radarGroup.add(fov);
          radarGroup.traverse((o) => (o.userData.partId = 'radar_fov'));
          rootGroup.add(radarGroup);
          partNodes.set('radar_fov', { group: radarGroup, basePos: radarGroup.position.clone(), explodeVec: new THREE.Vector3(0, 0, 0.55) });
        }

        // Raycaster selection for parts
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const handleClick = (ev: MouseEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(rootGroup.children, true);
          const hitPart = hits.find((h) => h.object.userData?.partId)?.object.userData.partId;
          if (hitPart && mounted) setSelectedPartId(String(hitPart));
        };
        renderer.domElement.addEventListener('click', handleClick);

        const resizeObs = new ResizeObserver(() => {
          if (!mount || !mounted) return;
          const w = Math.max(280, mount.clientWidth);
          const h = Math.max(240, mount.clientHeight);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        });
        resizeObs.observe(mount);

        if (mounted) setWebglStatus('ready');

        let raf = 0;
        let lastTs = performance.now();
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          if (document.hidden) return;
          const dt = Math.min(0.05, (now - lastTs) / 1000);
          lastTs = now;

          const c = controlsRef.current;
          orbit.autoRotate = c.autoRotate;
          orbit.autoRotateSpeed = 1.1;
          orbit.update();

          // Lighting presets
          if (c.lighting === 'blueprint') {
            scene.background = new THREE.Color('#071426');
            keyLight.intensity = 1.2;
            rimLight.intensity = 2.0;
          } else if (c.lighting === 'contrast') {
            scene.background = new THREE.Color('#030407');
            keyLight.intensity = 2.7;
            rimLight.intensity = 2.2;
          } else {
            scene.background = new THREE.Color('#06080E');
            keyLight.intensity = 2.2;
            rimLight.intensity = 1.4;
          }

          for (const mat of managedMaterials) {
            mat.wireframe = c.wireframe || c.lighting === 'blueprint';
          }

          for (const [pid, node] of partNodes.entries()) {
            node.group.visible = !c.hiddenParts[pid];
            node.group.position.copy(node.basePos).addScaledVector(node.explodeVec, c.exploded);
          }

          if (rotorSpinner && c.autoRotate) {
            rotorSpinner.rotation.z -= dt * 1.9;
          }
          if (robotJ1 && robotJ2 && robotJ3) {
            robotJ1.rotation.y = (c.jointJ1Deg * Math.PI) / 180;
            robotJ2.rotation.z = (c.jointJ2Deg * Math.PI) / 180;
            robotJ3.rotation.z = (c.jointJ3Deg * Math.PI) / 180;
          }

          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);

        cleanup = () => {
          cancelAnimationFrame(raf);
          resizeObs.disconnect();
          renderer.domElement.removeEventListener('click', handleClick);
          orbit.dispose();
          envTex.dispose();
          pmrem.dispose();
          pbrMaps.dispose();
          disposeObjectTree(THREE, scene);
          renderer.dispose();
        };
      } catch {
        if (mounted) setWebglStatus('fallback');
      }
    })();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [preset, uploadedBlobUrl, compact]);

  const handleUploadCad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['glb', 'gltf', 'stl', 'obj'].includes(ext)) {
      setLoadError('Unsupported mesh format. Upload .glb, .gltf, .stl, or .obj.');
      return;
    }
    setLoadError(null);
    setCustomFileName(file.name);
    const url = URL.createObjectURL(file);
    setUploadedBlobUrl((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url, ext };
    });
  };

  const selectedSpec = spec.parts.find((p) => p.id === selectedPartId);

  return (
    <div
      className={`rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] overflow-hidden shadow-xs ${
        fullscreen ? 'fixed inset-4 z-50 flex flex-col bg-[#06080E] text-slate-100 border-white/20 p-4' : ''
      }`}
      data-testid={`cad-viewer-${preset}`}
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--hub-line)] bg-[var(--hub-bg)]/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[var(--hub-accent)] shrink-0" />
            <h3 className="text-sm font-bold font-heading text-[var(--hub-ink)] truncate">
              {title || spec.title}
            </h3>
          </div>
          <p className="text-[11px] text-[var(--hub-muted)] truncate mt-0.5">
            {customFileName ? `Inspecting local file: ${customFileName}` : spec.sourceLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.stl,.obj"
            onChange={handleUploadCad}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            Load .GLB / .STL / .OBJ
          </button>
          <button
            type="button"
            onClick={() => setWireframe((w) => !w)}
            aria-pressed={wireframe}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              wireframe
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] border-[var(--hub-accent)]'
                : 'border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Wireframe
          </button>
          <button
            type="button"
            onClick={() => setLighting((l) => (l === 'studio' ? 'blueprint' : l === 'blueprint' ? 'contrast' : 'studio'))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer capitalize"
            title="Cycle 3D lighting preset"
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            {lighting}
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            aria-pressed={autoRotate}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              autoRotate
                ? 'bg-[var(--hub-accent)]/15 border-[var(--hub-accent)] text-[var(--hub-accent)]'
                : 'border-[var(--hub-line)] text-[var(--hub-muted)]'
            }`}
          >
            {autoRotate ? 'Motion On' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={() => resetCamRef.current()}
            className="p-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
            aria-label="Reset 3D camera"
            title="Reset camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void exportStlRef.current?.()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            title="Export visible 3D assembly to binary STL"
          >
            <Download className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            .STL
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="p-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
            aria-label={fullscreen ? 'Exit fullscreen 3D viewer' : 'Fullscreen 3D viewer'}
          >
            {fullscreen ? <Shrink className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="px-4 py-2 text-xs bg-red-500/10 border-b border-red-500/30 text-red-400">
          {loadError}
        </div>
      )}

      {/* Main 3D Viewport + Side Inspector */}
      <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-3'} flex-1`}>
        <div className={`${compact ? '' : 'lg:col-span-2'} relative bg-[#06080E]`}>
          <div
            ref={mountRef}
            className={`w-full ${fullscreen ? 'h-[62vh]' : compact ? 'h-[260px]' : 'h-[360px]'} touch-none`}
          />
          {webglStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 bg-[#06080E]/80">
              Initializing interactive Three.js CAD stage...
            </div>
          )}
          {webglStatus === 'fallback' && (
            <div className="p-6 text-xs text-slate-300 space-y-2">
              <p className="font-bold text-[#C6A46B]">2D Engineering Component View (WebGL disabled)</p>
              <p className="text-slate-400">
                Browse sub-assemblies on the right panel or upload `.glb`/`.stl`/`.obj` assets when WebGL hardware acceleration is enabled.
              </p>
            </div>
          )}
          {customFileName && (
            <button
              type="button"
              onClick={() => {
                setCustomFileName(null);
                setUploadedBlobUrl((prev) => {
                  if (prev?.url) URL.revokeObjectURL(prev.url);
                  return null;
                });
              }}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 border border-white/20 text-[11px] text-slate-200 hover:border-[#C6A46B] cursor-pointer"
            >
              <Minimize2 className="w-3 h-3" />
              Return to Reference Assembly
            </button>
          )}
        </div>

        {/* Sub-assembly Inspector + Explode / Joint Controls */}
        <div className="p-4 border-t lg:border-t-0 lg:border-l border-[var(--hub-line)] space-y-4 bg-[var(--hub-bg)]/30">
          {!customFileName && (
            <>
              <label className="block space-y-1 text-xs">
                <span className="font-semibold text-[var(--hub-ink)] flex justify-between">
                  <span>Exploded Assembly</span>
                  <span className="font-mono text-[var(--hub-muted)]">{Math.round(exploded * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={exploded}
                  onChange={(e) => setExploded(Number(e.target.value))}
                  className="w-full accent-[var(--hub-accent)]"
                />
              </label>

              {preset === 'piper-arm' && (
                <div className="space-y-2 p-2.5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[11px]">
                  <span className="font-bold text-[var(--hub-ink)] block">PiPER Reference Joint Preview</span>
                  <label className="flex items-center justify-between gap-2">
                    <span>J1 Yaw ({jointJ1Deg}°)</span>
                    <input type="range" min={-150} max={150} value={jointJ1Deg} onChange={(e) => setJointJ1Deg(Number(e.target.value))} className="w-28 accent-[var(--hub-accent)]" />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span>J2 Shoulder ({jointJ2Deg}°)</span>
                    <input type="range" min={-90} max={90} value={jointJ2Deg} onChange={(e) => setJointJ2Deg(Number(e.target.value))} className="w-28 accent-[var(--hub-accent)]" />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span>J3 Elbow ({jointJ3Deg}°)</span>
                    <input type="range" min={-110} max={110} value={jointJ3Deg} onChange={(e) => setJointJ3Deg(Number(e.target.value))} className="w-28 accent-[var(--hub-accent)]" />
                  </label>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--hub-muted)] block">
                  Sub-Assemblies & Visibility
                </span>
                {spec.parts.map((part) => {
                  const isHidden = Boolean(hiddenParts[part.id]);
                  const isSelected = selectedPartId === part.id;
                  return (
                    <div
                      key={part.id}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        isSelected
                          ? 'bg-[var(--hub-accent)]/12 border-[var(--hub-accent)] text-[var(--hub-ink)]'
                          : 'bg-[var(--hub-surface)] border-[var(--hub-line)] text-[var(--hub-muted)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPartId(part.id)}
                        className="flex-1 text-left font-medium truncate cursor-pointer text-[var(--hub-ink)]"
                      >
                        {part.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => setHiddenParts((prev) => ({ ...prev, [part.id]: !prev[part.id] }))}
                        aria-label={`${isHidden ? 'Show' : 'Hide'} ${part.label}`}
                        className="p-1 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                      >
                        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {selectedSpec && (
                <div className="p-3 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs space-y-1">
                  <div className="font-bold text-[var(--hub-ink)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                    <span>{selectedSpec.label}</span>
                  </div>
                  <p className="text-[var(--hub-muted)]">{selectedSpec.role}</p>
                  <p className="font-mono text-[11px] text-[var(--hub-ink)] opacity-85">{selectedSpec.materialNote}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
