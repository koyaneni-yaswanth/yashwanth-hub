import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const {
  UNIVERSE_STATIONS,
  UNIVERSE_EIGHT_ENVIRONMENTS,
  EXPERIMENT_APPS,
  CAD_ASSEMBLY_PRESETS,
  STUDIO_LIGHTING_MOODS,
  GUIDED_TOUR_ORDER,
  FLAGSHIP_PORTFOLIO_SHOWCASES,
  JARVIS_STUDIO_STARTERS,
  YASHWANTH_IDENTITY_PROFILE,
  stationById,
  toFlagshipProjectRecord,
} = await import('../src/lib/universeConfig.ts');
const { readTabFromLocation, buildTabUrl, documentTitleFor, TAB_TITLES } = await import('../src/lib/navigation.ts');
const { HUB_DESTINATIONS, destinationForTab } = await import('../src/lib/hubArchitecture.ts');
const { StudioAudioEngine } = await import('../src/lib/studioAudio.ts');

test('Digital Universe defines 8 environments, 11 spatial hotspots, CAD presets & transparent disclaimers', () => {
  assert.equal(UNIVERSE_EIGHT_ENVIRONMENTS.length, 8);
  assert.ok(UNIVERSE_STATIONS.length >= 10);
  assert.equal(stationById('overview').id, 'overview');
  assert.equal(stationById('whiteboard').shortLabel, 'WHITEBOARD');
  assert.equal(stationById('cube').shortLabel, 'RUBIK CUBE');
  assert.equal(stationById('experiment').shortLabel, 'EXPERIMENTS');
  assert.equal(stationById('robotics').linkedTab, 'robotics-lab');
  assert.equal(stationById('energy').linkedTab, 'startup-command');
  assert.ok(STUDIO_LIGHTING_MOODS.cinema && STUDIO_LIGHTING_MOODS.workshop && STUDIO_LIGHTING_MOODS.lab);
  assert.ok(GUIDED_TOUR_ORDER.length >= 8 && GUIDED_TOUR_ORDER.includes('energy'));
  assert.ok(FLAGSHIP_PORTFOLIO_SHOWCASES.length >= 4);
  assert.ok(JARVIS_STUDIO_STARTERS.length >= 4);
  const sampleProj = toFlagshipProjectRecord(
    FLAGSHIP_PORTFOLIO_SHOWCASES[0],
    'id_1',
    '2026-11-28',
    '2026-11-28T00:00:00Z',
    () => 'm_1'
  );
  assert.equal(sampleProj.area, 'PAWAN SHAKTI');
  assert.equal(sampleProj.milestones.length, 1);

  assert.equal(EXPERIMENT_APPS.length, 3);
  for (const app of EXPERIMENT_APPS) {
    assert.ok(app.disclaimer.length > 10, `Simulation ${app.id} must carry an honest non-experimental disclaimer`);
  }

  assert.ok(CAD_ASSEMBLY_PRESETS['pawan-turbine'].parts.length >= 4);
  assert.ok(CAD_ASSEMBLY_PRESETS['piper-arm'].parts.length >= 4);
  assert.ok(CAD_ASSEMBLY_PRESETS['drone-swarm'].parts.length >= 3);
  assert.ok(YASHWANTH_IDENTITY_PROFILE.coreFocus.some((l) => l.includes('PAWAN SHAKTI')));
});

test('Navigation & 6-Destination Architecture cleanly map /universe without breaking existing routes', () => {
  assert.equal(TAB_TITLES.universe, '3D Universe');
  assert.equal(readTabFromLocation('/universe', ''), 'universe');
  assert.equal(readTabFromLocation('/', '?tab=universe'), 'universe');
  assert.equal(buildTabUrl('universe', '/'), '/universe');
  assert.equal(buildTabUrl('tasks', '/universe'), '/?tab=tasks');
  assert.ok(documentTitleFor('universe').includes('3D Engineering Universe'));

  assert.equal(HUB_DESTINATIONS.length, 6);
  const dest = destinationForTab('universe');
  assert.equal(dest.id, 'home');
});

test('StudioAudioEngine defaults muted, never touches microphone, and disposes cleanly', () => {
  const audio = new StudioAudioEngine();
  assert.equal(audio.isEnabled(), false);
  audio.setVolume(0.4);
  assert.equal(audio.getVolume(), 0.4);
  audio.playTone(440, 0.05); // no-op when muted or SSR
  audio.dispose();
  assert.equal(audio.isEnabled(), false);

  const audioSrc = read('src/lib/studioAudio.ts');
  assert.ok(!/getUserMedia/i.test(audioSrc), 'StudioAudioEngine must never request microphone permission');
});

