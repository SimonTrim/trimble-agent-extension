const AGENT_SERVICE_URL = 'https://agents.ai.trimble.com';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RunRequest {
  messages: { role: string; content: string }[];
  threadId?: string;
  context?: { description: string; value: string }[];
}

function buildRunMessages(messages: AgentMessage[], threadId?: string): RunRequest['messages'] {
  const userMessages = messages
    .filter((message) => message.role === 'user' && message.content.trim())
    .map((message) => ({ role: message.role, content: message.content }));

  if (!threadId) return userMessages;

  const latestUserMessage = userMessages.at(-1);
  return latestUserMessage ? [latestUserMessage] : [];
}

/**
 * Calls the Trimble Agent Service API with streaming AG-UI protocol.
 * Parses SSE events and accumulates the assistant's text response.
 * Supports abort via signal — returns partial text on abort instead of throwing.
 */
export async function streamAgentRun(
  agentId: string,
  messages: AgentMessage[],
  token: string,
  options: {
    threadId?: string;
    context?: { description: string; value: string }[];
    onTextDelta?: (delta: string) => void;
    onThreadId?: (threadId: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<string> {
  const body: RunRequest = {
    messages: buildRunMessages(messages, options.threadId),
  };
  if (options.threadId) body.threadId = options.threadId;
  if (options.context && options.context.length > 0) body.context = options.context;

  let fullText = '';

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}/v1/agents/${agentId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      const errMsg = `Agent API error ${response.status}: ${errText}`;
      options.onError?.(errMsg);
      throw new Error(errMsg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body stream');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let eventType = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            const type = data.type ?? eventType;

            switch (type) {
              case 'RUN_STARTED':
                if (data.threadId) options.onThreadId?.(data.threadId);
                break;
              case 'TEXT_MESSAGE_CONTENT':
                if (data.delta) {
                  fullText += data.delta;
                  options.onTextDelta?.(data.delta);
                }
                break;
              case 'RUN_ERROR':
                options.onError?.(data.message ?? 'Agent run error');
                break;
            }
          } catch {
            // non-JSON data line
          }
        }
      }
    }

    options.onComplete?.(fullText);
    return fullText;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return fullText;
    }
    const msg = err instanceof Error ? err.message : String(err);
    options.onError?.(msg);
    throw err;
  }
}
