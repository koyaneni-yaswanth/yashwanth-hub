import type { NavigationTab, Project } from '../types';

export type UniverseStationId =
  | 'overview'
  | 'about'
  | 'projects'
  | 'robotics'
  | 'energy'
  | 'jarvis'
  | 'research'
  | 'whiteboard'
  | 'experiment'
  | 'cube'
  | 'workspace';

export interface UniverseStationMeta {
  id: UniverseStationId;
  code: string;
  label: string;
  shortLabel: string;
  kind: 'overview' | 'monitor' | 'station' | 'prop';
  description: string;
  cameraPos: readonly [number, number, number];
  lookAt: readonly [number, number, number];
  accentHex: string;
  linkedTab?: NavigationTab;
}

/**
 * Interactive spatial stations inside YASHWANTH — THE DIGITAL UNIVERSE.
 * Camera coordinates smoothly frame each physical desk station or prop in WebGL,
 * while remaining 100% reachable via top banner, keyboard shortcuts, and mobile 2D mode.
 */
export const UNIVERSE_STATIONS: UniverseStationMeta[] = [
  {
    id: 'overview',
    code: '00',
    label: 'The Universe · Studio Overview',
    shortLabel: 'UNIVERSE',
    kind: 'overview',
    description: 'Central interactive engineering studio, monitors, robotics bench, turbine station, whiteboard, experiment deck & JARVIS core.',
    cameraPos: [0.18, 3.16, 8.35],
    lookAt: [0, 1.48, -0.45],
    accentHex: '#C6A46B',
  },
  {
    id: 'about',
    code: '01',
    label: 'Monitor 01 · About Yashwanth',
    shortLabel: 'ABOUT ME',
    kind: 'monitor',
    description: 'Engineering identity, VNIT Nagpur mechanical background, PAWAN SHAKTI founder profile, and core technical stack.',
    cameraPos: [-1.45, 2.02, -0.05],
    lookAt: [-1.55, 1.85, -1.85],
    accentHex: '#C6A46B',
  },
  {
    id: 'projects',
    code: '02',
    label: 'Monitor 02 · Projects & Archive',
    shortLabel: 'PROJECTS',
    kind: 'monitor',
    description: 'Live Dexie portfolio of PAWAN SHAKTI wind energy, IvLabs robotics, AI agents, and research deliverables.',
    cameraPos: [0.0, 2.02, 0.0],
    lookAt: [0.0, 1.86, -1.92],
    accentHex: '#8BA8C8',
    linkedTab: 'projects',
  },
  {
    id: 'jarvis',
    code: '03',
    label: 'Monitor 03 · JARVIS Core & Multi-AI',
    shortLabel: 'JARVIS CORE',
    kind: 'monitor',
    description: 'Live conversational JARVIS companion, local runtime status, Gemini/GPT/Claude/Ollama gateway, and memory console.',
    cameraPos: [1.55, 2.02, -0.05],
    lookAt: [1.55, 1.85, -1.85],
    accentHex: '#3BE8FF',
    linkedTab: 'buddy',
  },
  {
    id: 'research',
    code: '04',
    label: 'Monitor 04 · System & Research Wall',
    shortLabel: 'SYSTEM / LABS',
    kind: 'monitor',
    description: 'Real-time AI provider diagnostics, local Python agent health, arXiv research feed, and DevOps deployment status.',
    cameraPos: [2.75, 2.02, 0.45],
    lookAt: [2.55, 1.82, -1.35],
    accentHex: '#A78BFA',
    linkedTab: 'system-health',
  },
  {
    id: 'robotics',
    code: '05',
    label: 'Robotics Workbench · PiPER & Swarm',
    shortLabel: 'ROBOTICS LAB',
    kind: 'station',
    description: '6-DOF AgileX PiPER robotic arm kinematics, ROS 2 Humble SocketCAN, 3-Drone PX4 swarm, and AWR2944 mmWave perception.',
    cameraPos: [-2.75, 2.25, 2.55],
    lookAt: [-2.85, 1.48, 0.35],
    accentHex: '#38BDF8',
    linkedTab: 'robotics-lab',
  },
  {
    id: 'energy',
    code: '06',
    label: 'Energy Lab · PAWAN SHAKTI',
    shortLabel: 'ENERGY LAB',
    kind: 'station',
    description: 'Archimedes helical compact wind turbine, planetary vs magnetic gearbox R&D, CAD inspector & TRL 4->5 test rig.',
    cameraPos: [3.45, 2.36, 2.82],
    lookAt: [3.65, 1.58, 0.68],
    accentHex: '#34D399',
    linkedTab: 'startup-command',
  },
  {
    id: 'whiteboard',
    code: '07',
    label: 'Engineering Whiteboard',
    shortLabel: 'WHITEBOARD',
    kind: 'station',
    description: 'Interactive drawing board with multi-color markers, eraser, undo/redo, PNG export, persistent save & live 3D board sync.',
    cameraPos: [-3.55, 2.25, 0.25],
    lookAt: [-4.65, 2.05, -0.55],
    accentHex: '#F59E0B',
  },
  {
    id: 'experiment',
    code: '08',
    label: 'Simulation & Experiment Console',
    shortLabel: 'EXPERIMENTS',
    kind: 'prop',
    description: 'Interactive physics & robotics simulations: Betz rotor tip-speed curve, 2-link arm inverse kinematics & FMCW wave synth.',
    cameraPos: [-1.55, 2.05, 3.15],
    lookAt: [-2.15, 1.52, 1.65],
    accentHex: '#EC4899',
  },
  {
    id: 'cube',
    code: '09',
    label: 'Calibration Rubik Cube',
    shortLabel: 'RUBIK CUBE',
    kind: 'prop',
    description: 'Interactive 3D rotation & layer-turn puzzle cube on the studio workbench — drag to inspect or rotate faces.',
    cameraPos: [0.35, 1.98, 2.65],
    lookAt: [0.15, 1.38, 1.15],
    accentHex: '#F97316',
  },
  {
    id: 'workspace',
    code: '10',
    label: 'Personal Workspace & Knowledge',
    shortLabel: 'WORKSPACE',
    kind: 'station',
    description: 'Live tasks, Daily Compass, Markdown Notes Vault, Calendar & Knowledge Graph — no separate dashboard clutter required.',
    cameraPos: [-0.25, 2.35, 5.25],
    lookAt: [0, 1.45, 0],
    accentHex: '#C6A46B',
    linkedTab: 'tasks',
  },
];

