# Momentum constellation: cinematography pass

The site's one Three.js scene is the Life Constellation on the Momentum page (`src/components/momentum/LifeConstellation.tsx`, three r187, WebGLRenderer).
This pass changes how the scene is shot and lit. It doesn't change what the scene shows, the page layout, or any interaction.

## Audit: biggest opportunities (in priority order)

1. **Off-brand colour.** A cyan core, purple/blue nebulae and a blue-black sky clashed with the gold/steel brand.
2. **Flat light.** A uniform ambient light plus a weak white key gave no shape and no separation from the black.
3. **No camera language.** There was no opening reveal and no scroll relationship. Pointer parallax rotated the whole scene, which also swung the lighting.
4. **Bloom threshold of 0.22:** mid-tones glowed.
5. **One-shot performance check:** quality was judged once in the first 3 seconds and never again.

Already good and kept: ACES tone mapping, sRGB output, PMREM environment, pausing when off-screen or the tab is hidden, the reduced-motion pause, full GPU disposal.

## Visual direction: "quiet observatory"

- **Mood:** calm, premium, technical.
- **Hierarchy:** the momentum core, then goal planets, then projects and satellites. Stars, dust and memories recede.
- **Palette:** night #050608; gold #C6A46B (core, energy, focus); steel #8BA8C8 (orbits, memories, rim); ivory stars. Life-domain colours on planets stay, because they carry meaning.
- **Light:** a warm key (upper right front), a cool steel rim (behind left), a low hemispheric fill, and the core as a practical light. No flat ambient.
- **Camera:** eased everywhere, with no linear motion. UI-triggered moves settle in about 1 s; the opening reveal lasts 2.4 s and is skipped as soon as you touch the scene.
- **Post:** bloom only on true highlights, a mild vignette, faint grain. No depth of field, chromatic aberration, lens flares or shake.

## Modules (`src/components/momentum/cinema/`)

| File | Role |
|---|---|
| `cinemaConfig.ts` | **All tunables** (`CINEMA`) plus pure motion maths: easing, settle, scroll timeline, tiers. Unit-tested. |
| `CinematicCameraRig.ts` | Reveal, scroll path, pointer micro-parallax, idle breath. Applied as a per-frame offset (`apply` before render, `restore` after), so OrbitControls, focus glides and Reset are untouched. |
| `LightingDirector.ts` | Key, rim, fill, core light, and the RoomEnvironment PMREM (a procedural studio HDR, so no asset download). |
| `Atmosphere.ts` | Exponential fog, brand-tinted nebulae, two star layers, midground dust. |
| `PostFX.ts` | RenderPass → UnrealBloom → OutputPass (ACES + sRGB) → finish pass (vignette + grain, display space). |
| `PerformanceManager.ts` | Starting tier from device hints, then fps measured in 2 s windows while animating. Steps down only, so quality never flickers. |

## Camera timeline

| Trigger | Progress | Camera |
|---|---|---|
| First open | 0 → 2.4 s | Dolly-in from +38% distance, easeInOutCubic. Skipped on drag, when returning to the page, and with reduced motion. |
| Scroll: panel entering | 0.00 | +8% distance, 1.6 units lower (looking across the orbital plane) |
| Scroll: panel centred | 0.50 | The authored home framing |
| Scroll: panel leaving | 1.00 | −8% distance, 1.6 units higher (looking down on the system) |
| Click a planet/project/memory | ~1 s | Exponential glide to a close framing (as before, now at `focusRate`) |
| Idle | continuous | ±0.12-unit breath over a 9 s period; the core's glow swells ±1.5% |
| Pointer move | continuous | ±0.55-unit sideways and vertical micro-parallax, eased |

## Tunable parameters (`CINEMA` in `cinemaConfig.ts`)

