import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceCaptureProps {
  onChunk: (chunk: Blob) => void;
  onEnd: () => void;
  onError?: (err: Error) => void;
  silenceMs?: number;
}

export function useVoiceCapture({ onChunk, onEnd, onError, silenceMs = 1500 }: UseVoiceCaptureProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState<boolean>(false);
  const recordingRef = useRef<boolean>(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  
  // Track speech states
  const hasSpokenRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | null>(null);

  const cleanupAudio = useCallback(() => {
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        // ignore state conflicts on quick stop
      }
    }
    
    // Stop microphone tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Cancel visualizer animations
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    // Clear timers
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }

    mediaRecorderRef.current = null;
    analyserRef.current = null;
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
    recordingRef.current = false;
    setHasDetectedSpeech(false);
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    cleanupAudio();
    try {
      console.log('🎙️ Starting voice VAD capture...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Web Audio API setup
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          console.log('🎙️ Suspended AudioContext successfully resumed');
        } catch (resumeErr) {
          console.warn('Failed to resume suspended AudioContext:', resumeErr);
        }
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // MediaRecorder configuration
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onChunk(event.data);
        }
      };

      mediaRecorder.start(250); // Emit audio chunks every 250ms
      recordingRef.current = true;
      setIsRecording(true);
      setHasDetectedSpeech(false);
      
      hasSpokenRef.current = false;
      silenceStartRef.current = null;

      // Volume analysis loop
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      const SILENCE_THRESHOLD = 0.012; // Adjusted threshold for voice activity

      const checkVolume = () => {
        if (!analyserRef.current || !recordingRef.current) return;
        
        analyserRef.current.getFloatTimeDomainData(dataArray);
        
        // Calculate Root Mean Square (RMS) volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);

        if (rms > SILENCE_THRESHOLD) {
          if (!hasSpokenRef.current) {
            console.log('🗣️ User started speaking...');
            hasSpokenRef.current = true;
            setHasDetectedSpeech(true);
          }
          silenceStartRef.current = null; // Reset silence tracker
        } else {
          // Candidate is quiet
          if (hasSpokenRef.current) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else {
              const elapsedSilence = Date.now() - silenceStartRef.current;
              if (elapsedSilence >= silenceMs) {
                console.log('🔇 Silence duration met VAD threshold. Ending speech...');
                cleanupAudio();
                onEnd();
                return;
              }
            }
          }
        }

        animationFrameIdRef.current = requestAnimationFrame(checkVolume);
      };

      // Start the analysis loop
      animationFrameIdRef.current = requestAnimationFrame(checkVolume);

    } catch (err: any) {
      console.error('Failed to initialize microphone VAD capture:', err);
      cleanupAudio();
      if (onError) {
        onError(err);
      }
    }
  }, [cleanupAudio, onChunk, onEnd, onError, silenceMs]);

  const stop = useCallback((shouldSubmit = false) => {
    cleanupAudio();
    if (shouldSubmit) {
      onEnd();
    }
  }, [cleanupAudio, onEnd]);

  // Make sure we clean up audio on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { start, stop, isRecording, hasDetectedSpeech };
}
