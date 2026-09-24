/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Solo en desarrollo (`pnpm dev`): si vale "true", el guard del router trata la sesión
   * como autenticada con un usuario ficticio y no llama a `/api/me`. Se elimina del build.
   */
  readonly VITE_DEV_BYPASS_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
