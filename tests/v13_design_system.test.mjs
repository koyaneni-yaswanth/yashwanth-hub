import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buttonClasses, badgeClasses, fieldIds, inputClasses, panelClasses } from '../src/components/ui/uiClasses.ts';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('design tokens: the dark theme uses the v3 palette', () => {
  const dark = css.slice(css.indexOf(':root.dark, html[data-theme="dark"]'));
  for (const [token, value] of [
    ['--hub-bg', '#050608'],
    ['--hub-surface-subtle', '#0a0d12'],
    ['--hub-surface', '#10151d'],
    ['--hub-ink', '#f5f3ef'],
    ['--hub-muted', '#969ba6'],
    ['--hub-accent', '#c6a46b'],
    ['--hub-accent-2', '#8ba8c8'],
  ]) {
    assert.match(dark, new RegExp(`${token}:\\s*${value};`), `${token} should be ${value}`);
  }
});

test('design tokens: fonts and remapped brand scales are defined once in @theme', () => {
  assert.match(css, /--font-sans:\s*'Inter'/);
  assert.match(css, /--font-display:\s*'Space Grotesk'/);
  assert.match(css, /--font-serif:\s*'Instrument Serif'/);
  assert.match(css, /--color-teal-500:\s*#c6a46b/);
  assert.match(css, /--color-sky-400:\s*#8ba8c8/);
  assert.equal((css.match(/@theme\s*\{/g) || []).length, 1);
});

test('theme: dark is the default before first paint and fonts do not block rendering', () => {
  assert.match(html, /saved === 'light' \? false : saved === 'system' \?/);
  assert.match(html, /rel="preload" as="style"[^>]+Space\+Grotesk/);
  assert.ok(!/<link href="https:\/\/fonts\.googleapis\.com[^>]+rel="stylesheet">/.test(html), 'no render-blocking font stylesheet');
});

// WCAG contrast of the main text pairs (computed, not eyeballed).
function lum(hex) {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('contrast: text and accent pairs meet WCAG AA', () => {
  // dark theme
  assert.ok(ratio('#f5f3ef', '#10151d') >= 7, 'ink on surface');
  assert.ok(ratio('#969ba6', '#10151d') >= 4.5, 'muted on surface');
  assert.ok(ratio('#969ba6', '#050608') >= 4.5, 'muted on background');
  assert.ok(ratio('#c6a46b', '#10151d') >= 4.5, 'gold text on surface');
  assert.ok(ratio('#050608', '#c6a46b') >= 4.5, 'text on gold button');
  assert.ok(ratio('#8ba8c8', '#10151d') >= 4.5, 'steel text on surface');
  // light theme
  assert.ok(ratio('#14171c', '#ffffff') >= 7, 'ink on white');
  assert.ok(ratio('#565b66', '#f3f1ec') >= 4.5, 'muted on paper');
  assert.ok(ratio('#86693d', '#ffffff') >= 4.5, 'gold text on white');
  assert.ok(ratio('#ffffff', '#86693d') >= 4.5, 'text on gold button (light)');
});

test('primitives: button recipes', () => {
  const primary = buttonClasses('primary', 'md');
  assert.match(primary, /bg-\[var\(--hub-accent\)\]/);
  assert.match(primary, /focus-visible:ring-2/);
  assert.match(primary, /h-10/);
  assert.match(buttonClasses('ghost', 'sm', { iconOnly: true }), /h-8 w-8/);
  assert.match(buttonClasses('secondary', 'lg', { block: true }), /w-full/);
  assert.equal(buttonClasses('nope', 'xx'), buttonClasses('secondary', 'md'), 'unknown values fall back');
});

test('primitives: badges, panels, inputs, field ids', () => {
  assert.match(badgeClasses('accent'), /--hub-accent/);
  assert.match(badgeClasses('bogus'), /--hub-muted/);
  assert.match(panelClasses({ interactive: true }), /hover:shadow/);
  assert.ok(!panelClasses({ padded: false }).includes('p-5'));
  assert.match(inputClasses(true), /--hub-red/);
  assert.deepEqual(fieldIds('f1', { hint: true, error: true }), { hintId: 'f1-hint', errorId: 'f1-error', describedBy: 'f1-hint f1-error' });
  assert.deepEqual(fieldIds('f2', {}), { hintId: undefined, errorId: undefined, describedBy: undefined });
});
