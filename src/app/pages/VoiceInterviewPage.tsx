import { useState, useEffect, useRef, useReducer } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../../utils/supabase';
import { useVoiceCapture } from '../../hooks/useVoiceCapture';
import { useCountUp } from '../../hooks/useCountUp';
import { InterviewerAvatar, AudioVisualizer, PageLoader } from '../components';
import { Mic, MicOff, SkipForward, RotateCcw, StopCircle, Award, AlertTriangle, MessageSquare, ArrowLeft } from 'lucide-react';

// State Machine Definition
type Phase = 'connecting' | 'ready' | 'listening' | 'processing' | 'speaking' | 'ended';

interface InterviewState {
  phase: Phase;
  interviewerText: string;
  candidateText: string;
  history: Array<{ role: 'interviewer' | 'candidate'; content: string }>;
  runningScore: number;
  scoreCount: number;
  questionCount: number;
  maxQuestions: number;
  error: string | null;
}

type Action =
  | { type: 'CONNECTED' }
  | { type: 'SESSION_READY'; payload: { sessionId: string; firstQuestion: string } }
  | { type: 'START_LISTENING' }
  | { type: 'AUDIO_RECEIVED' }
  | { type: 'TRANSCRIPT_READY'; payload: string }
  | { type: 'INTERVIEWER_TOKEN'; payload: string }
  | { type: 'INTERVIEWER_DONE'; payload: string }
  | { type: 'TTS_PLAYING' }
  | { type: 'TTS_DONE' }
  | { type: 'SCORE_RECEIVED'; payload: number }
  | { type: 'SESSION_ENDED' }
  | { type: 'SET_ERROR'; payload: string };

function interviewReducer(state: InterviewState, action: Action): InterviewState {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, phase: 'connecting', error: null };
    case 'SESSION_READY':
      return {
        ...state,
        phase: 'speaking',
        interviewerText: action.payload.firstQuestion,
        history: [{ role: 'interviewer', content: action.payload.firstQuestion }]
      };
    case 'START_LISTENING':
      return { ...state, phase: 'listening', candidateText: '' };
    case 'AUDIO_RECEIVED':
      return { ...state, phase: 'processing' };
    case 'TRANSCRIPT_READY':
      return {
        ...state,
        phase: 'processing',
        candidateText: action.payload,
        history: [...state.history, { role: 'candidate', content: action.payload }]
      };
    case 'INTERVIEWER_TOKEN':
      return {
        ...state,
        phase: 'speaking',
        interviewerText: (state.phase === 'speaking' ? state.interviewerText : '') + action.payload
      };
    case 'INTERVIEWER_DONE':
      return {
        ...state,
        phase: 'speaking',
        interviewerText: action.payload,
        history: [...state.history, { role: 'interviewer', content: action.payload }],
        questionCount: state.questionCount + 1
      };
    case 'TTS_PLAYING':
      return { ...state, phase: 'speaking' };
    case 'TTS_DONE':
      return { ...state, phase: 'listening', interviewerText: '', candidateText: '' };
    case 'SCORE_RECEIVED':
      const newScoreCount = state.scoreCount + 1;
      const newAverage = Math.round((state.runningScore * state.scoreCount + action.payload * 10) / newScoreCount);
      return {
        ...state,
        runningScore: newAverage,
        scoreCount: newScoreCount
      };
    case 'SESSION_ENDED':
      return { ...state, phase: 'ended' };
    case 'SET_ERROR':
      return { ...state, error: action.payload, phase: 'connecting' };
    default:
      return state;
  }
}

const initialState: InterviewState = {
  phase: 'connecting',
  interviewerText: '',
  candidateText: '',
  history: [],
  runningScore: 0,
  scoreCount: 0,
  questionCount: 1,
  maxQuestions: 5,
  error: null
};

