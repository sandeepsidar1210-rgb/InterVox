import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import voiceInterviewService, { QuestionData, InterviewStats, Evaluation } from '../../services/voiceInterview.service';
import { Mic, MicOff, SkipForward, Pause, Play, StopCircle } from 'lucide-react';
import { useSarvamTTS } from '../../hooks/useSarvamTTS';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';


interface VoiceInterviewReport {
  overallScore: number;
  grade: string;
  sectionScores: any;
  strengths: string[];
  weaknesses: string[];
  detailedQuestionAnalysis: any[];
  improvementPlan: string[];
}

export default function VoiceInterviewPage() {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const interviewConfig = location.state as any || {};

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<Evaluation | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 10 });
  const [status, setStatus] = useState<'idle' | 'speaking' | 'listening' | 'evaluating'>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [report, setReport] = useState<VoiceInterviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<string | null>(null);
  const [showPlayButton, setShowPlayButton] = useState(false);

  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null);
  const silenceTimeout = useRef<NodeJS.Timeout | null>(null);

  const { speak, stop: stopSpeaking, isSpeaking } = useSarvamTTS();
  const { 
    transcript: liveTranscript, 
    startListening: startVoiceRecognition, 
    stopListening: stopVoiceRecognition, 
    resetTranscript,
    isListening: isVoiceRecognitionListening
  } = useVoiceRecognition();

  const playQuestionWithDelay = async (
    audio: string | null,
    text: string | undefined,
    delayMs: number = 0,
    isFollowUp: boolean = false
  ) => {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    setStatus('speaking');
    setShowPlayButton(false);
    setError(null);
    if (audio) {
      try {
        await voiceInterviewService.playAudio(audio);
        setStatus('idle');
        return;
      } catch (error) {
        console.error('Audio playback error, falling back to TTS:', error);
      }
    }

    if (text) {
      try {
        await speak(text, { language: 'en-IN', speaker: 'amit' });
      } catch (err) {
        console.error('TTS error:', err);
        setShowPlayButton(true);
      } finally {
        setStatus('idle');
      }
    } else {
      setStatus('idle');
    }
  };

  // Sync live transcript to view during recording
  useEffect(() => {
    if (isVoiceRecognitionListening || isRecording) {
      setCurrentTranscript(liveTranscript);
    }
  }, [liveTranscript, isVoiceRecognitionListening, isRecording]);

  // Initialize interview
  useEffect(() => {
    initializeInterview();

    // Listen for autoplay blocked event
    const handleAutoplayBlocked = (event: any) => {
      console.warn('Autoplay blocked, showing manual play button');
      setShowPlayButton(true);
      setStatus('idle');
    };

    window.addEventListener('audio-autoplay-blocked', handleAutoplayBlocked);

    return () => {
      cleanup();
      window.removeEventListener('audio-autoplay-blocked', handleAutoplayBlocked);
    };
  }, []);

  const initializeInterview = async () => {
    try {
      setStatus('idle');
      
      // Get auth token from localStorage or create temporary one
      let token = localStorage.getItem('token');
      if (!token) {
        // Create temporary demo token for testing
        token = 'demo-token-' + Date.now();
        console.log('Using demo token for testing');
      }

      // Connect to voice interview socket
      await voiceInterviewService.connect(token);
      setIsConnected(true);

      // Register event listeners
      registerEventListeners();

      // Get or create userId
      let userId = localStorage.getItem('userId');
      if (!userId) {
        userId = 'demo-user-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
      }

      // Get interview configuration from navigation state or use defaults
  const jobRole = interviewConfig.jobRole || 'Software Engineer';
  const interviewType = interviewConfig.interviewType || 'TECHNICAL';
  const difficulty = interviewConfig.difficulty || 'MEDIUM';

  console.log('Starting interview with config:', { jobRole, interviewType, difficulty });

  // Check voice input preference
  const prefString = localStorage.getItem('intervox_preferences');
  let autoStartMic = true;
  if (prefString) {
    try {
      const prefs = JSON.parse(prefString);
      if (prefs.voiceInput === false) {
        autoStartMic = false;
        console.log('Voice input disabled by preference');
      }
    } catch {}
  }

  // Generate interviewId if not provided
  const currentInterviewId = interviewId || 'interview-' + Date.now();

      // Initialize interview with timeout
      const initPromise = voiceInterviewService.initInterview({
        userId,
        interviewId: currentInterviewId,
        jobRole,
        interviewType,
        difficulty,
        maxQuestions: 10,
      });

      // Wait for initialization or timeout after 30 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Interview initialization timeout - no response from server')), 30000);
      });

      await Promise.race([initPromise, timeoutPromise]);

    } catch (error) {
      console.error('Initialization error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError('Failed to initialize interview: ' + errorMessage);
      setIsConnected(false);
    }
  };

  const registerEventListeners = () => {
    // Interview initialized
    voiceInterviewService.on('interview-initialized', handleInterviewInitialized);

    // Recording events
    voiceInterviewService.on('recording-started', handleRecordingStarted);

    // Transcription events
    voiceInterviewService.on('transcribing', (data: any) => {
      setStatus('evaluating');
      console.log('Transcribing...', data);
    });

    voiceInterviewService.on('transcription-complete', handleTranscriptionComplete);

    // Evaluation events
    voiceInterviewService.on('evaluating', (data: any) => {
      setStatus('evaluating');
      console.log('Evaluating...', data);
    });

    voiceInterviewService.on('answer-evaluated', handleAnswerEvaluated);
    voiceInterviewService.on('evaluation', handleAnswerEvaluated);

    // Question events
    voiceInterviewService.on('next-question', handleNextQuestion);

    // Also listen for 'new-question' just in case
    voiceInterviewService.on('new-question', handleNextQuestion);

    voiceInterviewService.on('encouragement', handleEncouragement);

    // Stats events
    voiceInterviewService.on('stats-update', handleStatsUpdate);

    // Completion events
    voiceInterviewService.on('interview-limit-reached', (data: any) => {
      console.log('Interview limit reached:', data);
    });

    voiceInterviewService.on('interview-completed', handleInterviewCompleted);

    // Error events
    voiceInterviewService.on('interview-error', handleError);

    // Test audio result
    voiceInterviewService.on('test-audio-result', (data: any) => {
      console.log('Audio test:', data);
    });
  };

  const handleInterviewInitialized = async (data: any) => {
    console.log('Interview initialized:', data);
    setIsInitialized(true);
    setCurrentQuestion(data.question);
    setCurrentAudio(data.audio);
    setProgress({ current: 1, total: 10 });
    setStatus('idle');
    await playQuestionWithDelay(data.audio || null, data.question, 400, false);
  };

  useEffect(() => {
    if (isInitialized && !isSpeaking && !isRecording && status === 'idle' && currentQuestion) {
      const timer = setTimeout(() => {
        handleStartRecording().catch(() => {});
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, isSpeaking, isRecording, status, currentQuestion]);

  const handleRecordingStarted = (data: any) => {
    console.log('Recording started:', data);
    setIsRecording(true);
    setStatus('listening');

    // Start audio level monitoring
    startAudioLevelMonitoring();

    // Start silence detection
    startSilenceDetection();

    // Start live transcription
    resetTranscript();
    startVoiceRecognition();
  };
  


  const handleTranscriptionComplete = (data: any) => {
    // Prefer client-side transcription if available
    if (liveTranscript) {
        console.log('Using client-side transcription:', liveTranscript);
        // Do nothing, trust liveTranscript
    } else {
        console.log('Transcription:', data.transcription);
        setCurrentTranscript(data.transcription);
        setTranscript(prev => [...prev, data.transcription]);
    }
  };

  const handleAnswerEvaluated = (data: Evaluation) => {
    console.log('Evaluation:', data);
    setLastEvaluation(data);
  };

  const handleNextQuestion = async (data: QuestionData) => {
    console.log('Next question:', data);
    setCurrentQuestion(data.question);
    setCurrentAudio(data.audio);
    setCurrentTranscript('');
    setStatus('idle');
    setLastEvaluation(null);
    setShowPlayButton(false);

    if (data.currentProgress) {
      setProgress({
        current: data.currentProgress.questionsAsked,
        total: data.currentProgress.maxQuestions,
      });
    }

    const spokenText = data.isFollowUp
      ? `Here is a follow-up question. ${data.question}`
      : data.question;

    await playQuestionWithDelay(
      data.audio || null,
      spokenText,
      data.isFollowUp ? 500 : 400,
      data.isFollowUp
    );

    // Auto-start recording 1s after speaking finishes (if enabled)
    // Check pref again to be safe
    const prefString = localStorage.getItem('intervox_preferences');
    let shouldAutoRecord = true;
    if (prefString) {
      try {
        const prefs = JSON.parse(prefString);
        if (prefs.voiceInput === false) shouldAutoRecord = false;
      } catch {}
    }

    if (shouldAutoRecord) {
      setTimeout(() => {
        if (!isRecording && status !== 'listening') {
          console.log('🎙️ Auto-starting recording...');
          handleStartRecording();
        }
      }, 1000); // 1s delay after speaking
    }
  };

  const handleEncouragement = async (data: any) => {
    console.log('Encouragement:', data.message);
    await voiceInterviewService.playAudio(data.audio);
  };

  const handleStatsUpdate = (data: InterviewStats) => {
    console.log('Stats update:', data);
    setStats(data);
  };

  const handleInterviewCompleted = (data: any) => {
    console.log('Interview completed:', data);
    setReport(data.report);
    setStatus('idle');
  };

  const handleError = (error: any) => {
    console.error('Interview error:', error);
    setError(error.error);
    setStatus('idle');
  };

  const startAudioLevelMonitoring = () => {
    if (audioLevelInterval.current) {
      clearInterval(audioLevelInterval.current);
    }

    audioLevelInterval.current = setInterval(() => {
      const level = voiceInterviewService.getAudioLevel();
      setAudioLevel(level);
    }, 100);
  };

  const stopAudioLevelMonitoring = () => {
    if (audioLevelInterval.current) {
      clearInterval(audioLevelInterval.current);
      audioLevelInterval.current = null;
    }
    setAudioLevel(0);
  };

  const startSilenceDetection = () => {
    if (silenceTimeout.current) {
      clearTimeout(silenceTimeout.current);
    }

    // Detect silence after 5 seconds of no speech
    silenceTimeout.current = setTimeout(() => {
      console.log('Silence detected, requesting encouragement');
      voiceInterviewService.handleSilence(5000);
      
      // Reset for next detection
      startSilenceDetection();
    }, 5000);
  };

  const resetSilenceDetection = () => {
    if (silenceTimeout.current) {
      clearTimeout(silenceTimeout.current);
    }
  };

  const handleStartRecording = async () => {
    try {
      setError(null); // Clear any previous errors
      await voiceInterviewService.startRecording();
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Recording error:', error);
      setError('Failed to start recording. Please check microphone permissions.');
    }
  };

  const handleStopRecording = () => {
    voiceInterviewService.stopRecording();
    setIsRecording(false);
    setStatus('evaluating');
    stopAudioLevelMonitoring();
    resetSilenceDetection();
    stopVoiceRecognition();
    
    // Add to completed transcripts
    if (liveTranscript) {
        setTranscript(prev => [...prev, liveTranscript]);
    }
  };

  const handleSkipQuestion = () => {
    if (isRecording) {
      handleStopRecording();
    }
    voiceInterviewService.skipQuestion();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      voiceInterviewService.resumeInterview();
    } else {
      voiceInterviewService.pauseInterview();
    }
    setIsPaused(!isPaused);
  };

  const handleEndInterview = () => {
    if (window.confirm('Are you sure you want to end the interview?')) {
      voiceInterviewService.endInterview();
    }
  };

  const handleManualPlayAudio = async () => {
    if (currentAudio) {
      setStatus('speaking');
      setShowPlayButton(false);
      setError(null);
      try {
        await voiceInterviewService.playAudio(currentAudio, 1); // Only 1 retry for manual play
        setStatus('idle');
      } catch (error) {
        console.error('Manual audio playback error:', error);
        setShowPlayButton(true);
        setError('Audio playback failed. Please check your speakers.');
      }
    }
  };

  const cleanup = () => {
    stopAudioLevelMonitoring();
    resetSilenceDetection();
    voiceInterviewService.disconnect();
  };

  if (report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gray-800/50 border-blue-500/30">
            <CardHeader>
              <CardTitle className="text-3xl text-white">Interview Completed! 🎉</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Score */}
              <div className="text-center p-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
                <div className="text-6xl font-bold text-white mb-2">{report.overallScore}</div>
                <div className="text-2xl text-white/90">Grade: {report.grade}</div>
              </div>

              {/* Section Scores */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(report.sectionScores).map(([key, value]) => (
                  <div key={key} className="bg-gray-700/50 p-4 rounded-lg">
                    <div className="text-sm text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                    <div className="text-2xl font-bold text-white">{value as number}</div>
                  </div>
                ))}
              </div>

              {/* Strengths */}
              <div>
                <h3 className="text-xl font-bold text-green-400 mb-3">✅ Strengths</h3>
                <ul className="space-y-2">
                  {report.strengths.map((strength, idx) => (
                    <li key={idx} className="text-gray-300 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div>
                <h3 className="text-xl font-bold text-orange-400 mb-3">⚠️ Areas for Improvement</h3>
                <ul className="space-y-2">
                  {report.weaknesses.map((weakness, idx) => (
                    <li key={idx} className="text-gray-300 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{weakness}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvement Plan */}
              <div>
                <h3 className="text-xl font-bold text-blue-400 mb-3">📚 Improvement Plan</h3>
                <ul className="space-y-2">
                  {report.improvementPlan.map((item, idx) => (
                    <li key={idx} className="text-gray-300 flex items-start">
                      <span className="mr-2">{idx + 1}.</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-4">
                <Button onClick={() => navigate('/dashboard')} className="flex-1">
                  Back to Dashboard
                </Button>
                <Button onClick={() => navigate('/history')} variant="outline" className="flex-1">
                  View History
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-gray-800/50 border-blue-500/30">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-2xl text-white">AI Voice Interview</CardTitle>
              <Badge variant={isConnected ? 'default' : 'destructive'}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Progress */}
        <Card className="bg-gray-800/50 border-blue-500/30">
          <CardContent className="pt-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Question {progress.current} of {progress.total}</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Current Question */}
            <Card className="bg-gray-800/50 border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-lg text-white">Current Question</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl text-gray-300 leading-relaxed">{currentQuestion || 'Initializing interview...'}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Badge className="flex items-center gap-1" variant={status === 'speaking' ? 'default' : 'secondary'}>
                    {status === 'speaking' && (
                      <>
                        <span className="animate-pulse">🔊</span>
                        <span>AI Speaking</span>
                      </>
                    )}
                    {status === 'listening' && (
                      <>
                        <span className="animate-pulse">🎤</span>
                        <span>Listening to You</span>
                      </>
                    )}
                    {status === 'evaluating' && (
                      <>
                        <span className="animate-spin">⚙️</span>
                        <span>Analyzing Response</span>
                      </>
                    )}
                    {status === 'idle' && (
                      <>
                        <span>💤</span>
                        <span>Ready - Click to Answer</span>
                      </>
                    )}
                  </Badge>
                  {status === 'speaking' && (
                    <div className="flex space-x-1">
                      <div className="w-1 h-4 bg-blue-500 rounded animate-pulse" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1 h-4 bg-blue-400 rounded animate-pulse" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1 h-4 bg-blue-300 rounded animate-pulse" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  )}
                  {showPlayButton && currentAudio && (
                    <Button 
                      onClick={handleManualPlayAudio} 
                      size="sm" 
                      variant="outline"
                      className="ml-auto border-blue-500 text-blue-400 hover:bg-blue-500/20"
                    >
                      <span className="mr-2">🔊</span>
                      Play Question
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recording Controls */}
            <Card className="bg-gray-800/50 border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-lg text-white">Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Recording Button */}
                {!isRecording ? (
                  <Button
                    onClick={handleStartRecording}
                    disabled={!isInitialized || status === 'speaking' || status === 'evaluating'}
                    className="w-full h-16 text-lg"
                    size="lg"
                  >
                    <Mic className="mr-2 h-6 w-6" />
                    Start Answer
                  </Button>
                ) : (
                  <Button
                    onClick={handleStopRecording}
                    variant="destructive"
                    className="w-full h-16 text-lg"
                    size="lg"
                  >
                    <MicOff className="mr-2 h-6 w-6" />
                    Stop Recording
                  </Button>
                )}

                {/* Audio Level Indicator */}
                {isRecording && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Audio Level</span>
                      <span className="text-green-400">{Math.round(audioLevel)}%</span>
                    </div>
                    <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 transition-all duration-100"
                        style={{ width: `${audioLevel}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 text-center">
                      {audioLevel > 0 ? 'Speaking detected' : 'No audio detected'}
                    </div>
                  </div>
                )}

                {/* Secondary Controls */}
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={handleSkipQuestion} variant="outline" size="sm">
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip
                  </Button>
                  <Button onClick={handlePauseResume} variant="outline" size="sm">
                    {isPaused ? (
                      <><Play className="h-4 w-4 mr-1" /> Resume</>
                    ) : (
                      <><Pause className="h-4 w-4 mr-1" /> Pause</>
                    )}
                  </Button>
                  <Button onClick={handleEndInterview} variant="destructive" size="sm">
                    <StopCircle className="h-4 w-4 mr-1" />
                    End
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Last Evaluation */}
            {lastEvaluation && (
              <Card className="bg-gray-800/50 border-blue-500/30 animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-lg text-white">Last Answer Feedback</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Score</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-bold ${
                        lastEvaluation.score >= 75 ? 'text-green-400' :
                        lastEvaluation.score >= 50 ? 'text-yellow-400' :
                        'text-orange-400'
                      }`}>
                        {lastEvaluation.score}/100
                      </span>
                      {lastEvaluation.score >= 75 && <span className="text-xl">🎉</span>}
                      {lastEvaluation.score >= 50 && lastEvaluation.score < 75 && <span className="text-xl">👍</span>}
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{lastEvaluation.feedback}</p>
                  {lastEvaluation.keyPointsCovered.length > 0 && (
                    <div>
                      <div className="text-xs text-green-400 font-semibold mb-1">✓ Key Points Covered</div>
                      <div className="flex flex-wrap gap-1">
                        {lastEvaluation.keyPointsCovered.map((point: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-xs bg-green-500/20 text-green-300">
                            {point}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {lastEvaluation.missedPoints && lastEvaluation.missedPoints.length > 0 && (
                    <div>
                      <div className="text-xs text-orange-400 font-semibold mb-1">⚠ Areas to Improve</div>
                      <div className="flex flex-wrap gap-1">
                        {lastEvaluation.missedPoints.map((point: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs text-orange-300 border-orange-500/30">
                            {point}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {lastEvaluation.fillerWordsCount > 0 && (
                    <div className="text-xs text-gray-400">
                      Filler words detected: {lastEvaluation.fillerWordsCount}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Live Stats */}
            {stats && (
              <Card className="bg-gray-800/50 border-blue-500/30">
                <CardHeader>
                  <CardTitle className="text-lg text-white">Performance Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-white">{stats.currentScore}</div>
                    <div className="text-sm text-gray-400">Current Score</div>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(stats.sectionScores).map(([key, value]) => (
                      <div key={key}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <span className="text-white font-semibold">{value as number}</span>
                        </div>
                        <Progress value={value as number} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            <Card className="bg-gray-800/50 border-blue-500/30">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg text-white">Live Transcript</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {transcript.length} response{transcript.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto styled-scrollbar">
                  {currentTranscript && (
                    <div className="p-3 bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-500/50 rounded-lg animate-fade-in">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        <div className="text-xs text-blue-300 font-semibold">Live - You</div>
                      </div>
                      <p className="text-gray-200 text-sm leading-relaxed">{currentTranscript}</p>
                    </div>
                  )}
                  {status === 'evaluating' && (
                    <div className="p-3 bg-gray-700/30 border border-gray-600/30 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <div className="animate-spin">⚙️</div>
                        <span>AI is evaluating your response...</span>
                      </div>
                    </div>
                  )}
                  {transcript.slice().reverse().map((text, idx) => (
                    <div key={idx} className="p-3 bg-gray-700/30 border border-gray-600/20 rounded-lg hover:bg-gray-700/40 transition-colors">
                      <div className="text-xs text-gray-500 mb-1">Response #{transcript.length - idx}</div>
                      <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
                    </div>
                  ))}
                  {transcript.length === 0 && !currentTranscript && (
                    <div className="text-center py-8 text-gray-500">
                      <Mic className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Your responses will appear here</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="bg-red-900/30 border-red-500/50">
            <CardContent className="pt-6">
              <p className="text-red-300">⚠️ {error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
