import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceCaptureProps {
  onEnd: (audioData: Uint8Array | null) => void;
  onError?: (err: Error) => void;
  silenceMs?: number;
}

export function useVoiceCapture({ onEnd, onError, silenceMs = 1500 }: UseVoiceCaptureProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState<boolean>(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
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

  // Accumulate chunks and track submission intent
  const chunksRef = useRef<Blob[]>([]);
  const shouldSubmitRef = useRef<boolean>(false);
  const hasSubmittedRef = useRef<boolean>(false);

  const performFullCleanup = useCallback(() => {
    // Stop microphone tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('🔇 Audio track stopped');
      });
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
    setAnalyser(null);
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
    recordingRef.current = false;
    setHasDetectedSpeech(false);
    setIsRecording(false);
    console.log('🧹 VAD Audio full cleanup performed');
  }, []);

  const cleanupAudio = useCallback((isGraceful = false) => {
    const hasMediaRecorder = !!mediaRecorderRef.current;
    const isRecorderActive = hasMediaRecorder && mediaRecorderRef.current!.state !== 'inactive';

    if (!isGraceful) {
      // Hard stop: clear event handlers so they don't fire asynchronously
      if (hasMediaRecorder) {
        mediaRecorderRef.current!.onstop = null;
        mediaRecorderRef.current!.ondataavailable = null;
        mediaRecorderRef.current!.onerror = null;
        
        if (isRecorderActive) {
          try {
            console.log('⏹️ Hard stopping MediaRecorder...');
            mediaRecorderRef.current!.stop();
          } catch (err) {
            console.warn('Error hard stopping MediaRecorder:', err);
          }
        }
      }
      performFullCleanup();
    } else {
      // Graceful stop to submit
      if (isRecorderActive) {
        try {
          console.log('⏹️ Graceful stopping MediaRecorder...');
          mediaRecorderRef.current!.stop();
        } catch (err) {
          console.warn('Error graceful stopping MediaRecorder:', err);
          if (shouldSubmitRef.current && !hasSubmittedRef.current) {
            hasSubmittedRef.current = true;
            onEnd();
          }
          performFullCleanup();
        }
      } else {
        console.warn('⚠️ MediaRecorder is inactive or null during graceful cleanup. shouldSubmit:', shouldSubmitRef.current, 'hasSubmitted:', hasSubmittedRef.current);
        if (shouldSubmitRef.current && !hasSubmittedRef.current) {
          hasSubmittedRef.current = true;
          onEnd();
        }
        performFullCleanup();
      }
    }
  }, [performFullCleanup, onEnd]);

  // VAD silence trigger or manual click to stop and submit
  const stopAndSubmit = useCallback(() => {
    if (shouldSubmitRef.current) return;
    console.log('💾 stopAndSubmit requested: saving and processing recorded audio...');
    shouldSubmitRef.current = true;
    cleanupAudio(true); // Graceful stop to allow onstop event to process chunks
  }, [cleanupAudio]);

  const start = useCallback(async () => {
    // Reset flags
    shouldSubmitRef.current = false;
    hasSubmittedRef.current = false;
    chunksRef.current = [];
    cleanupAudio(false); // Hard stop to reset any previous state synchronously
    
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
      setAnalyser(analyser);

      // MediaRecorder configuration
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log(`📦 Chunk collected locally: ${event.data.size} bytes. Total chunks: ${chunksRef.current.length}`);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('⏹️ MediaRecorder stopped event fired. shouldSubmit:', shouldSubmitRef.current, 'hasSubmitted:', hasSubmittedRef.current);
        if (shouldSubmitRef.current && !hasSubmittedRef.current) {
          hasSubmittedRef.current = true;
          let audioData: Uint8Array | null = null;
          if (chunksRef.current.length > 0) {
            const audioBlob = new Blob(chunksRef.current, { type: mimeType });
            console.log(`📤 Converting final audio Blob of size ${audioBlob.size} bytes...`);
            try {
              const arrayBuffer = await audioBlob.arrayBuffer();
              audioData = new Uint8Array(arrayBuffer);
              console.log('📤 Audio data prepared. Size:', audioData.length);
            } catch (err) {
              console.error('Failed to convert chunks to ArrayBuffer:', err);
            }
          } else {
            console.warn('⚠️ No audio chunks recorded during session.');
          }
          console.log('🔔 Calling onEnd with audio data to notify session processor...');
          onEnd(audioData);
        }
        
        // Always run full cleanup after stop event finishes
        performFullCleanup();
      };

      // Start recording with 250ms interval to collect data chunks regularly
      mediaRecorder.start(250);
      recordingRef.current = true;
      setIsRecording(true);
      setHasDetectedSpeech(false);
      
      hasSpokenRef.current = false;
      silenceStartRef.current = null;

      // Volume analysis loop
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      const SILENCE_THRESHOLD = 0.010; // Adjusted slightly for better sensitivity
      const startTime = Date.now();
      const STARTUP_DELAY_MS = 600; // Ignore first 600ms of audio level for VAD checks to bypass mic click/pop noise

      const checkVolume = () => {
        if (!analyserRef.current || !recordingRef.current) return;
        
        // Skip VAD checks during startup to ignore mic connection pop
        if (Date.now() - startTime < STARTUP_DELAY_MS) {
          animationFrameIdRef.current = requestAnimationFrame(checkVolume);
          return;
        }

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
                console.log('🔇 Silence duration met VAD threshold. Resetting speech detection (auto-submit disabled).');
                hasSpokenRef.current = false;
                setHasDetectedSpeech(false);
                silenceStartRef.current = null;
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
      performFullCleanup();
      if (onError) {
        onError(err);
      }
    }
  }, [cleanupAudio, onEnd, onError, silenceMs, stopAndSubmit, performFullCleanup]);

  const stop = useCallback((shouldSubmit = false) => {
    if (shouldSubmit) {
      stopAndSubmit();
    } else {
      shouldSubmitRef.current = false;
      cleanupAudio(false); // Hard stop
    }
  }, [cleanupAudio, stopAndSubmit]);

  const getAnalyser = useCallback(() => {
    return analyserRef.current;
  }, []);

  // Make sure we clean up audio on unmount
  useEffect(() => {
    return () => {
      shouldSubmitRef.current = false;
      cleanupAudio(false); // Hard stop
    };
  }, [cleanupAudio]);

  return { start, stop, isRecording, hasDetectedSpeech, getAnalyser, analyser };
}