export default function VoiceInterviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const interviewConfig = location.state || {};

  const [state, dispatch] = useReducer(interviewReducer, {
    ...initialState,
    maxQuestions: interviewConfig.maxQuestions || 5
  });

  const { phase, interviewerText, candidateText, history, runningScore, questionCount, maxQuestions, error } = state;

  const [token, setToken] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  // Audio playback queue refs
  const audioQueue = useRef<string[]>([]);
  const isAudioPlaying = useRef<boolean>(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const liveScoreCount = useCountUp(runningScore);

  // Fetch token on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setToken(data.session.access_token);
      } else {
        dispatch({ type: 'SET_ERROR', payload: 'Session not found. Please log in.' });
      }
    }).catch(() => {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to authenticate session.' });
    });

    return () => {
      // Cleanup audio context/playback on unmount
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Audio queue processing
  const playNextAudio = () => {
    if (audioQueue.current.length === 0) {
      isAudioPlaying.current = false;
      dispatch({ type: 'TTS_DONE' });
      return;
    }

    isAudioPlaying.current = true;
    dispatch({ type: 'TTS_PLAYING' });
    const base64 = audioQueue.current.shift()!;
    
    try {
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([array], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      
      audio.onplaying = () => {
        dispatch({ type: 'TTS_PLAYING' });
      };

      audio.onended = () => {
        URL.revokeObjectURL(url);
        playNextAudio();
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        playNextAudio();
      };

      audio.play().catch((err) => {
        console.warn('Audio play request blocked or failed:', err);
        URL.revokeObjectURL(url);
        playNextAudio();
      });
    } catch (err) {
      console.error('Failed to parse audio base64:', err);
      playNextAudio();
    }
  };

  const speakBrowserFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      dispatch({ type: 'TTS_PLAYING' });
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.onend = () => {
        dispatch({ type: 'TTS_DONE' });
      };
      utterance.onerror = () => {
        dispatch({ type: 'TTS_DONE' });
      };
      window.speechSynthesis.speak(utterance);
    } else {
      dispatch({ type: 'TTS_DONE' });
    }
  };

  // Socket setup
  useEffect(() => {
    if (!token) return;

    const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';
    console.log('🔌 Connecting to WebSocket namespace:', `${WS_URL}/voice-interview`);

    const socket = io(`${WS_URL}/voice-interview`, {
      auth: { token },
      transports: ['websocket']
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'CONNECTED' });
      socket.emit('session:start', {
        sessionConfig: {
          domain: interviewConfig.domain || 'Backend',
          difficulty: interviewConfig.difficulty || 'Medium',
          interviewType: interviewConfig.interviewType || 'TECHNICAL',
          durationMinutes: 15,
          maxQuestions: maxQuestions,
          voice: interviewConfig.voice || 'meera'
        },
        authToken: token
      });
    });

    socket.on('session:ready', (data: { sessionId: string; firstQuestion: string }) => {
      dispatch({ type: 'SESSION_READY', payload: data });
    });

    socket.on('transcript:final', (data: { text: string }) => {
      dispatch({ type: 'TRANSCRIPT_READY', payload: data.text });
    });

    socket.on('interviewer:token', (data: { token: string }) => {
      dispatch({ type: 'INTERVIEWER_TOKEN', payload: data.token });
    });

    socket.on('interviewer:done', (data: { fullText: string }) => {
      dispatch({ type: 'INTERVIEWER_DONE', payload: data.fullText });
    });

    socket.on('tts:audio', (data: { audioBase64: string; sampleRate: number; textFallback?: string }) => {
      if (data.audioBase64) {
        audioQueue.current.push(data.audioBase64);
        if (!isAudioPlaying.current) {
          playNextAudio();
        }
      } else if (data.textFallback) {
        speakBrowserFallback(data.textFallback);
      }
    });

    socket.on('score:update', (data: any) => {
      if (data.score !== undefined) {
        dispatch({ type: 'SCORE_RECEIVED', payload: data.score });
      }
    });

    socket.on('session:end', (data: { sessionId: string; finalReport: any }) => {
      dispatch({ type: 'SESSION_ENDED' });
      // Navigate to Results page
      navigate('/interview-results', {
        state: {
          overallScore: data.finalReport.overallScore,
          radarScores: data.finalReport.radarScores,
          communicationAnalytics: data.finalReport.communicationStats,
          questions: data.finalReport.detailedQuestionAnalysis || [],
          interviewConfig: {
            role: interviewConfig.domain || 'Backend',
            difficulty: interviewConfig.difficulty || 'Medium'
          }
        }
      });
    });

    socket.on('error', (err: any) => {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'WebSocket Error.' });
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Voice VAD Hook
  const { start: startMic, stop: stopMic, isRecording } = useVoiceCapture({
    onChunk: (chunk: Blob) => {
      chunk.arrayBuffer().then((buf) => {
        if (socketRef.current?.connected) {
          socketRef.current.emit('audio:chunk', buf);
        }
      });
    },
    onEnd: () => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('audio:end');
        dispatch({ type: 'AUDIO_RECEIVED' });
      }
    },
    silenceMs: 1500
  });

  // Manage Mic Activation based on state phase
  useEffect(() => {
    if (phase === 'listening') {
      startMic();
    } else {
      stopMic();
    }
  }, [phase, startMic, stopMic]);

  // Action Controllers
  const handleSkip = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('control:skip');
      dispatch({ type: 'AUDIO_RECEIVED' });
    }
  };

  const handleRepeat = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('control:repeat');
    }
  };

  const handleEnd = () => {
    if (window.confirm('Are you sure you want to end this mock interview early?')) {
      if (socketRef.current?.connected) {
        socketRef.current.emit('control:end');
        dispatch({ type: 'AUDIO_RECEIVED' });
      }
    }
  };

  // Convert Phase to InterviewerAvatar state
  const getAvatarState = (): 'idle' | 'listening' | 'speaking' | 'thinking' => {
    if (phase === 'listening') return 'listening';
    if (phase === 'speaking') return 'speaking';
    if (phase === 'processing') return 'thinking';
    return 'idle';
  };

  if (!token && !error) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-[#0e0e11] text-[#f0f0f5] flex flex-col relative overflow-hidden">
      <GridBackground />
      
      {/* Glow orb */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header Deck */}
      <header className="glass-panel border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 rounded-xl border border-glass-border bg-glass-bg flex items-center justify-center hover:bg-white/5 text-text-secondary hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">
              Live Practice Session
            </span>
            <h1 className="text-sm font-bold text-white font-montserrat leading-tight">
              {interviewConfig.domain || 'Backend'} Interview
            </h1>
          </div>
        </div>

        {/* Live Score Ticker */}
        {scoreCount > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <Award size={15} className="text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 font-montserrat">
              Avg Score: {liveScoreCount}%
            </span>
          </div>
        )}
      </header>

      {/* Main Board */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 flex flex-col justify-between relative z-10 gap-8 min-h-0">
        
        {/* Progress Line */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs font-semibold text-text-secondary">
            <span>Question {questionCount} of {maxQuestions}</span>
            <span className="capitalize">{phase}</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(questionCount / maxQuestions) * 100}%` }}
            />
          </div>
        </div>

        {/* Avatar and Visualizer Section */}
        <div className="flex flex-col items-center justify-center flex-1 gap-6 my-auto">
          <div className="relative">
            <InterviewerAvatar state={getAvatarState()} />
            {phase === 'listening' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>

          <div className="h-10 w-full max-w-xs flex items-center justify-center">
            <AudioVisualizer isActive={phase === 'listening' || phase === 'speaking'} />
          </div>
        </div>

        {/* Conversations Box */}
        <div className="glass-panel p-6 bg-surface-2/30 border border-glass-border flex-1 max-h-[220px] overflow-y-auto flex flex-col gap-4 min-h-[140px] rounded-2xl scrollbar-thin">
          <AnimatePresence mode="wait">
            {phase === 'connecting' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-sm text-text-secondary py-6 flex flex-col items-center gap-3"
              >
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Establishing real-time connection to AI Interviewer...</span>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs leading-relaxed"
              >
                <AlertTriangle size={18} className="flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">Connection Issue</h4>
                  <p>{error}</p>
                </div>
              </motion.div>
            )}

            {!error && phase !== 'connecting' && (
              <div className="flex flex-col gap-4 w-full">
                {/* Interviewer Text bubble */}
                {interviewerText && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5 items-start"
                  >
                    <div className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0 font-montserrat">
                      AI
                    </div>
                    <div className="text-sm font-semibold text-white leading-relaxed pr-6 relative">
                      {interviewerText}
                      {phase === 'speaking' && (
                        <span className="inline-block w-1.5 h-3.5 bg-primary ml-1 animate-pulse" />
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Candidate Response Transcript */}
                {candidateText && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5 items-start justify-end"
                  >
                    <div className="text-sm text-text-secondary font-medium leading-relaxed pl-6 text-right">
                      {candidateText}
                    </div>
                    <div className="w-6 h-6 rounded-lg bg-white/10 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 font-montserrat">
                      YOU
                    </div>
                  </motion.div>
                )}

                {/* Processing Spinner */}
                {phase === 'processing' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-xs text-text-secondary ml-8"
                  >
                    <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" />
                    <span>AI Interviewer is processing your answer...</span>
                  </motion.div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Controls Deck */}
        <div className="flex flex-col gap-4 items-center">
          {/* Status Label */}
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            {phase === 'listening' ? 'Speaking ... silence ends question' : phase === 'speaking' ? 'Interviewer speaking' : 'Wait...'}
          </div>

          <div className="flex items-center gap-4">
            {/* Repeat button */}
            <button
              onClick={handleRepeat}
              disabled={phase !== 'listening'}
              className="w-12 h-12 rounded-2xl border border-glass-border bg-surface-2 hover:bg-white/5 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none hover:-translate-y-0.5"
              title="Repeat last question"
            >
              <RotateCcw size={16} />
            </button>

            {/* Microphone State Button */}
            <div className="relative">
              <div
                className={`absolute inset-0 rounded-full blur-md opacity-20 transition-all ${
                  phase === 'listening' ? 'bg-emerald-500 scale-110' : 'bg-primary'
                }`}
              />
              <button
                disabled={true} // VAD runs automatically, mic button serves as status
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all z-10 relative cursor-default ${
                  phase === 'listening'
                    ? 'bg-emerald-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.3)]'
                    : 'bg-primary/20 text-primary border border-primary/30'
                }`}
              >
                {phase === 'listening' ? <Mic size={24} /> : <MicOff size={24} />}
              </button>
            </div>

            {/* Skip Button */}
            <button
              onClick={handleSkip}
              disabled={phase !== 'listening'}
              className="w-12 h-12 rounded-2xl border border-glass-border bg-surface-2 hover:bg-white/5 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none hover:-translate-y-0.5"
              title="Skip question"
            >
              <SkipForward size={16} />
            </button>
          </div>

          {/* End Session Button */}
          {phase !== 'connecting' && (
            <button
              onClick={handleEnd}
              className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors px-4 py-2 border border-red-500/10 rounded-xl hover:bg-red-500/5"
            >
              <StopCircle size={14} />
              End Interview
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
