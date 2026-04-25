import React from 'react';
import ErrorState from './ErrorState';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Frontend render error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="section-wrap min-h-screen py-16">
          <ErrorState
            title="Something went wrong"
            message="The page hit an unexpected problem. Reload and try again."
            onRetry={this.handleRetry}
          />
        </main>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
