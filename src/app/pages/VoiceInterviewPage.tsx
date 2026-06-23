import { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../../utils/supabase';
import { useVoiceCapture } from '../../hooks/useVoiceCapture';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import { useCountUp } from '../../hooks/useCountUp';
import { InterviewerAvatar, AudioVisualizer, PageLoader, WebcamPanel, CameraPermissionModal, GridBackground } from '../components';
import { Mic, MicOff, SkipForward, RotateCcw, StopCircle, Award, AlertTriangle, MessageSquare, ArrowLeft, Video } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useNonVerbalAnalysis, NonVerbalSummary } from '../../hooks/useNonVerbalAnalysis';
import { isMediaPipeAvailable } from '../../utils/featureFlags';

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

  const { phase, interviewerText, candidateText, history, runningScore, scoreCount, questionCount, maxQuestions, error } = state;

  const visibleMessages = [...history];
  if (interviewerText) {
    const lastMsg = visibleMessages[visibleMessages.length - 1];
    if (!(lastMsg && lastMsg.role === 'interviewer' && lastMsg.content === interviewerText)) {
      visibleMessages.push({ role: 'interviewer', content: interviewerText });
    }
  }

  const [token, setToken] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const {
    transcript: browserTranscript,
    isListening: isBrowserListening,
    startListening: startBrowserListening,
    stopListening: stopBrowserListening,
    resetTranscript: resetBrowserTranscript,
  } = useVoiceRecognition();

  const browserTranscriptRef = useRef('');
  useEffect(() => {
    browserTranscriptRef.current = browserTranscript;
  }, [browserTranscript]);
  
  // Audio playback queue refs
  const audioQueue = useRef<string[]>([]);
  const isAudioPlaying = useRef<boolean>(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const allAudioSentRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, interviewerText]);
  
  const liveScoreCount = useCountUp(runningScore);
  const toast = useToast();

  // Personalisation UI States
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [highlightAvatar, setHighlightAvatar] = useState(false);
  const [escalationHistory, setEscalationHistory] = useState<string[]>([]);

  // Webcam & Non-Verbal Analysis States
  const [mediaPipeReady, setMediaPipeReady] = useState(false);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { metrics, startAnalysis, stopAnalysis } = useNonVerbalAnalysis(videoRef, webcamEnabled);
  const [nonVerbalSummary, setNonVerbalSummary] = useState<NonVerbalSummary | null>(null);

  // Fetch token and feature flags on mount
  useEffect(() => {
    isMediaPipeAvailable().then((available) => {
      setMediaPipeReady(available);
      if (available) {
        supabase.auth.getSession().then(async ({ data }) => {
          if (data.session?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('camera_enabled_preference')
              .eq('id', data.session.user.id)
              .single();
            if (profile?.camera_enabled_preference) {
              setShowPermissionModal(true);
            }
          }
        });
      }
    });

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
      if (allAudioSentRef.current) {
        dispatch({ type: 'TTS_DONE' });
      }
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
          voice: interviewConfig.voice || 'meera',
          resumeText: interviewConfig.resumeText || null,
          useStoredResume: interviewConfig.useStoredResume || false,
          jdText: interviewConfig.jdText || null
        },
        authToken: token
      });
    });

    socket.on('session:ready', (data: { sessionId: string; firstQuestion: string; candidateName?: string | null; roleName?: string | null; companyName?: string | null; projectName?: string | null }) => {
      allAudioSentRef.current = false;
      dispatch({ type: 'SESSION_READY', payload: data });
      if (data.candidateName) setCandidateName(data.candidateName);
      if (data.roleName) setRoleName(data.roleName);
      if (data.companyName) setCompanyName(data.companyName);
      if (data.projectName) setProjectName(data.projectName);
    });

    socket.on('transcript:final', (data: { text: string }) => {
      dispatch({ type: 'TRANSCRIPT_READY', payload: data.text });
    });

    socket.on('interviewer:token', (data: { token: string }) => {
      allAudioSentRef.current = false;
      dispatch({ type: 'INTERVIEWER_TOKEN', payload: data.token });
    });

    socket.on('interviewer:done', (data: { fullText: string }) => {
      dispatch({ type: 'INTERVIEWER_DONE', payload: data.fullText });
    });

    socket.on('difficulty:changed', (data: { from: string; to: string; direction: 'up' | 'down' }) => {
      if (data.direction === 'up') {
        toast.success("↑ Raising the bar — you're doing great");
      } else {
        toast.info("Let's try a different angle");
      }
      setEscalationHistory(prev => [...prev, `Q${questionCount}: ${data.direction === 'up' ? 'escalated' : 'de-escalated'} to ${data.to}`]);
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

    socket.on('tts:done-all', () => {
      console.log('🔊 All TTS audio packets received for current turn.');
      allAudioSentRef.current = true;
      if (!isAudioPlaying.current && audioQueue.current.length === 0) {
        dispatch({ type: 'TTS_DONE' });
      }
    });

    socket.on('score:update', (data: any) => {
      if (data.score !== undefined) {
        dispatch({ type: 'SCORE_RECEIVED', payload: data.score });
      }
    });

    socket.on('session:end', (data: { sessionId: string; finalReport: any }) => {
      dispatch({ type: 'SESSION_ENDED' });
      // Stop webcam and release tracks if active
      if (webcamEnabled && cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      // Navigate to Results page
      navigate('/interview-results', {
        state: {
          overallScore: data.finalReport.overallScore,
          radarScores: data.finalReport.radarScores,
          communicationAnalytics: data.finalReport.communicationStats,
          questions: data.finalReport.detailedQuestionAnalysis || [],
          difficultyJourney: data.finalReport.difficultyJourney || escalationHistory,
          skillGapReport: data.finalReport.skillGapReport || null,
          nonVerbalSummary: data.finalReport.nonVerbalSummary || null,
          interviewConfig: {
            role: interviewConfig.domain || 'Backend',
            difficulty: interviewConfig.difficulty || 'Medium'
          }
        }
      });
    });

    socket.on('session:pre-end', () => {
      console.log('Session pre-end triggered, retrieving non-verbal summary...');
      const summary = stopAnalysis();
      setNonVerbalSummary(summary);
      socket.emit('session:complete', { nonVerbalSummary: summary });
    });

    socket.on('error', (err: any) => {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'WebSocket Error.' });
    });

    return () => {
      socket.disconnect();
    };
  }, [token, escalationHistory, webcamEnabled, cameraStream, stopAnalysis]);

  // Avatar border glow highlight triggers when candidate's name or project is referenced
  useEffect(() => {
    if (!interviewerText) return;
    const hasName = candidateName && interviewerText.toLowerCase().includes(candidateName.toLowerCase());
    const hasProject = projectName && interviewerText.toLowerCase().includes(projectName.toLowerCase());
    if (hasName || hasProject) {
      setHighlightAvatar(true);
      const timer = setTimeout(() => {
        setHighlightAvatar(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [interviewerText, candidateName, projectName]);

  // Memoized microphone callbacks to prevent re-recording loop on every render
  const handleAudioEnd = useCallback((audioData: Uint8Array | null) => {
    if (socketRef.current?.connected) {
      allAudioSentRef.current = false;
      const fallbackText = browserTranscriptRef.current;
      console.log('📤 Emitting audio:end with audio data size:', audioData?.length ?? 0, 'and fallback text:', fallbackText);
      
      // Send audio data AND textFallback together in a single atomic event
      // This eliminates the race condition where audio:end arrived before audio:chunk
      socketRef.current.emit('audio:end', { 
        audioData: audioData || null, 
        textFallback: fallbackText 
      });
      dispatch({ type: 'AUDIO_RECEIVED' });
    }
  }, []);

  const handleMicError = useCallback((err: Error) => {
    toast.error('Microphone initialization failed. Please check permissions.');
    dispatch({ type: 'SET_ERROR', payload: 'Microphone access denied or failed.' });
  }, [toast]);

  // Voice VAD Hook
  const { start: startMic, stop: stopMic, isRecording, hasDetectedSpeech, getAnalyser, analyser } = useVoiceCapture({
    onEnd: handleAudioEnd,
    onError: handleMicError,
    silenceMs: 3000
  });

  // Manage Mic Activation based on state phase - startMic and stopMic are now stable!
  useEffect(() => {
    if (phase === 'listening') {
      resetBrowserTranscript();
      startMic();
      startBrowserListening();
    } else {
      stopMic();
      stopBrowserListening();
    }
  }, [phase, startMic, stopMic, startBrowserListening, stopBrowserListening, resetBrowserTranscript]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => {
          track.stop();
          console.log('🔇 Camera track stopped on unmount');
        });
      }
    };
  }, [cameraStream]);

  // Start camera analysis once the video element is mounted in the DOM
  useEffect(() => {
    if (webcamEnabled && cameraStream && videoRef.current) {
      console.log('📷 Camera video element mounted, starting analysis...');
      startAnalysis(cameraStream);
    }
  }, [webcamEnabled, cameraStream, startAnalysis]);

  // Camera Grant and Disable Handlers
  const handleCameraGrant = (stream: MediaStream) => {
    setCameraStream(stream);
    setWebcamEnabled(true);
  };

  const handleCameraDisable = () => {
    setWebcamEnabled(false);
    stopAnalysis();
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Action Controllers
  const handleSkip = () => {
    if (socketRef.current?.connected) {
      allAudioSentRef.current = false;
      socketRef.current.emit('control:skip');
      dispatch({ type: 'AUDIO_RECEIVED' });
    }
  };

  const handleRepeat = () => {
    if (socketRef.current?.connected) {
      allAudioSentRef.current = false;
      socketRef.current.emit('control:repeat');
    }
  };

  const handleEnd = () => {
    if (window.confirm('Are you sure you want to end this mock interview early?')) {
      if (socketRef.current?.connected) {
        const summary = stopAnalysis();
        setNonVerbalSummary(summary);
        socketRef.current.emit('control:end', { nonVerbalSummary: summary });
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
              {candidateName ? `Interviewing: ${candidateName}` : 'Live Practice Session'}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-sm font-bold text-white font-montserrat leading-tight">
                {interviewConfig.domain || 'Backend'} Interview
              </h1>
              {roleName && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30">
                  → {roleName} {companyName ? `at ${companyName}` : ''}
                </span>
              )}
            </div>
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
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col justify-between relative z-10 gap-6 min-h-0">
        
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

        {/* 3-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-center min-h-0">
          
          {/* Column 1: Interviewer Avatar (Left) */}
          <div className="lg:col-span-3 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <InterviewerAvatar 
                state={getAvatarState()} 
                name="Arjun"
                voice={interviewConfig.voice || 'meera'}
                highlight={highlightAvatar}
              />
              {phase === 'listening' && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div className="h-10 w-full max-w-xs flex items-center justify-center">
              <AudioVisualizer isActive={phase === 'listening'} analyser={analyser} />
            </div>
          </div>

          {/* Column 2: Conversational Loop & Controls (Center) */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-6 h-full min-h-0 py-4">
            {/* Conversations Box */}
            <div className="glass-panel p-6 bg-surface-2/30 border border-glass-border flex-1 max-h-[300px] overflow-y-auto flex flex-col gap-4 min-h-[140px] rounded-2xl scrollbar-thin">
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
                    {visibleMessages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-2.5 items-start ${msg.role === 'interviewer' ? 'justify-start' : 'justify-end'}`}
                      >
                        {msg.role === 'interviewer' ? (
                          <>
                            <div className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0 font-montserrat">
                              AI
                            </div>
                            <div className="text-sm font-semibold text-white leading-relaxed pr-6 relative max-w-[85%]">
                              {msg.content}
                              {phase === 'speaking' && idx === visibleMessages.length - 1 && (
                                <span className="inline-block w-1.5 h-3.5 bg-primary ml-1 animate-pulse" />
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm text-text-secondary font-medium leading-relaxed pl-6 text-right max-w-[85%]">
                              {msg.content}
                            </div>
                            <div className="w-6 h-6 rounded-lg bg-white/10 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 font-montserrat">
                              YOU
                            </div>
                          </>
                        )}
                      </motion.div>
                    ))}

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
                    
                    <div ref={chatEndRef} />
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Controls Deck */}
            <div className="flex flex-col gap-4 items-center">
              {/* Status Label */}
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {phase === 'listening' ? (
                  hasDetectedSpeech ? (
                    <>
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-red-400">🔴 Recording... Speak now</span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-emerald-400">🎙️ Listening... Waiting for speech</span>
                    </>
                  )
                ) : phase === 'speaking' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>🔊 Interviewer speaking</span>
                  </>
                ) : phase === 'processing' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-amber-500">🤖 Processing your answer...</span>
                  </>
                ) : (
                  <span>Please wait...</span>
                )}
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
                    onClick={() => {
                      if (phase === 'listening') {
                        stopMic(true);
                      }
                    }}
                    disabled={phase !== 'listening'}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all z-10 relative ${
                      phase === 'listening'
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer shadow-[0_4px_16px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95'
                        : 'bg-primary/20 text-primary border border-primary/30 cursor-not-allowed'
                    }`}
                    title={phase === 'listening' ? 'Click to finish speaking and submit' : 'Microphone inactive'}
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

          {/* Column 3: Webcam Panel (Right) - Desktop Only */}
          {mediaPipeReady && (
            <div className="hidden lg:flex lg:col-span-3 justify-center">
              <WebcamPanel
                isActive={phase === 'listening' || phase === 'speaking' || phase === 'processing'}
                metrics={metrics}
                onEnable={() => setShowPermissionModal(true)}
                onDisable={handleCameraDisable}
                isEnabled={webcamEnabled}
                videoRef={videoRef}
              />
            </div>
          )}
        </div>
      </div>

      {/* Floating Camera Button (Mobile View) */}
      {mediaPipeReady && (
        <div className="lg:hidden fixed bottom-6 right-6 z-40">
          <button
            onClick={() => {
              if (!webcamEnabled) {
                setShowPermissionModal(true);
              } else {
                setShowMobileSheet(true);
              }
            }}
            className="w-12 h-12 rounded-full bg-primary hover:bg-primary/95 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
            title="Toggle Camera Analysis"
          >
            <Video size={20} />
          </button>
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      <AnimatePresence>
        {showMobileSheet && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileSheet(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 bg-[#121216] border-t border-glass-border rounded-t-3xl p-6 flex flex-col items-center gap-4"
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mb-2 cursor-pointer" onClick={() => setShowMobileSheet(false)} />
              <h3 className="text-white font-bold text-sm" style={{ fontFamily: "'Montserrat', sans-serif" }}>Camera Analysis</h3>
              <WebcamPanel
                isActive={phase === 'listening' || phase === 'speaking' || phase === 'processing'}
                metrics={metrics}
                onEnable={() => setShowPermissionModal(true)}
                onDisable={() => {
                  handleCameraDisable();
                  setShowMobileSheet(false);
                }}
                isEnabled={webcamEnabled}
                videoRef={videoRef}
              />
              <button
                onClick={() => setShowMobileSheet(false)}
                className="mt-2 text-xs font-bold text-text-secondary hover:text-white transition-colors"
              >
                Close Panel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Camera Privacy & Permission Modal */}
      <CameraPermissionModal
        open={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onGrant={handleCameraGrant}
      />
    </div>
  );
}

