// src/components/ErrorBoundary.tsx - Enterprise-grade error handling
import { Component, type ErrorInfo, type ReactNode } from "react";

import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error("❌ Error Boundary caught:", error);
      console.error("📍 Component Stack:", errorInfo.componentStack);
    }

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // TODO: Send to monitoring service (Sentry, DataDog, etc.)
    // Example: Sentry.captureException(error, { extra: errorInfo });

    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  override render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <Card className="w-full max-w-2xl shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-100 p-3">
                  <AlertTriangle className="size-8 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Something went wrong</CardTitle>
                  <p className="mt-1 text-sm text-gray-500">
                    We're sorry for the inconvenience. The error has been logged.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Error Message */}
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-sm text-red-800">
                  <strong>Error:</strong>{" "}
                  {this.state.error?.message || "An unexpected error occurred"}
                </AlertDescription>
              </Alert>

              {/* Stack Trace (Development Only) */}
              {import.meta.env.DEV && this.state.error?.stack && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                    Technical Details (Development Mode)
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-100 p-3 text-xs">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={this.handleReset} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <RefreshCw className="mr-2 size-4" />
                  Try Again
                </Button>

                <Button onClick={this.handleReload} variant="outline" className="flex-1">
                  <RefreshCw className="mr-2 size-4" />
                  Reload Page
                </Button>

                <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                  <Home className="mr-2 size-4" />
                  Go Home
                </Button>
              </div>

              {/* Help Text */}
              <p className="border-t pt-4 text-center text-xs text-gray-500">
                If this problem persists, please{" "}
                <a
                  href="https://github.com/your-repo/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  report an issue
                </a>{" "}
                or contact support.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE WRAPPERS
// ══════════════════════════════════════════════════════════════════════════════

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  featureName: string;
}

/**
 * Error boundary for individual features/routes
 * Shows inline error instead of full-page
 */
export function FeatureErrorBoundary({ children, featureName }: FeatureErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">{featureName} unavailable</h3>
                <p className="mt-1 text-sm text-red-700">
                  This feature encountered an error. Please try refreshing the page.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="mt-3"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      }
      onError={(error) => {
        console.error(`Feature "${featureName}" error:`, error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
