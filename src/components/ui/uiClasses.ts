/**
 * Jarvis OS v3 design system: class recipes for the shared primitives.
 * Pure (no React) so the rules are unit-tested and reusable in any component.
 * Colours come from the --hub-* tokens in src/index.css, so every recipe
 * follows the dark (default) and light themes.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hub-bg)]';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--hub-ease-out)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed aria-busy:cursor-progress ' +
  FOCUS;

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Gold is reserved for the one main action on a screen.
  primary:
    'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] hover:bg-[var(--hub-accent-hover)] border border-transparent',
  secondary:
    'bg-[var(--hub-surface-raised)] text-[var(--hub-ink)] border border-[var(--hub-line)] hover:bg-[var(--hub-surface-hover)] hover:border-[var(--hub-muted)]/40',
  ghost: 'bg-transparent text-[var(--hub-muted)] border border-transparent hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)]',
  danger:
    'bg-transparent text-[var(--hub-red)] border border-[var(--hub-red)]/40 hover:bg-[var(--hub-red)]/10 hover:border-[var(--hub-red)]/70',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-[var(--hub-radius-sm)]',
  md: 'h-10 px-4 text-sm rounded-[var(--hub-radius-sm)]',
  lg: 'h-12 px-6 text-base rounded-[var(--hub-radius)]',
};

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 rounded-[var(--hub-radius-sm)]',
  md: 'h-10 w-10 rounded-[var(--hub-radius-sm)]',
  lg: 'h-12 w-12 rounded-[var(--hub-radius)]',
};

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  opts: { iconOnly?: boolean; block?: boolean } = {}
): string {
  const v = BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.secondary;
  const s = opts.iconOnly ? ICON_ONLY_SIZES[size] ?? ICON_ONLY_SIZES.md : BUTTON_SIZES[size] ?? BUTTON_SIZES.md;
  return [BUTTON_BASE, v, s, opts.block ? 'w-full' : ''].filter(Boolean).join(' ');
}

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'text-[var(--hub-muted)] border-[var(--hub-line)] bg-transparent',
  accent: 'text-[var(--hub-accent)] border-[var(--hub-accent)]/35 bg-[var(--hub-accent)]/10',
  info: 'text-[var(--hub-accent-2)] border-[var(--hub-accent-2)]/35 bg-[var(--hub-accent-2)]/10',
  success: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/35 bg-emerald-500/10',
  warning: 'text-[var(--hub-amber)] border-[var(--hub-amber)]/35 bg-[var(--hub-amber)]/10',
  danger: 'text-[var(--hub-red)] border-[var(--hub-red)]/35 bg-[var(--hub-red)]/10',
};

export function badgeClasses(tone: BadgeTone = 'neutral'): string {
  return (
    'inline-flex items-center gap-1 h-6 px-2 rounded-full border font-mono text-[0.6875rem] uppercase tracking-[0.08em] ' +
    (BADGE_TONES[tone] ?? BADGE_TONES.neutral)
  );
}

export const panelClasses = (opts: { interactive?: boolean; padded?: boolean } = {}): string =>
  [
    'bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-[var(--hub-radius)] shadow-[var(--hub-card-shadow)]',
    opts.padded === false ? '' : 'p-5',
    opts.interactive
      ? 'transition-[border-color,box-shadow,background-color] duration-200 hover:border-[var(--hub-accent)]/30 hover:shadow-[var(--hub-shadow-hover)]'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

export const inputClasses = (invalid = false): string =>
  'w-full h-10 px-3 rounded-[var(--hub-radius-sm)] bg-[var(--hub-surface-subtle)] text-[var(--hub-ink)] text-sm ' +
  'border placeholder:text-[var(--hub-muted)]/70 transition-colors duration-150 ' +
  (invalid ? 'border-[var(--hub-red)]/70 ' : 'border-[var(--hub-line)] hover:border-[var(--hub-muted)]/40 ') +
  'focus:outline-none focus:border-[var(--hub-accent)] focus:ring-2 focus:ring-[var(--hub-accent)]/25 disabled:opacity-60';

/** ids for a form field's label, hint and error, so aria-describedby always points at real elements. */
export function fieldIds(id: string, opts: { hint?: boolean; error?: boolean }) {
  const hintId = opts.hint ? `${id}-hint` : undefined;
  const errorId = opts.error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { hintId, errorId, describedBy };
}
