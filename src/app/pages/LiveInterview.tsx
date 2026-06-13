import { useState, useEffect, useRef, useReducer } from "react";
import {
  Camera,
  Mic,
  MicOff,
  MessageSquare,
  Volume2,
  VolumeX,
  AlertCircle,
  ChevronLeft,
  SkipForward,
  CameraOff,
  Activity,
  Send,
  Loader2
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useWhisperRecognition } from "../../hooks/useWhisperRecognition";
import { useSarvamTTS } from "../../hooks/useSarvamTTS";
import { useEvaluation, EvaluationResult } from "../../hooks/useEvaluation";
import { useQuestionGenerator, QuestionData } from "../../hooks/useQuestionGenerator";
import { useCommunicationAnalytics } from "../../hooks/useCommunicationAnalytics";
import { useInterviewState } from "../../hooks/useInterviewState";
import { InterviewerAvatar, AudioVisualizer } from "../components";

interface InterviewConfig {
  role: string;
  difficulty: "easy" | "medium" | "hard";
  questionCount: number;
}

interface PreviousQA {
  question: string;
  answer: string;
}

type InputMode = "voice" | "text";

// 1. Consolidated state shape & actions for Task 6
interface InterviewState {
  questions: QuestionData[];
  answers: string[];
  previousQA: PreviousQA[];
  currentQuestionIndex: number;
  evaluations: EvaluationResult[];
}

const initialInterviewState: InterviewState = {
  questions: [],
  answers: [],
  previousQA: [],
  currentQuestionIndex: 0,
  evaluations: [],
};

type InterviewAction =
  | { type: "SET_QUESTIONS"; payload: QuestionData[] }
  | { type: "ADD_QUESTION"; payload: QuestionData }
  | { type: "ADD_ANSWER"; payload: { question: string; answer: string } }
  | { type: "SET_QUESTION"; payload: number }
  | { type: "ADD_SCORE"; payload: EvaluationResult }
  | { type: "RESET" };

function interviewReducer(state: InterviewState, action: InterviewAction): InterviewState {
  switch (action.type) {
    case "SET_QUESTIONS":
      return {
        ...state,
        questions: action.payload,
      };
    case "ADD_QUESTION":
      return {
        ...state,
        questions: [...state.questions, action.payload],
      };
    case "ADD_ANSWER": {
      const newAnswers = [...state.answers];
      newAnswers[state.currentQuestionIndex] = action.payload.answer;
      return {
        ...state,
        answers: newAnswers,
        previousQA: [
          ...state.previousQA,
          { question: action.payload.question, answer: action.payload.answer },
        ],
      };
    }
    case "SET_QUESTION":
      return {
        ...state,
        currentQuestionIndex: action.payload,
      };
    case "ADD_SCORE":
      return {
        ...state,
        evaluations: [...state.evaluations, action.payload],
      };
    case "RESET":
      return initialInterviewState;
    default:
      return state;
  }
}

