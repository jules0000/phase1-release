import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { captureError } from '@/lib/sentry';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  error?: Error;
  componentStack?: string;
  resetError?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Log error to monitoring service
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Send to Sentry with component stack
    captureError(error, {
      componentStack: errorInfo.componentStack,
      ...errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    // Reset error state and attempt recovery
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    
    // Force a re-render by updating a key or reloading the component
    // This helps recover from transient errors
    if (this.props.resetError) {
      this.props.resetError();
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReload = () => {
    // Full page reload for persistent errors
    window.location.reload();
  };

  render() {
    // Support being used as Sentry fallback component
    const error = this.state.error || this.props.error;
    const errorInfo = this.state.errorInfo;
    const hasError = this.state.hasError || !!this.props.error;

    if (hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <CardDescription>
                {error?.message 
                  ? `An error occurred: ${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}`
                  : "We're sorry, but something unexpected happened. Please try again or refresh the page."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {process.env.NODE_ENV === 'development' && error && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm font-medium text-muted-foreground">Error Details:</p>
                  <p className="text-sm text-destructive">{error.message}</p>
                  {(errorInfo?.componentStack || this.props.componentStack) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        Stack Trace
                      </summary>
                      <pre className="mt-2 text-xs text-muted-foreground overflow-auto">
                        {errorInfo?.componentStack || this.props.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button onClick={this.props.resetError || this.handleRetry} className="flex-1">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={this.handleReload} className="flex-1">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reload Page
                  </Button>
                </div>
                <Button variant="outline" onClick={this.handleGoHome} className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export const useErrorHandler = () => {
  const handleError = (error: Error, errorInfo?: any) => {
    console.error('Error caught by useErrorHandler:', error, errorInfo);

    // Send to Sentry
    captureError(error, errorInfo);
  };

  return { handleError };
};

// Higher-order component for wrapping components with error boundary
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
};
