/**
 * App-wide toasts: a tiny store so any page can call toast(...) in place of a
 * blocking alert(). Rendered once by <Toaster /> in App.
 */
export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const MAX_VISIBLE = 3;

function emit() {
  for (const l of listeners) l(items);
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Shows a non-blocking message. Errors stay longer, since they usually need reading. */
export function toast(message: string, tone: ToastTone = 'info', durationMs?: number): number {
  const id = nextId++;
  const duration = durationMs ?? (tone === 'error' ? 8000 : Math.min(9000, 3500 + message.length * 40));
  items = [...items, { id, message, tone, durationMs: duration }].slice(-MAX_VISIBLE);
  emit();
  if (typeof window !== 'undefined') window.setTimeout(() => dismissToast(id), duration);
  return id;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}