export const UNIVERSE_EIGHT_ENVIRONMENTS = [
  { id: 'overview', name: 'The Universe', role: 'Central Engineering Studio', stationId: 'overview' as UniverseStationId },
  { id: 'jarvis', name: 'JARVIS Core', role: 'Personal AI & Multi-Provider Gateway', stationId: 'jarvis' as UniverseStationId, tab: 'buddy' as NavigationTab },
  { id: 'robotics', name: 'Robotics Lab', role: 'PiPER 6-DOF · 3-Drone Swarm · mmWave', stationId: 'robotics' as UniverseStationId, tab: 'robotics-lab' as NavigationTab },
  { id: 'energy', name: 'Energy Lab', role: 'PAWAN SHAKTI · Helical Rotor & Gearbox', stationId: 'energy' as UniverseStationId, tab: 'startup-command' as NavigationTab },
  { id: 'research', name: 'Research Studio', role: 'arXiv Feed · OpenAlex · Literature', stationId: 'research' as UniverseStationId, tab: 'research-feed' as NavigationTab },
  { id: 'startup', name: 'Startup Command', role: 'TRL Progress · V3F · Patent Milestones', stationId: 'energy' as UniverseStationId, tab: 'startup-command' as NavigationTab },
  { id: 'developer', name: 'Developer Studio', role: 'GitHub · Vercel · System Health', stationId: 'research' as UniverseStationId, tab: 'system-health' as NavigationTab },
  { id: 'knowledge', name: 'Knowledge Archive', role: 'Notes · Knowledge Graph · Decisions', stationId: 'workspace' as UniverseStationId, tab: 'knowledge-memory' as NavigationTab },
] as const;

