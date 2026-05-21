import {
  CHAT_UI_URLS,
  type Environment,
} from "@trimble-agentic-external-npm-local/agentic-platform-sdk-iframe-typescript";

export const TRIMBLE_CONNECT_ORIGIN = "https://web.connect.trimble.com";
export const TC_PROXY_URL = "https://trimble-agent-extension.vercel.app/api/tc";
export const AGENT_UI_LOCALE = "fr-FR" as const;
export const AGENT_ON_BEFORE_RUN_TIMEOUT_MS = 60000;

const DEFAULT_AGENT_ENVIRONMENT: Environment = import.meta.env.PROD ? "prod" : "stage";
const SUPPORTED_AGENT_ENVIRONMENTS = new Set<Environment>([
  "development",
  "stage",
  "prod",
]);

const resolveAgentEnvironment = (value: unknown): Environment => {
  if (typeof value === "string" && SUPPORTED_AGENT_ENVIRONMENTS.has(value as Environment)) {
    return value as Environment;
  }

  return DEFAULT_AGENT_ENVIRONMENT;
};

export const AGENT_ENVIRONMENT = resolveAgentEnvironment(
  import.meta.env.VITE_AGENT_ENVIRONMENT
);

export const AGENT_IFRAME_URL = CHAT_UI_URLS[AGENT_ENVIRONMENT];
export const AGENT_IFRAME_ORIGIN = new URL(AGENT_IFRAME_URL).origin;
export const DEFAULT_AGENT_ID =
  import.meta.env.VITE_DEFAULT_AGENT_ID || "YOUR_AGENT_ID";

export const postTrimbleConnectToken = (
  iframe: HTMLIFrameElement | null,
  accessToken: string
) => {
  iframe?.contentWindow?.postMessage(
    { type: "token", accessToken },
    TRIMBLE_CONNECT_ORIGIN
  );
  iframe?.contentWindow?.postMessage(
    { accessToken },
    TRIMBLE_CONNECT_ORIGIN
  );
};
