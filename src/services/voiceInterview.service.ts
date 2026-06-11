/**
 * Voice Interview Client Service
 * Frontend service for real-time AI voice interview communication
 */

import io, { Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL_PRIMARY = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL_FALLBACK = 'http://localhost:3001';

interface InterviewConfig {
  userId: string;
  interviewId: string;
  jobRole: string;
  interviewType: string;
  difficulty: string;
  resumeContext?: string;
  maxQuestions?: number;
}

interface InterviewStats {
  currentScore: number;
  questionsAsked: number;
  sectionScores: {
    technical: number;
    communication: number;
    confidence: number;
    problemSolving: number;
    clarity: number;
  };
}

interface Evaluation {
  score: number;
  feedback: string;
  keyPointsCovered: string[];
  missedPoints: string[];
  fillerWordsCount: number;
}

interface QuestionData {
  question: string;
  audio: string;
  isFollowUp: boolean;
  expectedDuration: number;
  currentProgress?: {
    questionsAsked: number;
    maxQuestions: number;
  };
}

class VoiceInterviewService {
  private socket: Socket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private currentInterviewId: string = '';
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;

  /**
   * Connect to voice interview WebSocket
   */
  async connect(token: string): Promise<void> {
    const tryConnect = (baseUrl: string) => new Promise<void>((resolve, reject) => {
      console.log('🔌 Connecting to WebSocket:', `${baseUrl}/voice-interview`);
      this.socket = io(`${baseUrl}/voice-interview`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      this.socket.on('connect', () => {
        console.log('✅ Voice interview socket connected:', baseUrl);
        resolve();
      });
      this.socket.on('connect_error', (error: any) => {
        console.error('❌ Socket connection error:', error.message || error);
        reject(error);
      });
      this.socket.on('disconnect', (reason: string) => {
        console.log('🔌 Voice interview socket disconnected:', reason);
      });
      this.socket.on('error', (error: any) => {
        console.error('Socket error:', error);
      });
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Connection timeout - server may be offline'));
        }
      }, 10000);
    });
    try {
      await tryConnect(WS_URL_PRIMARY);
    } catch (e1) {
      console.warn('⚠️ Primary WS URL failed, trying fallback:', WS_URL_FALLBACK);
      await tryConnect(WS_URL_FALLBACK);
    }
  }

  /**
   * Initialize a new voice interview
   */
  async initInterview(config: InterviewConfig): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    this.currentInterviewId = config.interviewId;
    
    return new Promise((resolve, reject) => {
      // Set up one-time listeners for initialization response
      const onInitialized = () => {
        console.log('✅ Interview initialized successfully');
        this.socket?.off('interview-error', onError);
        resolve();
      };

      const onError = (error: any) => {
        console.error('❌ Interview initialization error:', error);
        this.socket?.off('interview-initialized', onInitialized);
        reject(new Error(error.message || 'Failed to initialize interview'));
      };

      // Listen for response
      this.socket!.once('interview-initialized', onInitialized);
      this.socket!.once('interview-error', onError);

      // Emit initialization request
      console.log('📤 Sending init-voice-interview event:', config);
      this.socket!.emit('init-voice-interview', config);

      // Timeout after 15 seconds
      setTimeout(() => {
        this.socket?.off('interview-initialized', onInitialized);
        this.socket?.off('interview-error', onError);
        reject(new Error('Interview initialization timeout - no response from server'));
      }, 15000);
    });
  }

  /**
   * Start recording user's answer
   */
  async startRecording(): Promise<void> {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      // Setup audio analyzer for visualization
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      // Setup media recorder
      const options = { mimeType: 'audio/webm' };
      this.mediaRecorder = new MediaRecorder(stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);

          // Send chunk to server via WebSocket
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            this.socket?.emit('audio-chunk', {
              interviewId: this.currentInterviewId,
              chunk: base64,
            });
          };
          reader.readAsDataURL(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording (collect data every 1 second)
      this.mediaRecorder.start(1000);

      // Notify server
      this.socket?.emit('start-recording', {
        interviewId: this.currentInterviewId,
      });

      console.log('🎤 Recording started');

    } catch (error) {
      console.error('Microphone access error:', error);
      throw new Error('Failed to access microphone');
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      
      // Notify server
      this.socket?.emit('stop-recording', {
        interviewId: this.currentInterviewId,
      });

      console.log('🛑 Recording stopped');
    }

    // Cleanup audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }
  }

  /**
   * Get audio level for visualization (0-100)
   */
  getAudioLevel(): number {
    if (!this.analyser) return 0;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    return Math.min(100, (average / 255) * 100);
  }

  /**
   * Play audio from base64 string with retry and better error handling
   */
  async playAudio(base64Audio: string, retries: number = 3): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!base64Audio || base64Audio.trim() === '') {
          console.warn('Empty audio data received');
          resolve(); // Don't block on empty audio
          return;
        }

        const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
        audio.volume = 0.8; // Set volume to 80%
        audio.preload = 'auto';
        
        let hasEnded = false;
        let retryCount = 0;

        audio.onended = () => {
          hasEnded = true;
          console.log('✅ Audio playback completed');
          resolve();
        };
        
        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          reject(new Error('Audio playback failed'));
        };

        audio.onloadeddata = () => {
          console.log('Audio loaded, duration:', audio.duration, 'seconds');
        };
        
        // Attempt to play with retry logic
        const attemptPlay = async () => {
          try {
            await audio.play();
            console.log('🔊 Audio playback started');
          } catch (playError: any) {
            console.warn('Audio play attempt failed:', playError.message);
            
            // Handle autoplay restrictions
            if (playError.name === 'NotAllowedError' || playError.name === 'NotSupportedError') {
              if (retryCount < retries) {
                retryCount++;
                console.log(`Retrying audio playback (${retryCount}/${retries})...`);
                setTimeout(attemptPlay, 500);
              } else {
                // If autoplay fails after retries, emit event for manual play
                console.warn('⚠️ Autoplay blocked. User interaction required.');
                window.dispatchEvent(new CustomEvent('audio-autoplay-blocked', {
                  detail: { audio, base64Audio }
                }));
                resolve(); // Don't block the flow
              }
            } else {
              reject(playError);
            }
          }
        };

        attemptPlay();
        
        // Timeout fallback (30 seconds max)
        setTimeout(() => {
          if (!hasEnded) {
            console.warn('Audio playback timeout');
            audio.pause();
            resolve();
          }
        }, 30000);
        
      } catch (error) {
        console.error('Audio setup error:', error);
        reject(error);
      }
    });
  }

  /**
   * Skip current question
   */
  skipQuestion(): void {
    this.socket?.emit('skip-question', {
      interviewId: this.currentInterviewId,
    });
  }

  /**
   * Handle silence (request encouragement)
   */
  handleSilence(duration: number): void {
    this.socket?.emit('silence-detected', {
      interviewId: this.currentInterviewId,
      duration,
    });
  }

  /**
   * Get current interview stats
   */
  getStats(): void {
    this.socket?.emit('get-stats', {
      interviewId: this.currentInterviewId,
    });
  }

  /**
   * Pause interview
   */
  pauseInterview(): void {
    this.socket?.emit('pause-interview', {
      interviewId: this.currentInterviewId,
    });
  }

  /**
   * Resume interview
   */
  resumeInterview(): void {
    this.socket?.emit('resume-interview', {
      interviewId: this.currentInterviewId,
    });
  }

  /**
   * End interview and request report
   */
  endInterview(): void {
    this.socket?.emit('end-interview', {
      interviewId: this.currentInterviewId,
    });
  }

  /**
   * Test audio connectivity
   */
  testAudio(text: string = 'This is a test of the audio system.'): void {
    this.socket?.emit('test-audio', { text });
  }

  /**
   * Register event listener
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.socket?.on(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: (...args: any[]) => void): void {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  /**
   * Disconnect from socket
   */
  disconnect(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.stopRecording();
    }

    this.socket?.disconnect();
    this.socket = null;
    console.log('👋 Voice interview service disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Check if recording
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Get complete recorded audio as blob
   */
  getRecordedAudio(): Blob | null {
    if (this.audioChunks.length === 0) return null;
    return new Blob(this.audioChunks, { type: 'audio/webm' });
  }
}

// Export singleton instance
export default new VoiceInterviewService();

// Export types
export type {
  InterviewConfig,
  InterviewStats,
  Evaluation,
  QuestionData,
};
