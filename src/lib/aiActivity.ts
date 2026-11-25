/**
 * Lightweight pub-sub store tracking Ask AI / Home AI execution phase so the 3D
 * Jarvis core pulses reactively whenever the user is thinking with or talking to AI.
 */
export type AiActivityPhase = 'idle' | 'thinking' | 'talking';

type Listener = () => void;

const state: { phase: AiActivityPhase; activeCount: number; talkTimer: number | null } = {
  phase: 'idle',
  activeCount: 0,
  talkTimer: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function getAiActivityPhase(): AiActivityPhase {
  return state.phase;
}

export function subscribeAiActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginAiThinking(): void {
  if (state.talkTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(state.talkTimer);
    state.talkTimer = null;
  }
  state.activeCount += 1;
  if (state.phase !== 'thinking') {
    state.phase = 'thinking';
    emit();
  }
}

export function endAiThinking(responded = true): void {
  state.activeCount = Math.max(0, state.activeCount - 1);
  if (state.activeCount > 0) return;

  if (responded && typeof window !== 'undefined') {
    state.phase = 'talking';
    emit();
    state.talkTimer = window.setTimeout(() => {
      state.talkTimer = null;
      if (state.activeCount === 0 && state.phase !== 'idle') {
        state.phase = 'idle';
        emit();
      }
    }, 2600);
  } else if (state.phase !== 'idle') {
    state.phase = 'idle';
    emit();
  }
}