| Parameter | Value | Effect |
|---|---|---|
| `renderer.exposure` | 1.0 | Overall brightness after ACES |
| `renderer.pixelRatio` | high 2 / medium 1.5 / low 1 | DPR cap per tier |
| `lighting.key / rim / fill / core` | 1.7 / 2.1 / 0.32 / 48 | Light intensities (colours and positions alongside) |
| `lighting.environmentIntensity` | 0.3 | Reflection strength |
| `atmosphere.fogDensity` | 0.0105 | Depth falloff |
| `atmosphere.nebulaOpacity` | 0.2 | Background colour |
| `atmosphere.dust` / `stars` | per tier | Particle counts |
| `post.bloom` | strength 0.42, radius 0.48, threshold 0.62 | Highlight glow |
| `post.vignette` | 0.32 | Corner darkening |
| `post.grain` | 0.022 | Film grain (high tier only) |
| `camera.introDolly / introSeconds` | 0.38 / 2.4 | Opening reveal |
| `camera.focusRate` | 2.9 | Selection glide speed (~1 s) |
| `camera.scrollDolly / scrollLift` | 0.08 / 1.6 | Scroll path size |
| `camera.parallax / parallaxRate` | 0.55 / 3.2 | Pointer response |
| `camera.breath / breathPeriod` | 0.12 / 9 | Idle drift |
| `performance.floorFps` | desktop 48 / mobile 28 | Step-down threshold |

## Mobile and low-end fallback

- **high:** DPR ≤ 2, bloom, grain, glass refraction, full stars, dust.
- **medium** (phones, ≤ 4 cores or ≤ 4 GB, reduced motion): DPR ≤ 1.5, bloom, no grain, glass becomes a cheap sheen, fewer stars and dust.
- **low** (≤ 2 cores, ≤ 2 GB, Save-Data, or measured fps below the floor): DPR 1, no bloom, no grain, no dust, minimum stars.
- **No WebGL:** the existing text notice. Every fact is also shown in the page panels.
- **Reduced motion:** the scene starts paused. No reveal, scroll path, parallax or breathing. Focus changes cut instead of glide.

Not used, and why:
- **WebGPURenderer and TSL:** the project uses WebGLRenderer, and this scene has no material that needs node shading.
- **Shadows:** objects float in space, and contact shadows would read as fake.
- **KTX2/Draco:** there are no textures or models to compress; everything is procedural.

## Before → after

| | Before | After |
|---|---|---|
| Palette | Cyan, purple, blue | Gold, steel, ivory on night black |
| Lighting | Flat ambient + weak key | Warm key, cool rim, hemispheric fill, practical core |
| Camera | Static start; parallax rotated the scene | Reveal, scroll path, eased micro-parallax, breathing |
| Bloom | Threshold 0.22 (mid-tones glow) | 0.62 (highlights only) |
| Finish | None | Vignette 0.32, grain 0.022 |
| Performance | One check in the first 3 s | Device-hinted tier plus continuous 2 s windows |

## QA checklist

- [x] Unit tests: easing, settle times, scroll timeline, intro, breathing, tiers, post limits, wiring (`tests/v14_cinematography.test.mjs`).
- [x] Disposal: leaving and returning twice leaves exactly one canvas. Rig listeners, post passes, lights and the environment are disposed.
- [x] No console errors on load.
- [x] Colour: ACES + sRGB output; new tones checked for WCAG contrast in `tests/v13_design_system.test.mjs`.
- [ ] **FPS on real hardware:** not measured. The test browser runs hidden and caps animation at about 7 fps. Check desktop ≥ 55 and a mid-range phone ≥ 30 with DevTools' FPS meter.
- [ ] Reduced motion: turn it on in the OS. The scene should start paused, with no reveal or parallax.
- [ ] Resize: drag the window narrow and wide. The scene should reframe without stretching.
- [ ] Touch: drag to orbit, and tap a planet to select it.
- [ ] UI readability: the HUD text over the scene stays readable during the reveal and on scroll.
