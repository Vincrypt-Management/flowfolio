import React, { Component, ReactNode } from 'react';

interface Props {
  tabName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h3>{this.props.tabName} encountered an error</h3>
          <p style={{ color: '#888' }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
