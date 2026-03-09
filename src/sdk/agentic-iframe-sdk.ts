// Mock implementation of the Agentic Platform Iframe SDK
export const CHAT_UI_URLS = {
  development: 'http://localhost:3000',
  stage: 'https://assist.stage.trimble-ai.com/agent/94c9271b-99ea-4a38-97f7-8ad14c40de52',
  prod: 'https://assist.ai.trimble.com',
};

export const ContentVariants = {
  Chat: 0,
  AgentCards: 1,
} as const;

export type ContentVariants = typeof ContentVariants[keyof typeof ContentVariants];

export const ChatUiVariants = {
  Full: 'full',
  Compact: 'compact',
} as const;

export type ChatUiVariants = typeof ChatUiVariants[keyof typeof ChatUiVariants];

export interface ChatInputButton {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface ChatUiConfiguration {
  environment: 'development' | 'stage' | 'prod';
  onBeforeRunTimeout?: number;
  uiConfig: {
    theme: 'dark' | 'light';
    contentVariant: ContentVariants;
    variant: ChatUiVariants;
    chatInput: {
      buttons: ChatInputButton[];
      hideModelSelection: boolean;
    };
    showSignIn?: boolean;
  };
  localization: {
    translations?: any;
    selectedLanguage?: string;
  };
  agentId: string;
  threadId?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface OnBeforeRunConfig {
  tools: {
    runTime: Record<string, {
      definition: Tool;
      callback: (args: unknown) => Promise<string | void>;
      timeOutInMs?: number;
    }>;
    global: Record<string, {
      callback: (args: unknown) => Promise<string | void>;
      timeOutInMs?: number;
    }>;
  };
  runContext?: {
    context: Array<{ description: string; value: string }>;
  };
}

export function listenToChatUi(
  iframe: HTMLIFrameElement,
  targetOrigin: string,
  provideChatUiConfig: () => ChatUiConfiguration,
  provideChatUiToken: () => Promise<string>,
  onBeforeRun?: OnBeforeRunConfig
): () => void {
  
  const handleMessage = async (event: MessageEvent) => {
    // Only accept messages from our iframe
    if (event.source !== iframe.contentWindow) return;
    
    try {
      const data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'config':
          iframe.contentWindow?.postMessage({
            type: 'config',
            payload: provideChatUiConfig()
          }, targetOrigin);
          break;

        case 'token':
          const token = await provideChatUiToken();
          iframe.contentWindow?.postMessage({
            type: 'token',
            payload: token
          }, targetOrigin);
          break;

        case 'onBeforeRun':
          iframe.contentWindow?.postMessage({
            type: 'onBeforeRunResponse',
            payload: {
              tools: onBeforeRun?.tools,
              runContext: onBeforeRun?.runContext
            }
          }, targetOrigin);
          break;

        case 'toolCallback':
          // Execute tool callback
          const { toolCallId, name, args } = data.payload;
          let result = '';
          
          if (onBeforeRun?.tools.runTime[name]) {
            const res = await onBeforeRun.tools.runTime[name].callback(args);
            if (res) result = res;
          } else if (onBeforeRun?.tools.global[name]) {
            const res = await onBeforeRun.tools.global[name].callback(args);
            if (res) result = res;
          }
          
          iframe.contentWindow?.postMessage({
            type: 'toolCallbackResponse',
            payload: { toolCallId, result }
          }, targetOrigin);
          break;
      }
    } catch (err) {
      console.error('Error handling iframe message:', err);
    }
  };

  window.addEventListener('message', handleMessage);
  
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}
