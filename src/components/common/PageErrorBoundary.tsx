import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface PageErrorBoundaryProps {
  /** Changing this key (e.g. the active tab) clears a previous error. */
  resetKey: string;
  pageName: string;
  onGoHome: () => void;
  children: React.ReactNode;
}

interface PageErrorBoundaryState {
  error: Error | null;
  resetKey: string;
}

const CHUNK_RELOAD_FLAG = 'yash_chunk_reload_at';

/** A lazy page chunk failed to load — usually a new deploy replaced the old hashed files. */
function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    error.message || ''
  );
}

/**
 * Contains a crash to the page that threw, so the header, sidebar and the
 * rest of the app stay usable instead of the whole screen going blank.
 */
export class PageErrorBoundary extends React.Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<PageErrorBoundaryState> {
    return { error };
  }

  // Navigating to another page clears a previous page's error.
  static getDerivedStateFromProps(
    props: PageErrorBoundaryProps,
    state: PageErrorBoundaryState
  ): Partial<PageErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PageErrorBoundary] ${this.props.pageName} crashed:`, error, info.componentStack);

    // Stale-deploy recovery: reload once to pick up the new asset manifest.
    if (isChunkLoadError(error)) {
      try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG) || 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // sessionStorage unavailable — fall through to the manual retry UI.
      }
    }
  }

  private handleRetry = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const chunkError = isChunkLoadError(error);

    return (
      <div role="alert" className="flex items-center justify-center min-h-[50vh] px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] p-6 sm:p-8 shadow-[var(--hub-card-shadow)]">
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-[var(--hub-red)]/10 text-[var(--hub-red)] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[var(--hub-ink)]">
            {chunkError ? `${this.props.pageName} couldn't load` : `${this.props.pageName} hit a problem`}
          </h2>
          <p className="mt-2 text-sm text-[var(--hub-muted)] leading-relaxed">
            {offline
              ? "You're offline and this page hasn't been cached yet. Your data is safe on this device."
              : chunkError
                ? 'A newer version of the hub was probably just deployed. Reloading fetches it.'
                : 'The rest of your hub still works and your data is safe. Try again, or head back home.'}
          </p>
          {!chunkError && error.message && (
            <pre className="mt-4 max-h-24 overflow-auto rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] p-3 text-left text-[11px] text-[var(--hub-muted)] whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              {chunkError ? 'Reload' : 'Try again'}
            </button>
            <button
              type="button"
              onClick={this.props.onGoHome}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--hub-line)] text-sm font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
