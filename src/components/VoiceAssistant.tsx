import { useState, useCallback, useRef, useEffect } from 'react';
import { useSpeechRecognition, type VoiceState } from '../hooks/useSpeechRecognition';
import { speak, cleanTextForTTS, StreamingTTSPlayer, FRENCH_VOICES, DEFAULT_VOICE, type VoiceOption } from '../services/ttsService';
import { streamAgentRun, type AgentMessage } from '../services/agentService';

function renderMarkdown(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
        const m = part.match(/^\*\*(.+)\*\*$/);
        return m ? <strong key={j}>{m[1]}</strong> : part;
      })}
    </span>
  ));
}

interface VoiceAssistantProps {
  agentId: string;
  getAccessToken: () => Promise<string>;
  isVisible: boolean;
  onClose: () => void;
}

export default function VoiceAssistant({
  agentId,
  getAccessToken,
  isVisible,
  onClose,
}: VoiceAssistantProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(DEFAULT_VOICE);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [conversationActive, setConversationActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<AgentMessage[]>([]);
  const unmountRef = useRef(false);
  const isProcessingRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>('idle');
  const pendingTranscriptRef = useRef<string | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const ttsPlayerRef = useRef<StreamingTTSPlayer | null>(null);
  const agentTextRef = useRef('');

  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  // ── Barge-in via interim transcript (with echo filtering) ─────────
  const bargeInTriggeredRef = useRef(false);
  const handleBargeInFromInterim = useCallback((interim: string) => {
    if (!interim || interim.length < 6) return;
    if (voiceStateRef.current !== 'speaking') return;
    if (bargeInTriggeredRef.current) return;

    const userLower = interim.toLowerCase().trim();
    const agentRaw = agentTextRef.current.toLowerCase();
    const agentCleaned = cleanTextForTTS(agentTextRef.current).toLowerCase();
    if (agentRaw.includes(userLower) || agentCleaned.includes(userLower)) return;

    console.log('[Voice] Barge-in via interim speech:', interim);
    bargeInTriggeredRef.current = true;
    ttsPlayerRef.current?.stop();
    streamAbortRef.current?.abort();
    setVoiceState('listening');
  }, []);

  // ── Process user message with streaming TTS ───────────────────────
  const processUserMessage = useCallback(
    async (text: string) => {
      streamAbortRef.current?.abort();
      ttsPlayerRef.current?.stop();

      const userMessage: AgentMessage = { role: 'user', content: text };
      messagesRef.current = [...messagesRef.current, userMessage];
      setMessages([...messagesRef.current]);
      setVoiceState('processing');
      setStreamingText('');
      setErrorMsg(null);
      agentTextRef.current = '';
      bargeInTriggeredRef.current = false;

      const streamAbort = new AbortController();
      streamAbortRef.current = streamAbort;

      const player = new StreamingTTSPlayer({
        voiceName: selectedVoice.voiceName,
        onStart: () => {
          if (!streamAbort.signal.aborted && !unmountRef.current) {
            setVoiceState('speaking');
          }
        },
        onEnd: () => {
          if (!streamAbort.signal.aborted && !unmountRef.current) {
            setVoiceState('listening');
          }
        },
      });
      ttsPlayerRef.current = player;

      try {
        const token = await getAccessToken();
        if (streamAbort.signal.aborted) return;

        const allMessages = [...messagesRef.current];

        const fullText = await streamAgentRun(agentId, allMessages, token, {
          threadId,
          signal: streamAbort.signal,
          onThreadId: (id) => setThreadId(id),
          onTextDelta: (delta) => {
            if (streamAbort.signal.aborted) return;
            setStreamingText((prev) => prev + delta);
            agentTextRef.current += delta;
            player.addText(delta);
          },
          onError: (err) => {
            player.stop();
            setErrorMsg(err);
            setVoiceState('error');
          },
        });

        if (streamAbort.signal.aborted) {
          if (agentTextRef.current.trim()) {
            const partial: AgentMessage = { role: 'assistant', content: agentTextRef.current };
            messagesRef.current = [...messagesRef.current, partial];
            setMessages([...messagesRef.current]);
            setStreamingText('');
          }
          return;
        }

        player.finish();

        const assistantMessage: AgentMessage = { role: 'assistant', content: fullText };
        messagesRef.current = [...messagesRef.current, assistantMessage];
        setMessages([...messagesRef.current]);
        setStreamingText('');
      } catch (err) {
        if (streamAbort.signal.aborted) {
          if (agentTextRef.current.trim()) {
            const partial: AgentMessage = { role: 'assistant', content: agentTextRef.current };
            messagesRef.current = [...messagesRef.current, partial];
            setMessages([...messagesRef.current]);
            setStreamingText('');
          }
          return;
        }
        if (!unmountRef.current) {
          setVoiceState('error');
        }
      }
    },
    [agentId, getAccessToken, threadId, selectedVoice]
  );

  // ── Handle final transcript (user finished a phrase) ──────────────
  const handleFinalTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      bargeInTriggeredRef.current = false;

      if (voiceStateRef.current === 'speaking' && agentTextRef.current) {
        const userLower = text.toLowerCase().trim();
        const agentRaw = agentTextRef.current.toLowerCase();
        const agentCleaned = cleanTextForTTS(agentTextRef.current).toLowerCase();
        if (agentRaw.includes(userLower) || agentCleaned.includes(userLower)) {
          console.log('[Voice] Filtering echo transcript:', text);
          return;
        }
      }

      if (voiceStateRef.current === 'speaking' || ttsPlayerRef.current?.active) {
        console.log('[Voice] Barge-in via final transcript:', text);
        ttsPlayerRef.current?.stop();
        streamAbortRef.current?.abort();
        setVoiceState('listening');
      }

      if (isProcessingRef.current) {
        console.log('[Voice] Queuing transcript while processing:', text);
        pendingTranscriptRef.current = text;
        return;
      }

      isProcessingRef.current = true;
      processUserMessage(text).finally(() => {
        isProcessingRef.current = false;
        if (pendingTranscriptRef.current) {
          const queued = pendingTranscriptRef.current;
          pendingTranscriptRef.current = null;
          isProcessingRef.current = true;
          processUserMessage(queued).finally(() => {
            isProcessingRef.current = false;
          });
        }
      });
    },
    [processUserMessage]
  );

  const {
    isListening,
    interimTranscript,
    error: sttError,
    isSupported,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    lang: 'fr-FR',
    onFinalTranscript: handleFinalTranscript,
  });

  // Watch interim transcript for barge-in
  useEffect(() => {
    handleBargeInFromInterim(interimTranscript);
  }, [interimTranscript, handleBargeInFromInterim]);

  useEffect(() => {
    if (isListening && voiceState !== 'processing' && voiceState !== 'speaking') {
      setVoiceState('listening');
    }
  }, [isListening, voiceState]);

  useEffect(() => { if (sttError) setErrorMsg(sttError); }, [sttError]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    unmountRef.current = false;
    return () => {
      unmountRef.current = true;
      ttsPlayerRef.current?.stop();
      streamAbortRef.current?.abort();
      stopListening();
    };
  }, [stopListening]);

  const toggleConversation = useCallback(() => {
    if (conversationActive) {
      setConversationActive(false);
      ttsPlayerRef.current?.stop();
      streamAbortRef.current?.abort();
      stopListening();
      setVoiceState('idle');
    } else {
      setConversationActive(true);
      setErrorMsg(null);
      startListening();
    }
  }, [conversationActive, startListening, stopListening]);

  const handleNewConversation = useCallback(() => {
    ttsPlayerRef.current?.stop();
    streamAbortRef.current?.abort();
    stopListening();
    messagesRef.current = [];
    setMessages([]);
    setStreamingText('');
    setThreadId(undefined);
    setVoiceState('idle');
    setConversationActive(false);
    setErrorMsg(null);
    isProcessingRef.current = false;
    pendingTranscriptRef.current = null;
    agentTextRef.current = '';
  }, [stopListening]);

  if (!isVisible) return null;

  const stateConfig: Record<VoiceState, { label: string; color: string }> = {
    idle: { label: 'Démarrer la conversation', color: '#005f9e' },
    listening: { label: 'Je vous écoute...', color: '#dc2626' },
    processing: { label: 'Réflexion...', color: '#f59e0b' },
    speaking: { label: 'Parlez pour m\'interrompre', color: '#16a34a' },
    error: { label: 'Erreur — réessayez', color: '#dc2626' },
  };

  const current = stateConfig[voiceState];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        backgroundColor: '#ffffff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: conversationActive ? '#22c55e' : '#d1d5db',
            animation: conversationActive ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
            {conversationActive ? 'Conversation active' : 'En attente'}
          </span>
          {threadId && (
            <span style={{ fontSize: '10px', color: '#9ca3af', backgroundColor: '#f9fafb', padding: '2px 6px', borderRadius: '4px' }}>thread</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Voice selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowVoiceMenu(!showVoiceMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                backgroundColor: showVoiceMenu ? '#eff6ff' : '#ffffff',
                color: '#4b5563',
                cursor: 'pointer',
                fontWeight: 500,
              }}
              title="Changer la voix"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '14px', height: '14px' }}>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              {selectedVoice.name.split(' ')[0]}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '10px', height: '10px' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showVoiceMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '4px',
                width: '220px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                zIndex: 50,
                padding: '4px 0',
                maxHeight: '260px',
                overflowY: 'auto',
              }}>
                <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Voix françaises
                </div>
                {FRENCH_VOICES.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => { setSelectedVoice(voice); setShowVoiceMenu(false); }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: 'none',
                      backgroundColor: selectedVoice.id === voice.id ? '#eff6ff' : 'transparent',
                      color: selectedVoice.id === voice.id ? '#1d4ed8' : '#374151',
                      fontWeight: selectedVoice.id === voice.id ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '10px' }}>{voice.gender === 'female' ? '♀' : '♂'}</span>
                    <span style={{ flex: 1 }}>{voice.name}</span>
                    {selectedVoice.id === voice.id && <span style={{ color: '#3b82f6' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* New conversation */}
          <button
            onClick={handleNewConversation}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '6px',
              border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
            }}
            title="Nouvelle conversation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2} style={{ width: '14px', height: '14px' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="12" x2="12" y1="8" y2="14" /><line x1="9" x2="15" y1="11" y2="11" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '6px',
              border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
            }}
            title="Retour au chat texte"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Click-away for voice menu */}
      {showVoiceMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowVoiceMenu(false)} />}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', minHeight: 0 }}>
        {messages.length === 0 && !streamingText && !conversationActive && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '14px', textAlign: 'center', gap: '16px', padding: '0 24px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#005f9e" strokeWidth={1.5} style={{ width: '32px', height: '32px' }}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 500, color: '#4b5563', margin: 0 }}>Conversation vocale</p>
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                Appuyez sur le micro et parlez naturellement.<br />
                Vous pouvez interrompre l'agent à tout moment.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
            <div style={{
              maxWidth: '85%',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding: '10px 14px',
              fontSize: '14px',
              lineHeight: '1.5',
              backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
              color: msg.role === 'user' ? '#ffffff' : '#1f2937',
            }}>
              {msg.role === 'assistant' ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{renderMarkdown(msg.content)}</div>
                  <button
                    onClick={() => speak(msg.content, { voiceName: selectedVoice.voiceName })}
                    style={{ flexShrink: 0, marginTop: '2px', padding: '4px', borderRadius: '4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}
                    title="Réécouter"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} style={{ width: '14px', height: '14px' }}>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  </button>
                </div>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{ maxWidth: '85%', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: '14px', lineHeight: '1.5', backgroundColor: '#f3f4f6', color: '#1f2937', whiteSpace: 'pre-wrap' }}>
              <span>{renderMarkdown(streamingText)}</span>
              <span style={{ display: 'inline-block', width: '6px', height: '16px', backgroundColor: '#3b82f6', marginLeft: '2px', animation: 'blink 1s infinite' }} />
            </div>
          </div>
        )}

        {interimTranscript && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <div style={{ maxWidth: '85%', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontSize: '14px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontStyle: 'italic' }}>
              {interimTranscript}...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#dc2626' }}>
          {errorMsg}
        </div>
      )}

      {/* Controls */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid #f3f4f6',
        background: 'linear-gradient(to top, #f9fafb, #ffffff)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      }}>
        {!isSupported ? (
          <div style={{ fontSize: '14px', color: '#dc2626', textAlign: 'center', padding: '0 16px' }}>
            Navigateur non supporté. Utilisez Chrome ou Edge.
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              {voiceState === 'listening' && (
                <div style={{
                  position: 'absolute', inset: '-16px', borderRadius: '50%',
                  backgroundColor: 'rgba(248,113,113,0.15)',
                  animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
                }} />
              )}
              {voiceState === 'speaking' && (
                <div style={{
                  position: 'absolute', inset: '-8px', borderRadius: '50%',
                  backgroundColor: 'rgba(74,222,128,0.2)',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
              )}
              <button
                onClick={toggleConversation}
                disabled={voiceState === 'processing'}
                style={{
                  position: 'relative',
                  width: '64px', height: '64px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: voiceState === 'processing' ? 'not-allowed' : 'pointer',
                  backgroundColor: conversationActive ? current.color : '#005f9e',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                  opacity: voiceState === 'processing' ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
                title={current.label}
              >
                {voiceState === 'processing' ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'white', borderRadius: '50%', animation: 'bounce 1s infinite 0ms' }} />
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'white', borderRadius: '50%', animation: 'bounce 1s infinite 150ms' }} />
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'white', borderRadius: '50%', animation: 'bounce 1s infinite 300ms' }} />
                  </div>
                ) : conversationActive ? (
                  voiceState === 'speaking' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" style={{ width: '28px', height: '28px' }}>
                      <line x1="4" y1="8" x2="4" y2="16" />
                      <line x1="8" y1="5" x2="8" y2="19" />
                      <line x1="12" y1="3" x2="12" y2="21" />
                      <line x1="16" y1="5" x2="16" y2="19" />
                      <line x1="20" y1="8" x2="20" y2="16" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" style={{ width: '28px', height: '28px' }}>
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  )
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: '28px', height: '28px' }}>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>
            </div>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>{current.label}</span>
          </>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
