import { useState, useCallback, useRef, useEffect } from 'react';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

interface UseSpeechRecognitionOptions {
  lang?: string;
  onFinalTranscript?: (text: string) => void;
  onSpeechDetected?: () => void;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang = 'fr-FR', onFinalTranscript, onSpeechDetected } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const callbacksRef = useRef({ onFinalTranscript, onSpeechDetected });
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    callbacksRef.current = { onFinalTranscript, onSpeechDetected };
  }, [onFinalTranscript, onSpeechDetected]);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const createRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    return recognition;
  }, [isSupported, lang]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('La reconnaissance vocale n\'est pas supportée par ce navigateur');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    setError(null);
    setInterimTranscript('');
    shouldRestartRef.current = true;

    const recognition = createRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onspeechstart = () => {
      callbacksRef.current.onSpeechDetected?.();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setInterimTranscript('');
        callbacksRef.current.onFinalTranscript?.(final.trim());
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'aborted') return;

      if (event.error === 'not-allowed') {
        setError('Accès au microphone refusé. Vérifiez les permissions.');
        shouldRestartRef.current = false;
      } else {
        setError(`Erreur: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (shouldRestartRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current) {
            const newRecognition = createRecognition();
            if (newRecognition) {
              recognitionRef.current = newRecognition;
              newRecognition.onstart = recognition.onstart;
              newRecognition.onspeechstart = recognition.onspeechstart;
              newRecognition.onresult = recognition.onresult;
              newRecognition.onerror = recognition.onerror;
              newRecognition.onend = recognition.onend;
              try {
                newRecognition.start();
              } catch {
                setIsListening(false);
              }
            }
          } else {
            setIsListening(false);
          }
        }, 100);
      } else {
        setIsListening(false);
      }
    };

    try {
      recognition.start();
    } catch {
      setError('Impossible de démarrer la reconnaissance vocale');
    }
  }, [isSupported, createRecognition]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
  };
}