export const YASHWANTH_IDENTITY_PROFILE = {
  name: 'Yashwanth',
  title: 'Mechanical & Robotics Engineer · Founder, PAWAN SHAKTI · AI Systems Builder',
  education: 'VNIT Nagpur — Mechanical Engineering & Applied Autonomy',
  coreFocus: [
    'PAWAN SHAKTI Compact Helical Wind Turbine (Published Indian Patent · TRL 4 Bench Validation)',
    'Autonomous Robotics (AgileX PiPER 6-DOF Arm, ROS 2 Humble, 3-Drone PX4 Swarm, TI AWR2944 mmWave)',
    'Local-First Multi-AI Personal Operating System (JARVIS 5.0 · FastAPI Local Agent + Hybrid Cloud Vault)',
  ],
  stack: [
    'ROS 2 Humble',
    'Python / FastAPI',
    'CAD / SolidWorks',
    'Three.js / WebGL / GLSL',
    'TypeScript / React / Dexie',
    'Embedded C++ / ESP32 / CAN',
  ],
} as const;

export interface ExperimentAppMeta {
  id: 'tsr-envelope' | 'ik-2link' | 'fmcw-chirp';
  title: string;
  subtitle: string;
  disclaimer: string;
}

export const EXPERIMENT_APPS: ExperimentAppMeta[] = [
  {
    id: 'tsr-envelope',
    title: 'Wind Rotor Cp / TSR Curve Explorer',
    subtitle: 'Interactive aerodynamic tip-speed ratio sweep against Betz ceiling (0.593)',
    disclaimer: 'Calculated theoretical envelope for intuition — not wind-tunnel experimental test data.',
  },
  {
    id: 'ik-2link',
    title: 'Planar 2-DOF Inverse Kinematics Lab',
    subtitle: 'Click or drag target coordinates (x, y) to solve elbow-up / elbow-down joint angles',
    disclaimer: 'Deterministic geometric IK solver for robotics kinematics study.',
  },
  {
    id: 'fmcw-chirp',
    title: '77 GHz FMCW Radar Chirp Visualizer',
    subtitle: 'Sweep chirp slope & beat frequency to inspect simulated IF target spectrum',
    disclaimer: 'Simulated waveform synthesis — no hardware radar stream attached.',
  },
];

export type CadModelPresetId = 'pawan-turbine' | 'piper-arm' | 'drone-swarm';

export interface CadPartSpec {
  id: string;
  label: string;
  role: string;
  materialNote: string;
}

export interface CadAssemblyPreset {
  id: CadModelPresetId;
  title: string;
  subtitle: string;
  sourceLabel: string;
  parts: CadPartSpec[];
}

