import { Component, type ReactNode } from 'react';

/**
 * Keeps one broken view from taking the whole app down. The job is already
 * saved, so trying again or opening another view loses nothing.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string; onBackup?: () => void }, { error: Error | null; key: string }> {
  state: { error: Error | null; key: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    // moving to another view or job clears the error
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h2>This view stopped working</h2>
        <p>Your job is saved. Try again, or open another view from the list on the left.</p>
        <pre>{this.state.error.message}</pre>
        <div className="crash-actions">
          <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="btn" onClick={() => location.reload()}>
            Reload
          </button>
          {this.props.onBackup && (
            <button type="button" className="btn" onClick={this.props.onBackup}>
              Download a backup
            </button>
          )}
        </div>
      </div>
    );
  }
}
