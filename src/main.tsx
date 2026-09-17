// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./index.css";

// Refined DEV-only console and global error filtering
// - Keeps real app/network errors visible
// - Suppresses wallet/extension "inpage.js" noise (e.g., chrome.runtime.sendMessage)
if (import.meta.env.DEV) {
  interface ErrorLike {
    message?: unknown;
    stack?: unknown;
  }
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

  const isErrorLike = (v: unknown): v is ErrorLike =>
    isObject(v) && ("message" in v || "stack" in v);

  const stringify = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (isErrorLike(v)) {
      const msg = typeof v.message === "string" ? v.message : "";
      const stack = typeof v.stack === "string" ? v.stack : "";
      return `${msg}\n${stack}`;
    }
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  const isExtensionNoise = (...args: readonly unknown[]): boolean => {
    const blob = args.map(stringify).join("\n");
    // Heuristics for common wallet/extension injections
    return (
      blob.includes("inpage.js") ||
      blob.includes("chrome.runtime.sendMessage") ||
      blob.toLowerCase().includes("coinbase") ||
      blob.toLowerCase().includes("metamask") ||
      blob.toLowerCase().includes("wallet")
    );
  };

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  // Warnings: hide extension noise, keep everything else
  console.warn = ((...args: Parameters<typeof console.warn>): void => {
    if (!isExtensionNoise(...args)) originalWarn(...args);
  }) as typeof console.warn;

  // Errors: always show real network/app errors; hide extension plumbing noise
  console.error = ((...args: Parameters<typeof console.error>): void => {
    const firstArg: unknown = args[0];
    const isRealNetworkError =
      (typeof firstArg === "string" && firstArg.includes("Failed to fetch")) ||
      stringify(firstArg).includes("Failed to fetch");

    if (isRealNetworkError || !isExtensionNoise(...args)) {
      originalError(...args);
    }
  }) as typeof console.error;

  // Prevent noisy global errors from extensions from bubbling
  window.addEventListener(
    "error",
    (ev: ErrorEvent): void => {
      const payload: unknown = ev.error ?? ev.message;
      if (isExtensionNoise(payload)) ev.preventDefault();
    },
    true
  );

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent): void => {
    const payload: unknown = ev.reason;
    if (isExtensionNoise(payload)) ev.preventDefault();
  });
}

// App owns the router (no RouterProvider here)
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