export const CAD_ASSEMBLY_PRESETS: Record<CadModelPresetId, CadAssemblyPreset> = {
  'pawan-turbine': {
    id: 'pawan-turbine',
    title: 'PAWAN SHAKTI — Helical Compact Turbine Assembly',
    subtitle: 'Archimedes-inspired progressive rotor + planetary/magnetic gearbox housing + axial stator',
    sourceLabel: 'Interactive Parametric Reference CAD (Upload your .glb/.gltf/.stl/.obj file below to inspect your exact CAD export)',
    parts: [
      { id: 'blades', label: 'Helical Rotor Blades (x3)', role: 'Low cut-in aerodynamic capture', materialNote: 'Composite / CFRP target shell' },
      { id: 'hub', label: 'Rotor Nosecone & Hub', role: 'Load transfer to main drive shaft', materialNote: '6061-T6 machined aluminum' },
      { id: 'gearbox', label: 'Planetary Gear Carrier', role: 'Torque-speed step-up stage', materialNote: '20MnCr5 / hardened ring' },
      { id: 'generator', label: 'Coreless Stator & PM Rotor', role: 'Zero-cogging electrical generation', materialNote: 'N52 NdFeB + copper windings' },
      { id: 'nacelle', label: 'Nacelle & Yaw Mast', role: 'Weatherproof chassis & tower mount', materialNote: 'Anodized structural frame' },
    ],
  },
  'piper-arm': {
    id: 'piper-arm',
    title: 'AgileX PiPER — 6-DOF Manipulator Kinematic Rig',
    subtitle: 'Interactive joint articulation & link envelope viewer (Base Yaw, Shoulder, Elbow, Wrist, Gripper)',
    sourceLabel: 'Reference Kinematic Geometry (Attach URDF-converted .glb/.stl/.obj for exact link meshes)',
    parts: [
      { id: 'base', label: 'Base Pedestal & J1 Yaw', role: 'SocketCAN 1 Mbps mount', materialNote: 'Die-cast aluminum flange' },
      { id: 'upper_arm', label: 'J2 Shoulder & Upper Link', role: 'Primary pitch actuator', materialNote: 'Carbon-reinforced housing' },
      { id: 'forearm', label: 'J3 Elbow & Forearm', role: 'Reach extension link', materialNote: 'Hollow drive conduit' },
      { id: 'wrist', label: 'J4–J6 Spherical Wrist', role: 'End-effector orientation', materialNote: 'Compact harmonic joints' },
      { id: 'gripper', label: 'Parallel Finger Gripper', role: 'Payload grasp actuation', materialNote: 'Dual-jaw servo assembly' },
    ],
  },
  'drone-swarm': {
    id: 'drone-swarm',
    title: '3-Drone Mesh Swarm + AWR2944 Radar Array',
    subtitle: 'Tri-UAV leader/follower formation & 77 GHz FMCW spatial FOV cone',
    sourceLabel: 'Conceptual Swarm Formation Reference (Upload custom airframe STL/GLB to inspect airframe geometry)',
    parts: [
      { id: 'leader', label: 'Leader UAV (Jetson + PX4)', role: 'Compute coordinator & SIYI link', materialNote: 'Carbon quad frame' },
      { id: 'wingmen', label: 'Follower UAVs (x2)', role: 'Relative mesh keeping', materialNote: 'Compact autonomous frames' },
      { id: 'radar_fov', label: 'AWR2944 77 GHz FOV Cone', role: 'All-weather mmWave point cloud', materialNote: 'AZ ±60° / EL ±20° envelope' },
    ],
  },
};

export type StudioLightingMood = 'cinema' | 'workshop' | 'lab';

export const STUDIO_LIGHTING_MOODS: Record<
  StudioLightingMood,
  {
    label: string;
    bgHex: string;
    fogHex: string;
    floorHex: string;
    keyHex: number;
    rimHex: number;
    keyIntensity: number;
    exposure: number;
    coveHex: string;
  }
> = {
  cinema: {
    label: 'Cinema',
    bgHex: '#0A0E16',
    fogHex: '#0C111B',
    floorHex: '#0B1018',
    keyHex: 0xffe4bd,
    rimHex: 0x8fb3e8,
    keyIntensity: 1.55,
    exposure: 1.0,
    coveHex: '#C6A46B',
  },
  workshop: {
    label: 'Workshop',
    bgHex: '#131924',
    fogHex: '#141B27',
    floorHex: '#141B27',
    keyHex: 0xf7f5ef,
    rimHex: 0xb7d1f2,
    keyIntensity: 2.05,
    exposure: 1.12,
    coveHex: '#E8D5B0',
  },
  lab: {
    label: 'Cyber Lab',
    bgHex: '#060B14',
    fogHex: '#08101C',
    floorHex: '#08101B',
    keyHex: 0xcbe8ff,
    rimHex: 0x3be8ff,
    keyIntensity: 1.48,
    exposure: 1.02,
    coveHex: '#3BE8FF',
  },
};

export const GUIDED_TOUR_ORDER: UniverseStationId[] = [
  'about',
  'projects',
  'jarvis',
  'research',
  'robotics',
  'energy',
  'whiteboard',
  'experiment',
  'cube',
];

export interface FlagshipProjectShowcase {
  id: string;
  title: string;
  domain: string;
  stage: string;
  accentHex: string;
  summary: string;
  stack: string[];
  stationId: UniverseStationId;
  tab: NavigationTab;
}

