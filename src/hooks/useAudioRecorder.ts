/**
 * useAudioRecorder
 *
 * Records audio with the MediaRecorder API, then uploads the audio blob
 * to the backend's /api/interview/transcribe endpoint (Groq Whisper) via
 * a standard HTTP POST with FormData.
 *
 * Why not Web Speech API?
 *  - Requires network access to Google's speech servers (blocked in some networks)
 *  - Cannot control the language reliably across locales
 *
 * Why not Socket.IO binary?
 *  - Socket.IO's default JSON serializer silently drops Uint8Array/ArrayBuffer.
 *  - HTTP POST with FormData handles binary audio correctly.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface UseAudioRecorderReturn {
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string>;
  cancelRecording: () => void;
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /** Fully release the microphone stream. */
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Open microphone and start collecting audio chunks. */
  const startRecording = useCallback(async () => {
    // Clean up any previous session
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    releaseMic();
    chunksRef.current = [];
    setError(null);

    try {
      console.log('🎙️ Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log(`📦 Audio chunk: ${e.data.size} bytes (total chunks: ${chunksRef.current.length})`);
        }
      };

      recorder.onerror = (e: any) => {
        console.error('MediaRecorder error:', e.error || e);
        setError('Recording error — please try again.');
        setIsRecording(false);
        releaseMic();
      };

      // Collect data every 500ms
      recorder.start(500);
      setIsRecording(true);
      console.log('✅ Recording started with mimeType:', mimeType);
    } catch (err: any) {
      console.error('Failed to access microphone:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please click the lock icon in your browser address bar and allow microphone access.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else {
        setError(`Microphone error: ${err.message}`);
      }
      setIsRecording(false);
    }
  }, [releaseMic]);

  /**
   * Stop recording, upload audio to Groq Whisper via HTTP POST, and return transcript.
   * Returns empty string if nothing was recorded or transcription fails.
   */
  const stopAndTranscribe = useCallback((): Promise<string> => {
    return new Promise<string>((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === 'inactive') {
        console.warn('⚠️ stopAndTranscribe called but recorder is inactive or null.');
        setIsRecording(false);
        resolve('');
        return;
      }

      const mimeType = recorder.mimeType || 'audio/webm';

      recorder.onstop = async () => {
        releaseMic();
        mediaRecorderRef.current = null;
        setIsRecording(false);

        const chunks = chunksRef.current.splice(0); // take all chunks and clear
        console.log(`⏹️ Recording stopped. Collected ${chunks.length} chunks.`);

        if (chunks.length === 0) {
          console.warn('⚠️ No audio data collected.');
          resolve('');
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        console.log(`📤 Uploading audio blob: ${audioBlob.size} bytes (${mimeType})`);

        if (audioBlob.size < 1000) {
          console.warn('⚠️ Audio too small — likely silence or sub-second recording.');
          resolve('');
          return;
        }

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch(`${API_BASE_URL}/api/interview/transcribe`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Server error ${response.status}`);
          }

          const data = await response.json();
          const transcript = (data.transcript || '').trim();
          console.log('✅ Transcript from Groq Whisper:', transcript);
          resolve(transcript);
        } catch (err: any) {
          console.error('❌ Transcription failed:', err.message);
          setError(`Transcription failed: ${err.message}`);
          resolve('');
        } finally {
          setIsTranscribing(false);
        }
      };

      console.log('⏹️ Stopping MediaRecorder...');
      try {
        recorder.stop();
      } catch (err) {
        console.warn('Error stopping recorder:', err);
        releaseMic();
        mediaRecorderRef.current = null;
        setIsRecording(false);
        resolve('');
      }
    });
  }, [releaseMic]);

  /** Cancel recording without transcribing. */
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.ondataavailable = null;
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    releaseMic();
    setIsRecording(false);
    setIsTranscribing(false);
  }, [releaseMic]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (_) {}
      }
      releaseMic();
    };
  }, [releaseMic]);

  return { startRecording, stopAndTranscribe, cancelRecording, isRecording, isTranscribing, error };
}
