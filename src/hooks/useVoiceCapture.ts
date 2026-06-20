import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceCaptureProps {
  onChunk: (chunk: ArrayBuffer) => void;
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

  // Accumulate chunks and track submission intent
  const chunksRef = useRef<Blob[]>([]);
  const shouldSubmitRef = useRef<boolean>(false);

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
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
    recordingRef.current = false;
    setHasDetectedSpeech(false);
    setIsRecording(false);
    console.log('🧹 VAD Audio full cleanup performed');
  }, []);

  const cleanupAudio = useCallback(() => {
    // Stop recording if active - this will trigger the onstop event asynchronously
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        console.log('⏹️ Stopping MediaRecorder...');
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
        performFullCleanup();
      }
    } else {
      performFullCleanup();
    }
  }, [performFullCleanup]);

  // VAD silence trigger or manual click to stop and submit
  const stopAndSubmit = useCallback(() => {
    console.log('💾 stopAndSubmit requested: saving and processing recorded audio...');
    shouldSubmitRef.current = true;
    cleanupAudio();
  }, [cleanupAudio]);

  const start = useCallback(async () => {
    // Reset flags
    shouldSubmitRef.current = false;
    chunksRef.current = [];
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
          chunksRef.current.push(event.data);
          console.log(`📦 Chunk collected locally: ${event.data.size} bytes. Total chunks: ${chunksRef.current.length}`);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('⏹️ MediaRecorder stopped event fired. shouldSubmit:', shouldSubmitRef.current);
        if (shouldSubmitRef.current) {
          if (chunksRef.current.length > 0) {
            const audioBlob = new Blob(chunksRef.current, { type: mimeType });
            console.log(`📤 Converting final audio Blob of size ${audioBlob.size} bytes...`);
            try {
              const arrayBuffer = await audioBlob.arrayBuffer();
              console.log('📤 Submitting array buffer via onChunk...');
              onChunk(arrayBuffer);
            } catch (err) {
              console.error('Failed to convert chunks to ArrayBuffer:', err);
            }
          } else {
            console.warn('⚠️ No audio chunks recorded during session.');
          }
          console.log('🔔 Calling onEnd to notify session processor...');
          onEnd();
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
                stopAndSubmit();
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
      performFullCleanup();
      if (onError) {
        onError(err);
      }
    }
  }, [cleanupAudio, onChunk, onError, silenceMs, stopAndSubmit, performFullCleanup]);

  const stop = useCallback((shouldSubmit = false) => {
    if (shouldSubmit) {
      stopAndSubmit();
    } else {
      shouldSubmitRef.current = false;
      cleanupAudio();
    }
  }, [cleanupAudio, stopAndSubmit]);

  // Make sure we clean up audio on unmount
  useEffect(() => {
    return () => {
      shouldSubmitRef.current = false;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { start, stop, isRecording, hasDetectedSpeech };
}