export const FLAGSHIP_PORTFOLIO_SHOWCASES: FlagshipProjectShowcase[] = [
  {
    id: 'pawan-shakti',
    title: 'PAWAN SHAKTI · Compact Helical Wind Turbine',
    domain: 'CleanTech & Turbomachinery',
    stage: 'Published Patent · TRL 4 Bench Rig',
    accentHex: '#34D399',
    summary:
      'Archimedes-progressive helical rotor paired with zero-cogging axial flux / gearbox transmission and STM32/ESP32 P-v telemetry logger for low cut-in urban wind harvesting.',
    stack: ['SolidWorks', 'BEM / CFD', 'ESP32 / Hall RPM', 'TRL 4->5 Rig'],
    stationId: 'energy',
    tab: 'startup-command',
  },
  {
    id: 'piper-robotics',
    title: 'AgileX PiPER 6-DOF Manipulator & ROS 2 Stack',
    domain: 'Robotics & Manipulation',
    stage: 'Bench Bring-Up · SocketCAN 1 Mbps',
    accentHex: '#38BDF8',
    summary:
      'Joint-space & MoveIt kinematic bring-up for the AgileX PiPER arm over USB-to-CAN (`can0`) with URDF workspace envelope checks and logged experiment traces.',
    stack: ['ROS 2 Humble', 'SocketCAN', 'MoveIt 2', 'Python / C++'],
    stationId: 'robotics',
    tab: 'robotics-lab',
  },
  {
    id: 'px4-mmwave-swarm',
    title: '3-Drone PX4 Autonomy Swarm + AWR2944 mmWave',
    domain: 'Aerial Autonomy & Radar Perception',
    stage: 'IvLabs Research · Simulation & HW Prep',
    accentHex: '#F59E0B',
    summary:
      'Multi-UAV relative mesh coordination under TI 77 GHz AWR2944 FMCW sparse radar point clouds and degraded-visibility navigation.',
    stack: ['PX4 / MAVROS', 'TI AWR2944 77 GHz', 'Jetson Orin', 'Point Cloud'],
    stationId: 'experiment',
    tab: 'robotics-lab',
  },
  {
    id: 'jarvis-os',
    title: 'JARVIS 5.0 · Hybrid Local-First AI OS',
    domain: 'AI Infrastructure & Spatial UI',
    stage: 'Production Live · Vercel + Local FastAPI',
    accentHex: '#3BE8FF',
    summary:
      'IndexedDB/Dexie workspace synced with encrypted cloud providers and a sandboxed local FastAPI + Ollama agent with Three.js spatial studio navigation.',
    stack: ['React 19', 'Three.js / GLSL', 'FastAPI / Ollama', 'Supabase RLS'],
    stationId: 'jarvis',
    tab: 'buddy',
  },
];

export const JARVIS_STUDIO_STARTERS: string[] = [
  'Brief me on PAWAN SHAKTI TRL 4->5 priorities and next test step.',
  'Summarize the AgileX PiPER 6-DOF SocketCAN & ROS 2 bring-up checklist.',
  'Review my current Tasks & Projects and pick the highest-leverage next action.',
  'Explain how local FastAPI + Ollama fallback routes cleanly vs cloud providers.',
];

export function toFlagshipProjectRecord(
  item: FlagshipProjectShowcase,
  id: string,
  todayISO: string,
  nowISO: string,
  makeId: () => string
): Project {
  return {
    id,
    title: item.title,
    description: item.summary,
    area: item.domain.includes('CleanTech') ? 'PAWAN SHAKTI' : 'Robotics & AI',
    status: 'active',
    priority: 'high',
    start_date: todayISO,
    target_date: todayISO,
    progress: 35,
    milestones: [{ id: makeId(), title: item.stage, done: false }],
    tags: [...item.stack],
    created_at: nowISO,
    updated_at: nowISO,
  };
}

export function stationById(id: UniverseStationId): UniverseStationMeta {
  return UNIVERSE_STATIONS.find((s) => s.id === id) || UNIVERSE_STATIONS[0];
}
