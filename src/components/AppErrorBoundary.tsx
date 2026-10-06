import { Component, ReactNode } from 'react';
import { tr } from '@/lib/i18n';
import { copyText, errorReport, noteError } from '@/lib/errorLog';

interface State {
  error: Error | null;
  /** The report has been copied (or couldn't be). */
  copied: 'yes' | 'failed' | null;
}

/**
 * Catches render-time exceptions anywhere in the tree so a single bad render
 * doesn't blank the whole app to a black background with no signal. Shows the
 * error message + stack inline and a reload button — far better UX (and far
 * easier to debug) than the silent unmount React does by default. Nothing is
 * sent anywhere: Copy report puts a short, impersonal report (lib/errorLog.ts)
 * on the clipboard for the rider to pass on.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, copied: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Surface to the console so it appears in remote-debug sessions too.
    console.error('[AppErrorBoundary] Caught render error:', error, info.componentStack);
    noteError(error);
  }

  handleCopy = async () => {
    const { error } = this.state;
    if (!error) return;
    this.setState({ copied: (await copyText(errorReport(error))) ? 'yes' : 'failed' });
  };

  handleReload = () => {
    // Hard reload clears any in-memory state that triggered the crash.
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null, copied: null });
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 gap-4 safe-top safe-bottom safe-frame-x overflow-y-auto">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-5 space-y-3">
          <h1 className="text-lg font-semibold">{tr("Something went wrong")}</h1>
          <p className="text-sm text-muted-foreground break-words">
            {error.message || tr("Unknown error")}
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
              {tr("Try again")}
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 h-10 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-medium"
            >
              {tr("Reload")}
            </button>
          </div>
          <button
            onClick={this.handleCopy}
            className="w-full min-h-11 rounded-xl border border-border text-sm font-medium hover:bg-secondary"
          >
            {copied === 'yes' ? tr("Report copied") : tr("Copy report")}
          </button>
          <p className="text-[11px] leading-snug text-muted-foreground" role="status">
            {copied === 'failed'
              ? tr("Couldn't copy the report. Take a screenshot of this screen instead.")
              : tr("Paste the report to us so we can fix this. It holds the error, this screen, and your phone and app version: no name, no location, no ride data. Nothing is sent on its own.")}
          </p>
        </div>
      </div>
    );
  }
}
