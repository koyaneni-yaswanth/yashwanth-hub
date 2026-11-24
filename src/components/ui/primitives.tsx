/**
 * Jarvis OS v3 shared primitives. Use these for new and redesigned screens
 * instead of hand-written class strings, so the whole app stays consistent.
 */
import React, { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  badgeClasses,
  buttonClasses,
  fieldIds,
  inputClasses,
  panelClasses,
  type BadgeTone,
  type ButtonSize,
  type ButtonVariant,
} from './uiClasses';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  block?: boolean;
  /** Icon-only button: `aria-label` is required so it has an accessible name. */
  iconOnly?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, block, iconOnly, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, { iconOnly, block }), className)}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

type PanelProps = React.HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'div' | 'article' | 'aside';
  interactive?: boolean;
  padded?: boolean;
};

export function Panel({ as: Tag = 'section', interactive, padded, className, ...rest }: PanelProps) {
  return <Tag className={cn(panelClasses({ interactive, padded }), className)} {...rest} />;
}

/** Small mono label above a heading ("TODAY", "PAWAN SHAKTI"). */
export function Eyebrow({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('type-eyebrow', className)} {...rest} />;
}

export function Badge({ tone = 'neutral', className, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn(badgeClasses(tone), className)} {...rest} />;
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  /** Render prop gets the id and aria props to spread on the control. */
  children: (control: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => React.ReactNode;
  className?: string;
  optional?: boolean;
};

/** Label + control + hint + error, with ids wired for screen readers. */
export function Field({ label, hint, error, children, className, optional }: FieldProps) {
  const id = useId();
  const { hintId, errorId, describedBy } = fieldIds(id, { hint: Boolean(hint), error: Boolean(error) });
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-[var(--hub-ink)]">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-[var(--hub-muted)]">Optional</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--hub-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--hub-red)]">
          {error}
        </p>
      )}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cn(inputClasses(rest['aria-invalid'] === true), className)} {...rest} />;
});

type EmptyStateProps = {
  icon?: React.ElementType;
  title: string;
  description?: string;
  /** One clear next step; omit rather than show a button that does nothing. */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center px-6 py-10', className)}>
      {Icon && (
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hub-line)] text-[var(--hub-muted)]">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
      )}
      <p className="font-heading text-base font-semibold text-[var(--hub-ink)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[var(--hub-muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
