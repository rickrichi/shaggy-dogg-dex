// File: src/types/nextjs-fetch.d.ts
// Description: TypeScript declarations for Next.js fetch API extensions
// ==================================================================================

// Extend the global RequestInit interface to include Next.js caching options
declare global {
  interface RequestInit {
    next?: {
      revalidate?: number | false;
      tags?: string[];
    };
  }
}

// This file needs to be empty export to be treated as a module
export {};