export default function LiveInterview() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousQuestionRef = useRef<number>(-1);

  // Get interview configuration from navigation state
  const interviewConfig = (location.state as InterviewConfig) || {
    role: "software_engineer",
    difficulty: "medium" as const,
    questionCount: 5, // Default to a shorter standard run of 5
  };

  // State Management via consolidated useReducer
  const [state, dispatch] = useReducer(interviewReducer, initialInterviewState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Selected Voice preference from localStorage
  const selectedVoice = localStorage.getItem("intervox_voice_preference") || "kavya";
  const voiceNameMap: Record<string, string> = {
    kavya: "Meera (AI Professional)",
    amit: "Amit (AI Technical Coach)",
    meera: "Meera (AI Professional)",
    arjun: "Arjun (AI Senior Engineer)",
    ananya: "Ananya (AI Warm Partner)",
  };
  const interviewerName = voiceNameMap[selectedVoice] || "AI Interviewer";

  // Whisper Voice Recognition Hook (More Reliable)
  const {
    transcript,
    isRecording: isWhisperRecording,
    error: voiceError,
    startRecording: startWhisperRecording,
    stopRecording: stopWhisperRecording,
    resetTranscript,
  } = useWhisperRecognition();

  // Sarvam AI Text-to-Speech Hook (Indian voices)
  const { speak, stop: stopSpeaking, isSpeaking } = useSarvamTTS();

  // Evaluation Hook
  const { evaluateAnswer, isEvaluating, error: evaluationError } = useEvaluation();

  // Question Generator Hook
  const { generateQuestion, isGenerating, error: questionError } = useQuestionGenerator();

  // Communication analytics
  const { startTracking, recordPause, analyzeAnswer, getAverageMetrics, allAnalytics } = useCommunicationAnalytics();
  
  // Local simple flags
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [isRecording, setIsRecording] = useState(false);
  const [textAnswer, setTextAnswer] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(120);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false); // Track user interaction for autoplay
  const [cameraPermission, setCameraPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isEvaluatingAll, setIsEvaluatingAll] = useState(false);
  const [isConversing, setIsConversing] = useState(false);

  // Derive phase state using useInterviewState hook for Task 3d
  const { phase } = useInterviewState({
    isSpeaking,
    isRecording,
    isEvaluating,
    isGenerating,
    isConversing,
    isEvaluatingAll,
  });

  const totalQuestions = interviewConfig.questionCount;
  const progress = ((state.currentQuestionIndex + 1) / totalQuestions) * 100;

  const buildReactionFromAnswer = (answer: string) => {
    const trimmed = answer.trim();
    if (!trimmed || trimmed === "No response was recorded.") {
      return "Let's continue.";
    }
    if (trimmed.length < 20) {
      return "Thanks. In your next answer, please add a bit more detail.";
    }
    if (/(built|designed|implemented|optimized|improved|scaled|led)/i.test(trimmed)) {
      return "Nice, that shows strong ownership.";
    }
    if (/(bug|incident|failure|issue|problem|challenge)/i.test(trimmed)) {
      return "Good, I like how you explained the challenge.";
    }
    return "Good answer, thanks for that.";
  };

  // Generate first question on mount (start with behavioral/introduction)
  useEffect(() => {
    const loadFirstQuestion = async () => {
      console.log("🎯 Starting with standard interview opener...");
      try {
        const firstQuestion = {
          question: "Tell me about yourself and your background.",
          ideal_answer:
            "A strong answer should include: your current role and experience, relevant technical skills, notable achievements or projects, and what motivates you professionally.",
          keywords: ["experience", "background", "skills", "expertise", "achievements", "passion", "goals"],
          role: interviewConfig.role,
          difficulty: "easy" as const,
        };

        dispatch({ type: "SET_QUESTIONS", payload: [firstQuestion] });
        
        // Auto-speak first question after a delay (gives user time to settle in)
        setTimeout(() => {
          if (isSoundOn) {
            console.log("🎤 Speaking first question:", firstQuestion.question.substring(0, 50));
            speak(firstQuestion.question, { language: "en-IN", speaker: selectedVoice });
          }
        }, 1800);
      } catch (error) {
        console.error("❌ Error loading question:", error);
      }
    };

    loadFirstQuestion();
  }, []);

  // Auto-read question aloud when question changes (only after user interaction)
  useEffect(() => {
    const questionChanged =
      previousQuestionRef.current !== state.currentQuestionIndex && previousQuestionRef.current !== -1;

    if (questionChanged && isSoundOn && hasUserInteracted && state.questions[state.currentQuestionIndex]) {
      const currentQuestionData = state.questions[state.currentQuestionIndex];
      const previousAnswer = state.answers[state.currentQuestionIndex - 1] || "";
      const reaction =
        currentQuestionData.reaction ||
        (state.currentQuestionIndex > 0 ? buildReactionFromAnswer(previousAnswer) : "");
      const speechText = reaction ? `${reaction} ${currentQuestionData.question}` : currentQuestionData.question;

      console.log("🔊 Question CHANGED - Auto-speaking with Sarvam AI:", speechText.substring(0, 80));
      stopSpeaking();

      setTimeout(() => {
        speak(speechText, { language: "en-IN", speaker: selectedVoice });
      }, 150);
    }

    previousQuestionRef.current = state.currentQuestionIndex;
  }, [state.currentQuestionIndex, isSoundOn, hasUserInteracted]);

  // Auto-scroll messaging chat layout
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.answers, state.currentQuestionIndex, state.questions]);

  // Initialize camera and microphone
  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
        });

        streamRef.current = stream;
        setCameraPermission("granted");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Set up audio context for visualization
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
      } catch (error) {
        console.error("Error accessing media devices:", error);
        setCameraPermission("denied");
      }
    };

    initMedia();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 120;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.currentQuestionIndex]);

  // Audio visualization
  useEffect(() => {
    if (isRecording && analyserRef.current) {
      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        setAudioLevel(average);
      };

      draw();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setAudioLevel(0);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      console.log("🎤 Starting recording with Whisper...");
      startTracking();
      await startWhisperRecording();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    console.log("🛑 Stopping recording...");
    try {
      await stopWhisperRecording();
      setIsRecording(false);
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  };

  const toggleRecording = () => {
    setHasUserInteracted(true); // Enable auto-play
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSubmit = async () => {
    console.log("📤 Submitting answer...");
    let userAnswer = "";
    if (inputMode === "voice") {
      if (isRecording) {
        setIsRecording(false);
        userAnswer = await stopWhisperRecording();
      } else {
        userAnswer = transcript;
      }
    } else {
      userAnswer = textAnswer;
    }

    const currentQuestionData = stateRef.current.questions[stateRef.current.currentQuestionIndex];
    if (!currentQuestionData) return;

    if (!userAnswer || userAnswer.trim() === "") {
      userAnswer = "No response was recorded.";
    }

    setIsConversing(true);
    let isAnswer = true;
    let replyText = "";

    try {
      const converseUrl = `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/interview/converse`;
      const response = await fetch(converseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestionData.question,
          user_input: userAnswer,
          role: interviewConfig.role,
          difficulty: interviewConfig.difficulty,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.type === "repeat" || result.type === "clarification") {
          isAnswer = false;
          replyText = result.reply || "";
        }
      }
    } catch (err) {
      console.error("Error in conversation check:", err);
    } finally {
      setIsConversing(false);
    }

    if (!isAnswer) {
      console.log(`💬 Conversational response: "${replyText}"`);
      if (isSoundOn && replyText) {
        speak(replyText, { language: "en-IN", speaker: selectedVoice });
      }
      resetTranscript();
      setTextAnswer("");
      return; // Stay on the same question
    }

    // Save answer into state (Task 6 reducer replaces answersRef)
    dispatch({
      type: "ADD_ANSWER",
      payload: {
        question: currentQuestionData.question,
        answer: userAnswer,
      },
    });

    analyzeAnswer(userAnswer, stateRef.current.currentQuestionIndex);

    setTimeout(() => {
      resetTranscript();
      setTextAnswer("");
      handleNext();
    }, 150);
  };

  const handleNext = async () => {
    if (isRecording) {
      stopRecording();
    }
    resetTranscript();
    audioChunksRef.current = [];

    const activeState = stateRef.current;
    if (activeState.currentQuestionIndex < totalQuestions - 1) {
      const nextQuestionIndex = activeState.currentQuestionIndex + 1;

      if (!activeState.questions[nextQuestionIndex]) {
        let difficulty: "easy" | "medium" | "hard" = "medium";
        const progressPercent = (nextQuestionIndex / totalQuestions) * 100;
        if (progressPercent < 30) {
          difficulty = "easy";
        } else if (progressPercent < 70) {
          difficulty = "medium";
        } else {
          difficulty = "hard";
        }

        const newQuestion = await generateQuestion({
          role: interviewConfig.role as any,
          difficulty: difficulty,
          previous_qa: activeState.previousQA,
          use_ai: true,
        });

        if (newQuestion) {
          dispatch({ type: "ADD_QUESTION", payload: newQuestion });
        } else {
          await evaluateAllAnswersAndNavigate();
          return;
        }
      }

      dispatch({ type: "SET_QUESTION", payload: nextQuestionIndex });
      setTimeRemaining(120);
    } else {
      setTimeout(async () => {
        await evaluateAllAnswersAndNavigate();
      }, 200);
    }
  };

  const evaluateAllAnswersAndNavigate = async () => {
    setIsEvaluatingAll(true);
    try {
      const finalState = stateRef.current;
      const finalAnswers = finalState.answers;

      const evaluationPromises = finalState.questions.map(async (question, index) => {
        const userAnswer = finalAnswers[index] || "";
        if (!userAnswer.trim() || userAnswer === "No response was recorded.") {
          return null;
        }

        return await evaluateAnswer({
          question: question.question,
          user_answer: userAnswer,
          ideal_answer: question.ideal_answer,
          keywords: question.keywords,
          role: interviewConfig.role,
        });
      });

      const evaluationResults = await Promise.all(evaluationPromises);
      const validResults = evaluationResults.filter((r) => r !== null) as EvaluationResult[];

      const avgScore =
        validResults.length > 0
          ? validResults.reduce((sum, r) => sum + r.final_score, 0) / validResults.length
          : 0;

      navigate("/interview-results", {
        state: {
          questions: finalState.questions,
          answers: finalAnswers,
          evaluations: validResults,
          overallScore: Math.round(avgScore),
          interviewConfig: interviewConfig,
          communicationAnalytics: allAnalytics,
        },
      });
    } catch (error) {
      console.error("❌ Evaluation error:", error);
      navigate("/interview-results");
    } finally {
      setIsEvaluatingAll(false);
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isCameraOn;
        setIsCameraOn(!isCameraOn);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = timeRemaining <= 30;

  // Build the list of conversation messages dynamically for the chat layout (Task 3e)
  const conversationBubbles = [];
  for (let i = 0; i <= state.currentQuestionIndex; i++) {
    const qData = state.questions[i];
    if (qData) {
      const reactionText =
        qData.reaction || (i > 0 ? buildReactionFromAnswer(state.answers[i - 1] || "") : "");
      
      conversationBubbles.push({
        id: `q-${i}`,
        role: "interviewer",
        text: qData.question,
        reaction: reactionText,
      });

      if (state.answers[i] !== undefined) {
        conversationBubbles.push({
          id: `a-${i}`,
          role: "candidate",
          text: state.answers[i],
        });
      }
    }
  }

  return (
    <div className="h-screen w-full bg-[#0e0e11] text-[#f0f0f5] flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="bg-var(--surface-2) border-b border-var(--glass-border) glass-panel px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0 z-20 rounded-none border-t-0 border-x-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
              }
              navigate("/dashboard");
            }}
            className="flex items-center gap-2 text-[#9090a8] hover:text-white transition-colors"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: "0.875rem" }}
          >
            <ChevronLeft size={16} strokeWidth={2} />
            Exit
          </button>
          <div className="h-6 w-px bg-var(--glass-border)" />
          <span className="font-semibold text-sm tracking-wide">
            Question {state.currentQuestionIndex + 1} of {totalQuestions}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Timer */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300"
            style={{
              backgroundColor: isLowTime ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.02)",
              borderColor: isLowTime ? "rgba(220,38,38,0.4)" : "var(--glass-border)",
            }}
          >
            <AlertCircle size={14} className={isLowTime ? "text-red-400 animate-pulse" : "text-[#9090a8]"} strokeWidth={2} />
            <span className={`text-sm font-semibold ${isLowTime ? "text-red-400" : "text-white"}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              const newSoundState = !isSoundOn;
              setIsSoundOn(newSoundState);
              if (!newSoundState) stopSpeaking();
            }}
            className="w-9 h-9 rounded-xl bg-rgba(255,255,255,0.04) hover:bg-rgba(255,255,255,0.08) flex items-center justify-center transition-colors border border-var(--glass-border)"
          >
            {isSoundOn ? (
              <Volume2 size={16} className="text-[#f0f0f5]" />
            ) : (
              <VolumeX size={16} className="text-[#9090a8]" />
            )}
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-[#1e1e24] relative overflow-hidden flex-shrink-0 z-20">
        <motion.div
          className="h-full"
          style={{
            background: "linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)",
            boxShadow: "0 0 8px var(--accent-glow)",
          }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>

      {/* Main Grid Stage — Refactored to 5-col Grid layout for Task 3a */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 overflow-hidden min-h-0 bg-[#0e0e11]">
        {/* Left Column (col-span-2) — Interviewer Avatar & User Camera Feed */}
        <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto pr-1">
          {/* Interviewer Avatar component (Task 3b) */}
          <InterviewerAvatar state={phase} name={interviewerName} voice={selectedVoice} />

          {/* Audio Visualizer underneath avatar when active (Task 3c) */}
          <div className="glass-panel p-4 flex flex-col items-center justify-center w-full">
            <span className="text-[10px] text-[#9090a8] font-bold uppercase tracking-wider mb-2">
              Voice Waveform
            </span>
            <AudioVisualizer isActive={phase === "speaking"} color="var(--accent-primary)" />
          </div>

          {/* Camera Feed styled as a clean glass panel */}
          <div className="relative rounded-2xl border border-var(--glass-border) glass-panel overflow-hidden bg-black/40 aspect-video w-full">
            {cameraPermission === "denied" ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                <div>
                  <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
                  <p className="text-xs text-[#9090a8]">Camera permission denied</p>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transition-opacity duration-300"
                  style={{ transform: "scaleX(-1)", display: isCameraOn ? "block" : "none" }}
                />
                {!isCameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#16161a]">
                    <CameraOff size={32} className="text-[#475569]" />
                  </div>
                )}
                {/* Camera Toggle Button */}
                <button
                  onClick={toggleCamera}
                  className="absolute bottom-3 right-3 w-8 h-8 rounded-xl bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors text-white z-10 border border-white/10"
                >
                  {isCameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Column (col-span-3) — Message Feed & Scroll area + User inputs */}
        <div className="lg:col-span-3 flex flex-col bg-var(--surface-2) rounded-2xl border border-var(--glass-border) glass-panel overflow-hidden min-h-0">
          
          {/* Scrollable Conversation Transcript Log (Task 3e) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
            {isGenerating && state.questions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-var(--accent-primary) animate-spin" />
                <p className="text-sm text-[#9090a8]">Starting interview session...</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {conversationBubbles.map((msg) => {
                  const isInterviewer = msg.role === "interviewer";
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: isInterviewer ? -12 : 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex flex-col max-w-[85%] ${
                        isInterviewer ? "mr-auto items-start" : "ml-auto items-end"
                      }`}
                    >
                      {/* Name label */}
                      <span className="text-[10px] text-[#9090a8] uppercase tracking-wider mb-1 font-bold">
                        {isInterviewer ? interviewerName : "You"}
                      </span>
                      
                      {/* Message Bubble styling as specified in Task 3e */}
                      <div
                        className={`p-4 rounded-2xl text-sm leading-relaxed border ${
                          isInterviewer
                            ? "glass-panel bg-white/[0.02] border-white/5 text-[#f0f0f5]"
                            : "bg-[#6C5CE7]/15 border-[#6C5CE7]/30 text-[#f0f0f5]"
                        }`}
                      >
                        {isInterviewer && msg.reaction && (
                          <span className="block text-xs text-var(--accent-secondary) italic mb-2 font-medium">
                            "{msg.reaction}"
                          </span>
                        )}
                        <span>{msg.text}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* User Controls Panel */}
          <div className="bg-white/[0.01] border-t border-var(--glass-border) p-5 flex-shrink-0">
            <div className="flex flex-col gap-4">
              
              {/* Input Mode Toggles */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    if (isRecording) stopRecording();
                    resetTranscript();
                    setInputMode("voice");
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold uppercase tracking-wider border ${
                    inputMode === "voice"
                      ? "bg-var(--accent-primary) text-white border-var(--accent-primary) shadow-[0_4px_12px_var(--accent-glow)]"
                      : "bg-[#1e1e24] text-[#9090a8] border-transparent hover:border-var(--glass-border)"
                  }`}
                >
                  <Mic size={12} />
                  Voice
                </button>
                <button
                  onClick={() => {
                    if (isRecording) stopRecording();
                    resetTranscript();
                    setInputMode("text");
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold uppercase tracking-wider border ${
                    inputMode === "text"
                      ? "bg-var(--accent-primary) text-white border-var(--accent-primary) shadow-[0_4px_12px_var(--accent-glow)]"
                      : "bg-[#1e1e24] text-[#9090a8] border-transparent hover:border-var(--glass-border)"
                  }`}
                >
                  <MessageSquare size={12} />
                  Text
                </button>
              </div>

              {/* Dynamic Action Inputs */}
              {inputMode === "voice" ? (
                <div className="flex flex-col gap-4">
                  {/* Realtime voice indicators */}
                  {voiceError && (
                    <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-red-400 text-xs flex items-center gap-2 animate-shake">
                      <AlertCircle size={14} />
                      <span>{voiceError}</span>
                    </div>
                  )}

                  {/* Transcript box when recording/recorded */}
                  {transcript && (
                    <div className="p-4 bg-black/30 border border-var(--glass-border) rounded-xl max-h-24 overflow-y-auto">
                      <p className="text-xs text-[#9090a8] font-bold uppercase tracking-wider mb-1">
                        Speech Output (Live Preview)
                      </p>
                      <p className="text-sm text-gray-300">{transcript}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    {/* Secondary Actions */}
                    <button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1e1e24] hover:bg-[#25252e] text-[#9090a8] hover:text-white transition-colors border border-var(--glass-border) text-xs font-bold uppercase tracking-wider"
                    >
                      <SkipForward size={14} />
                      Skip
                    </button>

                    {/* Microphone Action Button (Task 3d) */}
                    <div className="flex items-center gap-3">
                      {phase === "thinking" ? (
                        // Loader Spinner for Thinking State
                        <button
                          disabled
                          className="w-16 h-16 rounded-full flex items-center justify-center bg-[#1e1e24] border border-var(--glass-border) cursor-not-allowed opacity-60"
                        >
                          <Loader2 className="w-6 h-6 text-var(--accent-primary) animate-spin" />
                        </button>
                      ) : (
                        // Interactive recording button
                        <motion.button
                          onClick={toggleRecording}
                          disabled={isSpeaking || isGenerating}
                          className="w-16 h-16 rounded-full flex items-center justify-center relative text-white border-4 border-transparent outline-none focus:outline-none"
                          style={{
                            backgroundColor: isRecording ? "#DC2626" : "var(--accent-primary)",
                          }}
                          animate={
                            isRecording
                              ? {
                                  scale: [1, 1.06, 1],
                                  borderColor: ["var(--accent-primary)", "var(--accent-secondary)", "var(--accent-primary)"],
                                }
                              : { scale: 1, borderColor: "transparent" }
                          }
                          transition={{
                            duration: 1.2,
                            repeat: isRecording ? Infinity : 0,
                            ease: "easeInOut",
                          }}
                        >
                          {isRecording ? <MicOff size={22} /> : <Mic size={22} />}
                          {isRecording && (
                            <span className="absolute inset-0 rounded-full border-2 border-white animate-ping opacity-25" />
                          )}
                        </motion.button>
                      )}

                      {/* Micro Audio visualizer next to mic when listening (Task 3c) */}
                      {phase === "listening" && (
                        <div className="w-24">
                          <AudioVisualizer isActive={true} color="var(--accent-secondary)" />
                        </div>
                      )}
                    </div>

                    {/* Submit Answer */}
                    <button
                      onClick={handleSubmit}
                      disabled={!transcript.trim() || phase === "thinking"}
                      className="px-5 py-3 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.2)] disabled:shadow-none"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-end">
                  <textarea
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={3}
                    className="flex-1 px-4 py-3 bg-[#0e0e11] border border-var(--glass-border) focus:border-var(--accent-primary) rounded-xl text-[#f0f0f5] placeholder-[#9090a8] outline-none transition-colors resize-none text-sm"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleNext}
                      className="px-4 py-2 bg-[#1e1e24] hover:bg-[#25252e] text-[#9090a8] hover:text-white border border-var(--glass-border) rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!textAnswer.trim() || phase === "thinking"}
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold uppercase tracking-wider text-white shadow-[0_4px_12px_rgba(16,185,129,0.2)] disabled:shadow-none transition-all"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Loading Overlay for Final Evaluation */}
      {isEvaluatingAll && (
        <div className="fixed inset-0 bg-black/80 backdrop-filter backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-var(--surface-2) rounded-2xl border border-var(--glass-border) p-8 text-center max-w-sm glass-panel shadow-2xl">
            <Loader2 className="w-12 h-12 text-var(--accent-primary) animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Analyzing Interview</h3>
            <p className="text-xs text-[#9090a8] leading-relaxed">
              Evaluating transcripts and computing final communications metrics. Please wait...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
