import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CINEMA,
  easeInOutCubic,
  settleFactor,
  settleSeconds,
  scrollProgress,
  scrollCameraOffset,
  introDollyAt,
  breathAt,
  initialTier,
  lowerTier,
  tierSettings,
} from '../src/components/momentum/cinema/cinemaConfig.ts';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('easing: easeInOutCubic is smooth, clamped and symmetric', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(near(easeInOutCubic(0.5), 0.5));
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(2), 1);
  assert.ok(easeInOutCubic(0.1) < 0.1, 'starts slower than linear');
  assert.ok(near(easeInOutCubic(0.3) + easeInOutCubic(0.7), 1));
});

test('settling: frame-rate independent and UI transitions stay under ~1.2 s', () => {
  // Two 1/60 s steps equal one 1/30 s step.
  const a = 1 - (1 - settleFactor(3, 1 / 60)) ** 2;
  assert.ok(near(a, settleFactor(3, 1 / 30)));
  assert.equal(settleFactor(3, 0), 0);
  assert.ok(settleSeconds(CINEMA.camera.focusRate) <= 1.2, `focus settles in ${settleSeconds(CINEMA.camera.focusRate).toFixed(2)} s`);
  assert.ok(CINEMA.camera.introSeconds <= 2.5, 'opening reveal is short');
});

test('scroll: progress through the viewport and the camera timeline', () => {
  assert.equal(scrollProgress(800, 400, 800), 0, 'just entering at the bottom');
  assert.ok(near(scrollProgress(200, 400, 800), 0.5), 'centred');
  assert.equal(scrollProgress(-400, 400, 800), 1, 'just left at the top');
  assert.equal(scrollProgress(5000, 400, 800), 0, 'clamped');
  const mid = scrollCameraOffset(0.5);
  assert.ok(near(mid.dolly, 0) && near(mid.lift, 0), 'centred panel = authored home framing');
  const start = scrollCameraOffset(0);
  const end = scrollCameraOffset(1);
  assert.ok(start.dolly > 0 && start.lift < 0, 'entering: a little further and lower');
  assert.ok(end.dolly < 0 && end.lift > 0, 'leaving: a little closer and higher');
  assert.ok(Math.abs(start.dolly) <= 0.1 && Math.abs(end.lift) <= 2, 'movement stays subtle');
});

test('intro and idle motion: reveal ends at rest; breathing is small', () => {
  assert.ok(near(introDollyAt(0), CINEMA.camera.introDolly));
  assert.equal(introDollyAt(CINEMA.camera.introSeconds), 0);
  assert.equal(introDollyAt(99), 0);
  assert.ok(introDollyAt(0.5) > introDollyAt(1.5), 'monotonic glide in');
  for (let t = 0; t < 20; t += 0.7) {
    const b = breathAt(t);
    assert.ok(Math.abs(b.x) <= CINEMA.camera.breath + 1e-9 && Math.abs(b.y) <= CINEMA.camera.breath);
  }
});

test('quality tiers: device hints, step-down order, and what each tier enables', () => {
  assert.equal(initialTier({ width: 1440, cores: 12, memoryGb: 16 }), 'high');
  assert.equal(initialTier({ width: 390, cores: 8, memoryGb: 6 }), 'medium', 'phones start at medium');
  assert.equal(initialTier({ width: 1440, cores: 2 }), 'low');
  assert.equal(initialTier({ width: 1440, saveData: true }), 'low');
  assert.equal(initialTier({ width: 1440, reducedMotion: true, cores: 12 }), 'medium');
  assert.equal(lowerTier('high'), 'medium');
  assert.equal(lowerTier('low'), 'low');
  const hi = tierSettings('high');
  const lo = tierSettings('low');
  assert.ok(hi.pixelRatioCap <= 2, 'pixel ratio is capped at 2');
  assert.ok(hi.bloom && hi.grain && hi.glassTransmission);
  assert.ok(!lo.bloom && !lo.grain && !lo.glassTransmission && lo.dust === 0 && lo.pixelRatioCap === 1);
  assert.ok(lo.vignette, 'vignette stays (nearly free)');
});

test('post-processing stays restrained', () => {
  const { bloom, vignette, grain } = CINEMA.post;
  assert.ok(bloom.threshold >= 0.5, 'only genuine highlights bloom');
  assert.ok(bloom.strength <= 0.6);
  assert.ok(vignette <= 0.4 && grain <= 0.03);
});

test('scene wiring: brand palette, modules used, old off-brand colours gone', () => {
  const src = readFileSync(new URL('../src/components/momentum/LifeConstellation.tsx', import.meta.url), 'utf8');
  for (const m of ['CinematicCameraRig', 'LightingDirector', 'Atmosphere', 'PostFX', 'PerformanceManager']) {
    assert.ok(src.includes(`new ${m}(`), `${m} is used`);
  }
  assert.ok(!src.includes('#7dd3fc'), 'old cyan accent removed');
  assert.ok(!src.includes('AmbientLight'), 'no flat ambient light');
  assert.ok(!src.includes('scene.rotation.y = parallax'), 'parallax no longer rotates the lit scene');
  assert.match(src, /rig\.apply\(camera, controls\.target, t, dt\);\s*postFX\.render\(t\);\s*rig\.restore\(camera, controls\.target\);/);
  assert.match(src, /rig\.dispose\(\);[\s\S]*postFX\.dispose\(\);[\s\S]*lighting\.dispose\(\);/, 'new resources are disposed');
});
