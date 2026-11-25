/**
 * Custom GLSL shaders for the Jarvis HUD 3D core and volumetric hex radar floor.
 * Written in portable GLSL ES 1.00 compatible with Three.js ShaderMaterial on WebGL1/WebGL2.
 */

export const JARVIS_CORE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPulseRate;
  uniform float uDispAmp;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  varying float vNoise;

  float gyroidNoise(vec3 p) {
    return dot(sin(p), cos(p.yzx));
  }

  float fbm(vec3 p) {
    float n = 0.0;
    n += 0.55 * gyroidNoise(p);
    n += 0.30 * gyroidNoise(p * 2.07 + vec3(1.7, -2.3, 0.9));
    n += 0.15 * gyroidNoise(p * 4.19 + vec3(-1.1, 3.1, 2.4));
    return n;
  }

  void main() {
    float phase = uTime * (0.8 + uPulseRate * 1.1);
    vec3 samplePos = position * 2.6 + vec3(phase * 0.42, -phase * 0.31, phase * 0.27);
    float n = fbm(samplePos);

    float breathe = 0.72 + 0.28 * sin(uTime * (1.2 + uPulseRate * 2.4));
    vec3 displaced = position + normal * (n * uDispAmp * breathe);

    vLocalPos = displaced;
    vNoise = n;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);

    gl_Position = projectionMatrix * mvPos;
  }
`;

export const JARVIS_CORE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPulseRate;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform float uEnergy;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  varying float vNoise;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    float ndotv = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, 2.25);

    // Subtle holographic latitude scanlines drifting up the icosphere
    float scan = 0.88 + 0.12 * sin(vLocalPos.y * 26.0 - uTime * (1.8 + uPulseRate * 2.5));
    float ridge = smoothstep(-0.35, 0.85, vNoise);

    vec3 deepCore = mix(uSecondaryColor * 0.55, uPrimaryColor * 0.9, ridge * 0.65);
    vec3 plasma = mix(deepCore, uPrimaryColor * 1.45, fresnel);

    float pulse = 0.88 + 0.18 * sin(uTime * (1.5 + uPulseRate * 3.0));
    vec3 rimHighlight = (uPrimaryColor + vec3(0.4, 0.45, 0.5)) * pow(fresnel, 3.2) * uEnergy;

    vec3 finalColor = (plasma * scan * (0.85 + 0.45 * uEnergy) + rimHighlight) * pulse;
    gl_FragColor = vec4(finalColor, 0.96);
  }
`;

export const HEX_FLOOR_VERTEX_SHADER = /* glsl */ `
  varying vec2 vWorldXZ;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const HEX_FLOOR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uGridColor;
  uniform vec3 uAccentColor;

  varying vec2 vWorldXZ;

  float hexDist(vec2 p) {
    p = abs(p);
    float c = dot(p, normalize(vec2(1.0, 1.7320508)));
    return max(c, p.x);
  }

  float hexEdge(vec2 uv) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float d = 0.5 - hexDist(gv);
    return 1.0 - smoothstep(0.0, 0.035, abs(d));
  }

  void main() {
    float dist = length(vWorldXZ);
    float radialFade = 1.0 - smoothstep(4.5, 20.0, dist);
    if (radialFade <= 0.001) discard;

    float hex = hexEdge(vWorldXZ * 0.62);

    // Polar rings subtly echoing the orbital radius
    float ring1 = 1.0 - smoothstep(0.0, 0.055, abs(dist - 5.6));
    float ring2 = 1.0 - smoothstep(0.0, 0.04, abs(dist - 9.2));

    // Outward sonar sweep wave
    float sweepPos = mod(uTime * 2.2, 20.0);
    float sweep = (1.0 - smoothstep(0.0, 1.4, abs(dist - sweepPos))) * 0.25;

    float pattern = hex * 0.22 + (ring1 + ring2 * 0.6) * 0.34 + sweep * (hex * 0.8 + 0.15);
    vec3 col = mix(uGridColor, uAccentColor, sweep * 1.4);
    float alpha = clamp(pattern * radialFade * 0.55, 0.0, 0.45);

    gl_FragColor = vec4(col, alpha);
  }
`;
