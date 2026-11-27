/**
 * Custom portable GLSL ES 1.00 shaders for YASHWANTH — THE DIGITAL UNIVERSE.
 * Designed for warm charcoal studio elegance, interactive cursor lighting,
 * subtle holographic monitor bezels, and wind-energy airflow streamlines.
 */

export const STUDIO_FLOOR_VERTEX_SHADER = /* glsl */ `
  varying vec2 vWorldXZ;
  varying float vDist;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    vDist = length(worldPos.xz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const STUDIO_FLOOR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCursorWorld;
  uniform vec3 uAccentGold;
  uniform vec3 uAccentSteel;
  uniform vec3 uFloorBase;

  varying vec2 vWorldXZ;
  varying float vDist;

  void main() {
    vec2 cell = abs(fract(vWorldXZ * 0.5 - 0.5) - 0.5) / max(fwidth(vWorldXZ * 0.5), vec2(0.001));
    float gridLine = 1.0 - min(min(cell.x, cell.y), 1.0);

    vec2 fineCell = abs(fract(vWorldXZ * 2.0 - 0.5) - 0.5) / max(fwidth(vWorldXZ * 2.0), vec2(0.001));
    float fineGrid = 1.0 - min(min(fineCell.x, fineCell.y), 1.0);

    float ring = smoothstep(0.06, 0.0, abs(fract(vDist * 0.25 - uTime * 0.03) - 0.5));
    float distFade = exp(-vDist * 0.14);

    float cursorDist = length(vWorldXZ - uCursorWorld.xz);
    float cursorGlow = exp(-cursorDist * cursorDist * 0.55);

    vec3 col = uFloorBase;
    col += uAccentSteel * fineGrid * 0.045 * distFade;
    col += uAccentGold * gridLine * 0.14 * distFade;
    col += uAccentGold * ring * 0.11 * distFade;
    col += mix(uAccentGold, uAccentSteel, 0.35) * cursorGlow * 0.28;

    float alpha = clamp((0.78 - vDist * 0.05) + cursorGlow * 0.2, 0.0, 0.96);
    gl_FragColor = vec4(col, alpha);
  }
`;

export const STUDIO_HOLO_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const STUDIO_HOLO_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uHovered;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
    float scan = 0.86 + 0.14 * sin(vUv.y * 52.0 - uTime * 2.6);
    float intensity = mix(0.28, 0.72, uHovered) * fresnel + 0.08 * uHovered;
    gl_FragColor = vec4(uColor * scan * (0.65 + intensity), clamp(intensity + 0.06, 0.04, 0.78));
  }
`;

export const AIRFLOW_STREAM_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.y += sin(uv.x * 12.0 - uTime * 2.8) * 0.035;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const AIRFLOW_STREAM_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;

  varying vec2 vUv;

  void main() {
    float wave = smoothstep(0.35, 0.95, sin(vUv.x * 18.0 - uTime * 4.5));
    float edge = sin(vUv.x * 3.14159);
    gl_FragColor = vec4(uColor * (0.6 + 0.8 * wave), wave * edge * 0.55);
  }
`;
