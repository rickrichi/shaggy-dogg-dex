/// <reference types="vite/client" />

// Extend the ImportMetaEnv interface with your variables
interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  // add other VITE_* vars here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
