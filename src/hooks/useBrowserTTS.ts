/**
 * Browser Speech Synthesis Hook
 * Uses native Web Speech API for real human-like voices
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface BrowserTTSOptions {
  voice?: string; // Voice name or language code
  rate?: number; // Speed: 0.1 to 10 (default 1)
  pitch?: number; // Pitch: 0 to 2 (default 1)
  volume?: number; // Volume: 0 to 1 (default 1)
}

export function useBrowserTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      console.log('🎤 Available TTS voices:', voices.length);
    };

    loadVoices();
    
    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speak = useCallback(async (
    text: string,
    options: BrowserTTSOptions = {}
  ) => {
    if (!text) {
      console.warn('⚠️ No text to speak');
      return;
    }

    if (!window.speechSynthesis) {
      const errorMsg = 'Speech synthesis not supported in this browser';
      console.error('❌', errorMsg);
      setError(errorMsg);
      return;
    }

    try {
      console.log('🗣️ Browser TTS Request:', text.substring(0, 50) + '...');
      setError(null);
      
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Configure voice
      const voices = window.speechSynthesis.getVoices();
      
      // Try to find an English voice, prefer Google or Microsoft voices
      let selectedVoice: SpeechSynthesisVoice | null = null;
      
      if (options.voice) {
        // Find specific voice by name or language
        selectedVoice = voices.find(v => 
          v.name.toLowerCase().includes(options.voice!.toLowerCase()) ||
          v.lang.toLowerCase().includes(options.voice!.toLowerCase())
        ) || null;
      }
      
      // Fallback: Find best English voice
      if (!selectedVoice) {
        // Prefer en-IN (Indian English) voices
        selectedVoice = voices.find(v => v.lang.includes('en-IN')) ||
                       voices.find(v => v.lang.includes('en-GB')) ||
                       voices.find(v => v.lang.includes('en-US')) ||
                       voices.find(v => v.lang.includes('en')) ||
                       voices[0];
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log('🎙️ Using voice:', selectedVoice.name, selectedVoice.lang);
      }

      // Configure speech parameters
      utterance.rate = options.rate || 0.95; // Slightly slower for clarity
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;
      utterance.lang = 'en-US'; // English

      // Event handlers
      utterance.onstart = () => {
        console.log('🔊 TTS started playing!');
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        console.log('🔇 TTS ended');
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      utterance.onerror = (event) => {
        console.error('❌ TTS error:', event.error);
        setError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      // Speak
      window.speechSynthesis.speak(utterance);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Browser TTS error:', errorMessage);
      setError(errorMessage);
      setIsSpeaking(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    utteranceRef.current = null;
    console.log('⏹️ TTS stopped');
  }, []);

  const pause = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    console.log('⏸️ TTS paused');
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    console.log('▶️ TTS resumed');
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    error,
    availableVoices,
  };
}
