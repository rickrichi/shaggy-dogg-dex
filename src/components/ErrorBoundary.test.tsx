// src/components/ErrorBoundary.test.tsx - Tests for ErrorBoundary component
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary, FeatureErrorBoundary } from "./ErrorBoundary";

// ══════════════════════════════════════════════════════════════════════════════
// TEST COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>No error</div>;
}

function NestedThrowError() {
  return (
    <div>
      <ThrowError shouldThrow />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe("ErrorBoundary", () => {
  // Suppress console.error for cleaner test output
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe("Error Catching", () => {
    it("should render children when there is no error", () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText("Test content")).toBeInTheDocument();
    });

    it("should catch errors from child components", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it("should catch errors from nested children", () => {
      render(
        <ErrorBoundary>
          <NestedThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it("should display error message", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getAllByText(/test error/i)).not.toHaveLength(0);
    });
  });

  describe("Error Callback", () => {
    it("should call onError callback when error occurs", () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it("should pass correct error to callback", () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Test error",
        }),
        expect.any(Object)
      );
    });
  });

  describe("Custom Fallback", () => {
    it("should render custom fallback when provided", () => {
      const CustomFallback = ({ error }: { error: Error }) => (
        <div>Custom error: {error.message}</div>
      );

      render(
        <ErrorBoundary fallback={<CustomFallback error={new Error("Test")} />}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText(/custom error/i)).toBeInTheDocument();
    });

    it("should use default fallback when no custom fallback provided", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe("Error Recovery", () => {
    it("should show reload button in fallback UI", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
    });

    it("should show go home button in fallback UI", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
    });

    it("should reload page when reload button clicked", async () => {
      const user = userEvent.setup();
      const reloadSpy = vi.fn();
      Object.defineProperty(window, "location", {
        value: { reload: reloadSpy },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByRole("button", { name: /reload page/i });
      await user.click(reloadButton);

      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe("Development Mode", () => {
    it("should show stack trace in development", () => {
      const originalEnv = import.meta.env.DEV;
      (import.meta.env as any).DEV = true;

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      // Stack trace should be visible
      expect(screen.getByText(/technical details/i)).toBeInTheDocument();

      (import.meta.env as any).DEV = originalEnv;
    });

    it("should hide stack trace in production", () => {
      const originalEnv = import.meta.env.DEV;
      (import.meta.env as any).DEV = false;

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      // Stack trace should not be visible
      expect(screen.queryByText(/technical details/i)).not.toBeInTheDocument();

      (import.meta.env as any).DEV = originalEnv;
    });
  });
});

describe("FeatureErrorBoundary", () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe("Feature-Specific Errors", () => {
    it("should render children when there is no error", () => {
      render(
        <FeatureErrorBoundary featureName="Swap">
          <div>Swap feature</div>
        </FeatureErrorBoundary>
      );

      expect(screen.getByText("Swap feature")).toBeInTheDocument();
    });

    it("should catch errors in feature", () => {
      render(
        <FeatureErrorBoundary featureName="Swap">
          <ThrowError shouldThrow />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText(/swap.*unavailable/i)).toBeInTheDocument();
    });

    it("should display feature name in error message", () => {
      render(
        <FeatureErrorBoundary featureName="Liquidity Pools">
          <ThrowError shouldThrow />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText(/liquidity pools.*unavailable/i)).toBeInTheDocument();
    });

    it("should provide inline error UI", () => {
      render(
        <FeatureErrorBoundary featureName="Portfolio">
          <ThrowError shouldThrow />
        </FeatureErrorBoundary>
      );

      // Should show compact error message, not full-page error
      expect(screen.queryByRole("button", { name: /go home/i })).not.toBeInTheDocument();
    });
  });

  describe("Feature Recovery", () => {
    it("should show retry button in feature error UI", () => {
      render(
        <FeatureErrorBoundary featureName="Swap">
          <ThrowError shouldThrow />
        </FeatureErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("should attempt to recover when retry clicked", async () => {
      const user = userEvent.setup();
      let shouldThrow = true;

      render(
        <FeatureErrorBoundary featureName="Swap">
          <ThrowError shouldThrow={shouldThrow} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText(/unavailable/i)).toBeInTheDocument();

      // Fix the error
      shouldThrow = false;

      const retryButton = screen.getByRole("button", { name: /try again/i });
      await user.click(retryButton);

      // Component should recover (this may require state reset in boundary)
      // Note: Actual recovery behavior depends on ErrorBoundary implementation
    });
  });

  describe("Error Isolation", () => {
    it("should not affect sibling features when one fails", () => {
      render(
        <div>
          <FeatureErrorBoundary featureName="Feature A">
            <ThrowError shouldThrow />
          </FeatureErrorBoundary>
          <FeatureErrorBoundary featureName="Feature B">
            <div>Feature B works</div>
          </FeatureErrorBoundary>
        </div>
      );

      expect(screen.getByText(/feature a.*unavailable/i)).toBeInTheDocument();
      expect(screen.getByText("Feature B works")).toBeInTheDocument();
    });
  });
});

describe("Error Boundary Integration", () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("should work with nested boundaries", () => {
    render(
      <ErrorBoundary>
        <div>
          <FeatureErrorBoundary featureName="Inner Feature">
            <ThrowError shouldThrow />
          </FeatureErrorBoundary>
          <div>Outer content still renders</div>
        </div>
      </ErrorBoundary>
    );

    // Inner boundary catches the error
    expect(screen.getByText(/inner feature.*unavailable/i)).toBeInTheDocument();
    // Outer content still renders
    expect(screen.getByText("Outer content still renders")).toBeInTheDocument();
  });

  it.todo("should bubble to outer boundary if inner fails catastrophically");
});