test('GLSL Shaders, Physical Monitors, Whiteboard, Experiment Station & Reusable CAD Viewer exist cleanly', () => {
  const shaderSrc = read('src/components/universe/universeShaders.ts');
  assert.ok(shaderSrc.includes('STUDIO_FLOOR_FRAGMENT_SHADER'));
  assert.ok(shaderSrc.includes('STUDIO_HOLO_FRAGMENT_SHADER'));
  assert.ok(shaderSrc.includes('AIRFLOW_STREAM_FRAGMENT_SHADER'));
  assert.ok(shaderSrc.includes('uCursorWorld'));

  const sceneSrc = read('src/components/universe/UniverseStudioScene.tsx');
  assert.ok(sceneSrc.includes('monitorTexUpdaters'));
  assert.ok(sceneSrc.includes('OrbitControls'));
  assert.ok(sceneSrc.includes('LightingDirector'));
  assert.ok(sceneSrc.includes('PostFX'));
  assert.ok(sceneSrc.includes('ExtrudeGeometry'));
  assert.ok(sceneSrc.includes('LatheGeometry'));
  assert.ok(sceneSrc.includes('SCENE_PIN_ANCHORS'));
  assert.ok(sceneSrc.includes('solveQueue'));
  assert.ok(sceneSrc.includes('cubePivot'));
  assert.ok(sceneSrc.includes('cycWall'));
  assert.ok(sceneSrc.includes('beaconGroup'));
  assert.ok(sceneSrc.includes('onPointerUp'));
  assert.ok(sceneSrc.includes('renderer.dispose()'));

  const wbSrc = read('src/components/universe/StudioWhiteboardPanel.tsx');
  for (const c of ['#14171C', '#DC2626', '#059669', '#2563EB']) {
    assert.ok(wbSrc.includes(c), `Whiteboard missing color ${c}`);
  }
  assert.ok(wbSrc.includes('Eraser'));
  assert.ok(wbSrc.includes('Undo'));
  assert.ok(wbSrc.includes('Redo'));
  assert.ok(wbSrc.includes('applyStencil'));
  assert.ok(wbSrc.includes('Explain with JARVIS'));

  const viewerSrc = read('src/components/three/EngineeringModelViewer.tsx');
  assert.ok(viewerSrc.includes('GLTFLoader.js'));
  assert.ok(viewerSrc.includes('STLLoader.js'));
  assert.ok(viewerSrc.includes('OBJLoader.js'));
  assert.ok(viewerSrc.includes('STLExporter.js'));
  assert.ok(viewerSrc.includes('Exploded Assembly'));
  assert.ok(viewerSrc.includes('Wireframe'));
  assert.ok(viewerSrc.includes('renderer.dispose()'));

  const overlaySrc = read('src/components/universe/StudioMonitorOverlay.tsx');
  assert.ok(overlaySrc.includes('Auto-Solve'));
  assert.ok(overlaySrc.includes('EngineeringModelViewer'));
  assert.ok(overlaySrc.includes('Copy Bio'));

  const jccSrc = read('src/components/jarvis/JarvisCommandCenter.tsx');
  assert.ok(jccSrc.includes("onNavigate('universe')"));

  const universePageSrc = read('src/pages/UniversePage.tsx');
  assert.ok(!universePageSrc.includes('not optimized for mobile'), 'Never lock mobile users out');
  assert.ok(universePageSrc.includes('2D Accessible Studio'));

  const roboticsSrc = read('src/pages/RoboticsLabPage.tsx');
  const startupSrc = read('src/pages/StartupCommandPage.tsx');
  const learningSrc = read('src/pages/LearningCareerPage.tsx');
  const projectsSrc = read('src/pages/ProjectsPage.tsx');
  const headerSrc = read('src/components/layout/Header.tsx');
  const cmdSrc = read('src/components/common/CommandPalette.tsx');
  assert.ok(roboticsSrc.includes('<EngineeringModelViewer'));
  assert.ok(startupSrc.includes('<EngineeringModelViewer preset="pawan-turbine"'));
  assert.ok(learningSrc.includes('Opportunities & Grants') && learningSrc.includes('TaskService.create'));
  assert.ok(projectsSrc.includes('projects-flagship-banner') && projectsSrc.includes('toFlagshipProjectRecord'));
  assert.ok(headerSrc.includes('header-mobile-3d-btn'));
  assert.ok(cmdSrc.includes('openUniverseStation') && cmdSrc.includes("tab: 'universe'"));
});
