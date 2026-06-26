import { Component, ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions anywhere in the tree so a single bad render
 * doesn't blank the whole app to a black background with no signal. Shows the
 * error message + stack inline and a reload button — far better UX (and far
 * easier to debug) than the silent unmount React does by default.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Surface to the console so it appears in remote-debug sessions too.
    console.error('[AppErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReload = () => {
    // Hard reload clears any in-memory state that triggered the crash.
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 gap-4 safe-top safe-bottom">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-5 space-y-3">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground break-words">
            {error.message || 'Unknown error'}
          </p>
          {error.stack && (
            <pre className="text-[10px] text-muted-foreground/80 overflow-auto max-h-48 whitespace-pre-wrap break-words">
              {error.stack}
            </pre>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={this.handleReset}
              className="flex-1 h-10 rounded-xl bg-secondary hover:bg-muted text-sm font-medium"
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 h-10 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-medium"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
