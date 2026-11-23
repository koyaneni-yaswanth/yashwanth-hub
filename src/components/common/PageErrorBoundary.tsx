import React from 'react';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { isChunkLoadError, reloadOnceForNewVersion } from '../../lib/chunkReload';

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
  /** A stale-deploy reload is under way: show a calm "updating" note, not an error. */
  reloading: boolean;
}

/**
 * Contains a crash to the page that threw, so the header, sidebar and the
 * rest of the app stay usable instead of the whole screen going blank.
 */
export class PageErrorBoundary extends React.Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null, resetKey: this.props.resetKey, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<PageErrorBoundaryState> {
    // Optimistically show "updating" for chunk errors; componentDidCatch clears it if no reload starts.
    return { error, reloading: isChunkLoadError(error) };
  }

  // Navigating to another page clears a previous page's error.
  static getDerivedStateFromProps(
    props: PageErrorBoundaryProps,
    state: PageErrorBoundaryState
  ): Partial<PageErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey, reloading: false } : null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Stale-deploy recovery: reload once to pick up the new version.
    if (isChunkLoadError(error)) {
      if (reloadOnceForNewVersion()) {
        console.info(`[PageErrorBoundary] ${this.props.pageName}: newer version deployed, reloading once.`);
        return;
      }
      this.setState({ reloading: false });
    }
    console.error(`[PageErrorBoundary] ${this.props.pageName} crashed:`, error, info.componentStack);
  }

  private handleRetry = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    if (reloading) {
      return (
        <div role="status" aria-live="polite" className="flex items-center justify-center min-h-[50vh] px-4 text-sm text-[var(--hub-muted)] gap-2">
          <RefreshCw className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading the latest version…
        </div>
      );
    }

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
