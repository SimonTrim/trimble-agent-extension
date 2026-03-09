/// <reference types="vite/client" />

declare global {
  interface Window {
    TrimbleConnectWorkspace: {
      connect: (
        target: Window | HTMLIFrameElement,
        onEvent: (event: string, data: unknown) => void,
        timeout?: number,
      ) => Promise<any>;
    };
  }
}
