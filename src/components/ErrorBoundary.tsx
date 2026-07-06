import React from 'react';

type Props = {
  children: React.ReactNode;
  viewName: string;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends (React.Component as any) {
  props!: Props;
  state: State = { error: null };
  setState!: (state: Partial<State>) => void;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Render error in ${this.props.viewName}`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.viewName !== this.props.viewName && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-message">
          // error: {this.state.error.message}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="error-boundary-button"
        >
          [reload view]
        </button>
      </div>
    );
  }
}
