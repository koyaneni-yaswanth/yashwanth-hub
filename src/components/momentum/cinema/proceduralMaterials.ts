/**
 * Procedural PBR micro-detail textures (brushed metal & faceted crystal grain).
 * Zero external asset fetches; lightweight 128x128 DataTextures with explicit disposal.
 */
import type * as THREE_NS from 'three';

export interface ProceduralDetailMaps {
  metalRoughness: THREE_NS.DataTexture;
  metalBump: THREE_NS.DataTexture;
  crystalRoughness: THREE_NS.DataTexture;
  crystalBump: THREE_NS.DataTexture;
  dispose: () => void;
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function buildGrayDataTexture(
  THREE: typeof import('three'),
  size: number,
  repeat: number,
  sampler: (x: number, y: number) => number,
): THREE_NS.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(255, Math.round(sampler(x, y) * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralDetailMaps(THREE: typeof import('three')): ProceduralDetailMaps {
  const size = 128;

  // Fine brushed grain along U with subtle hairline variation for titanium/brass rings.
  const metalRoughness = buildGrayDataTexture(THREE, size, 3, (x, y) => {
    const streak = hash2d(Math.floor(x / 6), y);
    const fine = hash2d(x, y);
    return 0.72 + streak * 0.18 + (fine - 0.5) * 0.08;
  });

  const metalBump = buildGrayDataTexture(THREE, size, 3, (x, y) => {
    const band = Math.sin((y / size) * Math.PI * 32) * 0.12;
    const streak = (hash2d(Math.floor(x / 8), y) - 0.5) * 0.35;
    return 0.5 + band + streak;
  });

  // Subtle crystalline speckle for faceted glass/gem nodes.
  const crystalRoughness = buildGrayDataTexture(THREE, size, 2, (x, y) => {
    const cell = hash2d(Math.floor(x / 4), Math.floor(y / 4));
    const micro = hash2d(x, y);
    return 0.78 + cell * 0.14 + (micro - 0.5) * 0.06;
  });

  const crystalBump = buildGrayDataTexture(THREE, size, 2, (x, y) => {
    const cell = hash2d(Math.floor(x / 4), Math.floor(y / 4));
    return 0.42 + cell * 0.25;
  });

  return {
    metalRoughness,
    metalBump,
    crystalRoughness,
    crystalBump,
    dispose: () => {
      metalRoughness.dispose();
      metalBump.dispose();
      crystalRoughness.dispose();
      crystalBump.dispose();
    },
  };
}
