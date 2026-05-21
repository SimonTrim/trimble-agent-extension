/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_ENVIRONMENT?: "development" | "stage" | "prod";
  readonly VITE_DEFAULT_AGENT_ID?: string;
  readonly VITE_TID_CLIENT_ID?: string;
  readonly VITE_TID_SCOPES?: string;
  readonly VITE_GOOGLE_TTS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
