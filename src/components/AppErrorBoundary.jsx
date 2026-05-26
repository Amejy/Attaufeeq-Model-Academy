import React from 'react';
import ErrorState from './ErrorState';
import { sanitizeUserMessage } from '../utils/userMessage';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: sanitizeUserMessage(
        error?.message,
        'The page ran into a problem. Please reload and try again.'
      )
    };
  }

  componentDidCatch() {}

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
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
            message={this.state.errorMessage || 'The page hit an unexpected problem. Reload and try again.'}
            onRetry={this.handleRetry}
          />
        </main>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
