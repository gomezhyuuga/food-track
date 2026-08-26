/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del Worker que interpreta el texto. Sin ella, el registro por texto queda deshabilitado. */
  readonly VITE_PARSE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
