import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CINEMA,
  CINEMA_SPRING,
  criticallyDampedStep,
  sectionCameraTimeline,
  tierSettings,
} from '../src/components/momentum/cinema/cinemaConfig.ts';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('criticallyDampedStep settles quickly without overshoot and handles dt=0 and coarse dt safely', () => {
  assert.deepEqual(criticallyDampedStep(0.4, 0.2, 1, CINEMA_SPRING.stiffness, 0), [0.4, 0.2]);

  let value = 0;
  let velocity = 0;
  let maxSeen = 0;
  for (let i = 0; i < 90; i++) {
    [value, velocity] = criticallyDampedStep(value, velocity, 1, CINEMA_SPRING.stiffness, 1 / 60);
    if (value > maxSeen) maxSeen = value;
  }
  assert.ok(value > 0.99, `expected near-settled value after 1.5s, got ${value}`);
  assert.ok(maxSeen <= 1.0005, `critically damped spring must not overshoot 1, peaked at ${maxSeen}`);

  let coarseV = 0;
  let coarseVel = 0;
  for (let i = 0; i < 15; i++) {
    [coarseV, coarseVel] = criticallyDampedStep(coarseV, coarseVel, 1, CINEMA_SPRING.stiffness, 0.08);
  }
  assert.ok(Number.isFinite(coarseV) && coarseV > 0.95 && coarseV <= 1.001);
});

test('sectionCameraTimeline maps normalized scroll across hero, survey, detail, and cta stages', () => {
  const hero = sectionCameraTimeline(0.1);
  const survey = sectionCameraTimeline(0.4);
  const detail = sectionCameraTimeline(0.7);
  const cta = sectionCameraTimeline(0.95);

  assert.equal(hero.stage, 'hero');
  assert.equal(survey.stage, 'survey');
  assert.equal(detail.stage, 'detail');
  assert.equal(cta.stage, 'cta');

  assert.ok(hero.dolly > cta.dolly, 'timeline should gradually pull into detail / end hold');
  assert.ok(hero.lift < cta.lift, 'timeline elevation rises smoothly along page scroll');
  for (const s of [hero, survey, detail, cta]) {
    assert.ok(Number.isFinite(s.orbitYaw) && Math.abs(s.orbitYaw) <= 0.15);
  }
});

test('tierSettings exposes shadowQuality, renderScale, and restrained postFX across tiers', () => {
  const high = tierSettings('high');
  const med = tierSettings('medium');
  const low = tierSettings('low');

  assert.equal(high.shadowQuality, 'high');
  assert.equal(med.shadowQuality, 'medium');
  assert.equal(low.shadowQuality, 'off');

  assert.equal(high.renderScale, 1);
  assert.equal(med.renderScale, 0.9);
  assert.equal(low.renderScale, 0.8);

  assert.equal(high.chromaticAberration, true);
  assert.equal(med.chromaticAberration, false);
  assert.equal(low.chromaticAberration, false);

  assert.ok(CINEMA.post.bloom.strength <= 0.3, 'restrained filmic bloom');
  assert.ok(CINEMA.post.vignette <= 0.25, 'subtle corner vignette');
  assert.ok(CINEMA.post.chromaticAberration <= 0.002, 'tiny edge-only aberration');
});

test('cinema architecture enforces zero-alloc hot loops, edge-only aberration, shadows, and strict cleanup', () => {
  const lc = read('src/components/momentum/LifeConstellation.tsx');
  const js = read('src/components/jarvis/JarvisScene.tsx');
  const rig = read('src/components/momentum/cinema/CinematicCameraRig.ts');
  const light = read('src/components/momentum/cinema/LightingDirector.ts');
  const post = read('src/components/momentum/cinema/PostFX.ts');
  const mat = read('src/components/momentum/cinema/proceduralMaterials.ts');

  assert.doesNotMatch(lc, /tr\.positions\.set\(\s*\[/);
  assert.doesNotMatch(lc, /tr\.colors\.set\(\s*\[/);
  assert.match(lc, /createProceduralDetailMaps/);
  assert.match(lc, /detailMaps\.dispose\(\)/);

  assert.match(js, /createProceduralDetailMaps/);
  assert.match(js, /detailMaps\.dispose\(\)/);
  assert.match(js, /shadowQuality/);

  assert.match(post, /if \(uAberration > 0\.0 && v > 0\.0\)/);
  assert.match(post, /setRenderScale|renderScale/);

  assert.match(light, /PCFSoftShadowMap/);
  assert.match(light, /setShadowQuality/);
  assert.doesNotMatch(light, /AmbientLight/);
  assert.match(light, /keyLight\.shadow\.map\?\.dispose\(\)/);

  assert.match(rig, /scrollContainer\?\.removeEventListener\('scroll', this\.onScroll\)/);
  assert.match(mat, /metalRoughness/);
  assert.match(mat, /crystalBump/);
});
