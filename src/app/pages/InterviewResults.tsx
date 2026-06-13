import { useState, useEffect } from "react";
import { supabase } from "../../utils/supabase";
import { useNavigate, useLocation } from "react-router";
import {
  ChevronLeft,
  Share2,
  RotateCcw,
  Trophy,
  MessageSquare,
  Brain,
  Target,
  Video,
  ChevronDown,
  Lightbulb,
  CheckCircle2,
  Download,
  Calendar,
  Clock,
  Check,
  AlertTriangle,
  Home,
  Sparkles,
  TrendingUp,
  Zap,
  Pause,
  Save,
  Copy,
} from "lucide-react";
import { motion } from "framer-motion";
import SaveInterviewModal from "../components/SaveInterviewModal";
import { PageLoader } from "../components";
import { saveInterviewSession, getInterviewSession } from "../../utils/interviewStorage";
import * as db from "../../utils/db";
import * as Accordion from "@radix-ui/react-accordion";
import { useCountUp } from "../../hooks/useCountUp";
import RadarChart from "../components/results/RadarChart";

// Mock data for the interview results
const mockResultData = {
  overallScore: 88,
  date: "March 2, 2026",
  duration: "24 min 32 sec",
  role: "Software Engineer",
  level: "Mid Level",
  summary: "You delivered a strong interview performance with excellent technical knowledge and clear communication. Your responses demonstrated solid problem-solving skills and relevant experience. Focus on providing more specific examples and maintaining better eye contact to enhance your presentation. Overall, you're well-prepared for mid-level software engineering roles.",
  strengths: [
    "Strong technical knowledge with specific examples and metrics",
    "Clear and structured responses using logical flow",
    "Good use of industry terminology and best practices",
  ],
  weaknesses: [
    "Could provide more context about team collaboration and leadership",
    "Body language and eye contact need improvement",
    "Responses could be more concise and focused on key points",
  ],
  metrics: [
    {
      label: "Technical Accuracy",
      score: 92,
      icon: Brain,
      color: "#10B981",
      feedback: "Excellent technical knowledge demonstrated",
    },
    {
      label: "Communication Clarity",
      score: 85,
      icon: MessageSquare,
      color: "#3B82F6",
      feedback: "Clear and well-structured responses",
    },
    {
      label: "Keyword Coverage",
      score: 88,
      icon: Target,
      color: "#8B5CF6",
      feedback: "Good use of industry terminology",
    },
    {
      label: "Body Language",
      score: 82,
      icon: Video,
      color: "#F59E0B",
      feedback: "Maintain more eye contact",
    },
  ],
  questions: [
    {
      id: 1,
      question: "Tell me about yourself and your background.",
      yourAnswer:
        "I'm a software engineer with 4 years of experience, primarily working with React and Node.js. I've led several projects involving microservices architecture and have a strong passion for creating scalable web applications. In my current role at TechCorp, I've worked on improving our application's performance by 40% through code optimization and better caching strategies.",
      idealAnswer:
        "A strong answer should include: (1) A brief professional summary highlighting your current role and years of experience, (2) Key technical skills and areas of expertise, (3) Notable achievements or projects that demonstrate your capabilities, (4) What motivates you professionally and how it aligns with the role you're applying for.",
      score: 90,
      improvements: [
        "Consider adding more specific quantifiable achievements",
        "Connect your experience more directly to the target role",
        "Include what you're currently learning or improving",
      ],
    },
    {
      id: 2,
      question: "What are your greatest strengths and how have you applied them in your previous role?",
      yourAnswer:
        "My greatest strength is problem-solving. I approach challenges systematically by breaking them down into smaller components. For example, when our API response times were slow, I analyzed the bottlenecks, implemented caching, and optimized database queries, which reduced response time by 60%.",
      idealAnswer:
        "An effective response should: (1) Identify 2-3 key strengths relevant to the role, (2) Provide specific examples using the STAR method, (3) Show measurable impact of these strengths, (4) Demonstrate self-awareness and continuous improvement.",
      score: 88,
      improvements: [
        "Mention 2-3 strengths instead of just one",
        "Use the STAR method more explicitly (Situation, Task, Action, Result)",
        "Explain how these strengths differentiate you from others",
      ],
    },
    {
      id: 3,
      question: "Describe a challenging project you worked on and how you overcame obstacles.",
      yourAnswer:
        "I worked on migrating our monolithic application to microservices. The main challenge was maintaining zero downtime. We used a strangler fig pattern, gradually replacing components while keeping the old system running. This took 6 months but resulted in better scalability and easier maintenance.",
      idealAnswer:
        "A comprehensive answer includes: (1) Context about the project and why it was challenging, (2) Specific obstacles you faced, (3) Your approach and decision-making process, (4) How you collaborated with others, (5) Tangible outcomes and lessons learned.",
      score: 85,
      improvements: [
        "Discuss the team dynamics and your leadership role",
        "Elaborate on specific technical challenges you personally solved",
        "Mention what you learned and how it changed your approach",
      ],
    },
  ],
};

// Helper functions to transform evaluation data
function generateSummary(evaluations: any[], overallScore: number): string {
  if (!evaluations || evaluations.length === 0) {
    return "Interview completed. Awaiting evaluation results.";
  }
  
  // Collect all overall_feedback from individual evaluations
  const allFeedback = evaluations
    .map(e => e?.overall_feedback)
    .filter(f => f && f.length > 0);
  
  if (allFeedback.length === 0) {
    // Fallback if no feedback available
    const avgScore = overallScore;
    if (avgScore >= 85) {
      return "You delivered an excellent interview performance with strong technical knowledge and clear communication. Your responses demonstrated solid problem-solving skills and relevant experience. Continue this level of preparation for future interviews.";
    } else if (avgScore >= 70) {
      return "You delivered a good interview performance with decent technical knowledge. Your responses showed understanding of key concepts. Focus on providing more specific examples and improving clarity to enhance your presentation.";
    } else {
      return "Your interview showed potential but needs improvement. Focus on strengthening your technical fundamentals and practice providing clearer, more structured responses. Review the feedback below for specific areas to work on.";
    }
  }
  
  // Synthesize a comprehensive summary from all feedback
  const avgScore = overallScore;
  let summary = "";
  
  if (avgScore >= 85) {
    summary = `🎯 Exceptional Performance: You demonstrated strong technical expertise throughout the interview. `;
  } else if (avgScore >= 70) {
    summary = `📈 Good Performance: You showed solid understanding of key concepts with room for growth. `;
  } else if (avgScore >= 50) {
    summary = `💡 Developing Performance: Your responses showed potential but need more depth and accuracy. `;
  } else {
    summary = `📚 Needs Improvement: Focus on strengthening fundamental concepts and providing clearer responses. `;
  }
  
  // Add specific insights from evaluations
  const totalQuestions = evaluations.length;
  const highScoring = evaluations.filter(e => e.final_score >= 80).length;
  const needsWork = evaluations.filter(e => e.final_score < 60).length;
  
  if (highScoring > totalQuestions * 0.6) {
    summary += `You performed well on ${highScoring} out of ${totalQuestions} questions, showing consistent technical knowledge. `;
  } else if (needsWork > totalQuestions * 0.4) {
    summary += `Several responses need improvement - review the detailed feedback below to identify key areas. `;
  }
  
  // Add the most relevant feedback point
  if (allFeedback.length > 0) {
    // Take feedback from the question with median score
    const sortedEvals = [...evaluations].sort((a, b) => b.final_score - a.final_score);
    const medianFeedback = sortedEvals[Math.floor(sortedEvals.length / 2)]?.overall_feedback;
    if (medianFeedback) {
      summary += medianFeedback;
    }
  }
  
  return summary;
}

function extractStrengths(evaluations: any[]): string[] {
  if (!evaluations || evaluations.length === 0) return [];
  
  const strengths: string[] = [];
  evaluations.forEach(e => {
    if (e?.strengths && Array.isArray(e.strengths)) {
      // Each evaluation can contribute multiple strengths
      strengths.push(...e.strengths);
    }
  });
  
  // Remove duplicates and return top 5 most common strengths
  const uniqueStrengths = Array.from(new Set(strengths));
  return uniqueStrengths.slice(0, 5);
}

function extractWeaknesses(evaluations: any[]): string[] {
  if (!evaluations || evaluations.length === 0) return [];
  
  const weaknesses: string[] = [];
  evaluations.forEach(e => {
    // Collect missing concepts
    if (e?.missing_concepts && Array.isArray(e.missing_concepts)) {
      weaknesses.push(...e.missing_concepts.map((c: string) => `Missing: ${c}`));
    }
    // Collect improvements
    if (e?.improvements && Array.isArray(e.improvements)) {
      weaknesses.push(...e.improvements);
    }
  });
  
  // Remove duplicates and return top 5
  const uniqueWeaknesses = Array.from(new Set(weaknesses));
  return uniqueWeaknesses.slice(0, 5);
}

function calculateMetrics(evaluations: any[]): any[] {
  if (!evaluations || evaluations.length === 0) {
    return mockResultData.metrics;
  }
  
  // Calculate average scores for each metric
  // Backend returns score_breakdown with values 0-10
  const technicalScores = evaluations.map(e => (e?.score_breakdown?.technical_accuracy || 0) * 10); // Convert 0-10 to 0-100
  const clarityScores = evaluations.map(e => (e?.score_breakdown?.clarity_score || 0) * 10);
  const keywordScores = evaluations.map(e => (e?.score_breakdown?.keyword_score || 0) * 10);
  const depthScores = evaluations.map(e => (e?.score_breakdown?.depth_score || 0) * 10);
  const embeddingScores = evaluations.map(e => (e?.score_breakdown?.embedding_score || 0) * 10);
  
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  return [
    {
      label: "Technical Accuracy",
      score: Math.round(avg(technicalScores)),
      icon: Brain,
      color: "#10B981",
      feedback: avg(technicalScores) >= 80 ? "Excellent technical knowledge" : "Work on technical fundamentals",
    },
    {
      label: "Communication Clarity",
      score: Math.round(avg(clarityScores)),
      icon: MessageSquare,
      color: "#3B82F6",
      feedback: avg(clarityScores) >= 80 ? "Clear and well-structured" : "Practice clearer communication",
    },
    {
      label: "Keyword Coverage",
      score: Math.round(avg(keywordScores)),
      icon: Target,
      color: "#8B5CF6",
      feedback: avg(keywordScores) >= 80 ? "Good use of terminology" : "Learn more industry terms",
    },
    {
      label: "Content Depth",
      score: Math.round(avg(depthScores)),
      icon: Video,
      color: "#F59E0B",
      feedback: avg(depthScores) >= 80 ? "Detailed responses" : "Provide more detailed answers",
    },
  ];
}

function MetricCard({
  label,
  score,
  icon: Icon,
  color,
  feedback,
}: {
  label: string;
  score: number;
  icon: any;
  color: string;
  feedback: string;
}) {
  const getScoreColor = (s: number) => {
    if (s >= 85) return "#34D399";
    if (s >= 70) return "#FBBF24";
    return "#F87171";
  };

  return (
    <div
      className="glass-panel p-5 flex flex-col gap-4 hover:border-glass-border/30 transition-all hover:-translate-y-0.5 duration-300"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: color + "20" }}
          >
            <Icon size={18} strokeWidth={2} style={{ color }} />
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: "0.875rem",
                color: "var(--text-primary)",
                marginBottom: "2px",
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
              }}
            >
              {feedback}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex-1">
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${score}%`,
                backgroundColor: getScoreColor(score),
              }}
            />
          </div>
        </div>
        <span
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: "1.5rem",
            color: getScoreColor(score),
            marginLeft: "12px",
          }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

function QuestionAccordion({
  question,
  index,
}: {
  question: (typeof resultData.questions)[0];
  index: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const getScoreColor = (s: number) => {
    if (s >= 85) return "#34D399";
    if (s >= 70) return "#FBBF24";
    return "#F87171";
  };

  const getScoreBg = (s: number) => {
    if (s >= 85) return "rgba(16, 185, 129, 0.15)";
    if (s >= 70) return "rgba(245, 158, 11, 0.15)";
    return "rgba(239, 68, 68, 0.15)";
  };

  return (
    <div
      className="glass-panel overflow-hidden transition-all duration-300"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-start gap-4 flex-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(108, 92, 231, 0.15)" }}
          >
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: "0.875rem",
                color: "var(--accent-primary)",
              }}
            >
              {index + 1}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "var(--text-primary)",
                lineHeight: 1.5,
              }}
            >
              {question.question}
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: getScoreBg(question.score),
            }}
          >
            <CheckCircle2 size={12} strokeWidth={2.5} style={{ color: getScoreColor(question.score) }} />
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: "0.8rem",
                color: getScoreColor(question.score),
              }}
            >
              {question.score}%
            </span>
          </div>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`text-text-secondary ml-3 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-0 flex flex-col gap-5 border-t border-glass-border">
          {/* Your Answer */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={14} className="text-primary" strokeWidth={2} />
              <h4
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  color: "var(--text-primary)",
                }}
              >
                Your Answer
              </h4>
            </div>
            <div
              className="p-4 rounded-xl border border-glass-border bg-white/5"
            >
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.875rem",
                  color: "var(--text-primary)",
                  lineHeight: 1.7,
                }}
              >
                {question.yourAnswer}
              </p>
            </div>
          </div>

          {/* Ideal Answer */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} className="text-emerald-400" strokeWidth={2} />
              <h4
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  color: "var(--text-primary)",
                }}
              >
                Ideal Answer Framework
              </h4>
            </div>
            <div
              className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
            >
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.875rem",
                  color: "emerald-200",
                  lineHeight: 1.7,
                }}
              >
                {question.idealAnswer}
              </p>
            </div>
          </div>

          {/* Improvement Suggestions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={14} className="text-amber-400" strokeWidth={2} />
              <h4
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  color: "var(--text-primary)",
                }}
              >
                Improvement Suggestions
              </h4>
            </div>
            <ul className="flex flex-col gap-2">
              {question.improvements.map((improvement, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                    style={{ backgroundColor: "var(--accent-secondary)" }}
                  />
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.875rem",
                      color: "amber-200",
                      lineHeight: 1.6,
                    }}
                  >
                    {improvement}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function getScoreGrade(score: number) {
  if (score >= 90) return { grade: 'A', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
  if (score >= 80) return { grade: 'B', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
  if (score >= 70) return { grade: 'C', color: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
  if (score >= 60) return { grade: 'D', color: 'bg-red-500/10 text-red-400 border-red-500/25' };
  return { grade: 'F', color: 'bg-red-500/10 text-red-400 border-red-500/25' };
}

function computeRadarScores(evaluations: any[], communicationAnalytics: any[]) {
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  let wpm = 135;
  let fillerWordCount = 3;
  let fluencyScore = 85;

  if (communicationAnalytics && communicationAnalytics.length > 0) {
    const totalWPM = communicationAnalytics.reduce((sum: number, a: any) => sum + (a.metrics?.wordsPerMinute || a.wpm || 0), 0);
    wpm = Math.round(totalWPM / communicationAnalytics.length) || 135;

    const totalFillers = communicationAnalytics.reduce((sum: number, a: any) => sum + (a.metrics?.fillerWords?.count ?? a.fillerWordCount ?? 0), 0);
    fillerWordCount = totalFillers;

    const totalFluency = communicationAnalytics.reduce((sum: number, a: any) => sum + (a.metrics?.fluencyScore || a.fluencyScore || 0), 0);
    fluencyScore = Math.round(totalFluency / communicationAnalytics.length) || 85;
  }

  const technicalScores = evaluations.map(e => {
    if (e.technicalScore !== undefined) return e.technicalScore;
    if (e.score_breakdown?.technical_accuracy !== undefined) return e.score_breakdown.technical_accuracy * 10;
    return (e.score ?? e.final_score ?? 0);
  });

  const problemSolvingScores = evaluations.map(e => {
    if (e.depth !== undefined) return e.depth;
    if (e.score_breakdown?.depth_score !== undefined) return e.score_breakdown.depth_score * 10;
    return (e.score ?? e.final_score ?? 0);
  });

  const relevanceScores = evaluations.map(e => {
    if (e.relevance !== undefined) return e.relevance;
    if (e.score_breakdown?.keyword_score !== undefined) return e.score_breakdown.keyword_score * 10;
    return (e.score ?? e.final_score ?? 0);
  });

  const structureScores = evaluations.map(e => {
    if (e.clarity !== undefined) return e.clarity;
    if (e.score_breakdown?.clarity_score !== undefined) return e.score_breakdown.clarity_score * 10;
    return (e.score ?? e.final_score ?? 0);
  });

  return {
    technicalAccuracy: Math.round(Math.min(100, avg(technicalScores) || 85)),
    communication: Math.round(Math.min(100, fluencyScore)),
    problemSolving: Math.round(Math.min(100, avg(problemSolvingScores) || 80)),
    confidence: Math.round(Math.min(100, Math.max(0, 100 - (fillerWordCount * 4)))),
    relevance: Math.round(Math.min(100, avg(relevanceScores) || 85)),
    structure: Math.round(Math.min(100, avg(structureScores) || 80))
  };
}

function DimensionRow({ label, score }: { label: string, score: number }) {
  const count = useCountUp(score);
  const [width, setWidth] = useState("0%");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(`${score}%`);
    }, 100);
    return () => clearTimeout(timer);
  }, [score]);

  const getBarColor = (s: number) => {
    if (s >= 85) return "bg-emerald-500";
    if (s >= 70) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-center text-sm">
        <span className="font-semibold text-text-secondary">{label}</span>
        <span className="font-extrabold text-white">{count}%</span>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${getBarColor(score)}`}
          style={{ width }}
        />
      </div>
    </div>
  );
}

function CircularProgress({ score }: { score: number }) {
  const radius = 54;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius; // ~339.3
  
  const getLabel = (s: number) => {
    if (s >= 85) return "Excellent";
    if (s >= 70) return "Good";
    return "Needs Work";
  };

  const getStrokeColor = (s: number) => {
    if (s >= 85) return "var(--accent-secondary)";
    if (s >= 70) return "var(--accent-primary)";
    return "#EF4444";
  };

  const color = getStrokeColor(score);

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        {/* Track circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Animated score circle */}
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (score / 100) * circumference }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-extrabold text-white"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            lineHeight: 1,
            textShadow: "0 0 12px var(--accent-glow)"
          }}
        >
          {score}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider text-[#9090a8] mt-1"
          style={{
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {getLabel(score)}
        </span>
      </div>
    </div>
  );
}

export default function InterviewResults() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const staggerItem = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } },
  };
  
  // Get real evaluation data from navigation state
  const {
    questions: realQuestions = [],
    answers: userAnswers = [],
    evaluations = [],
    overallScore: passedOverallScore,
    interviewConfig,
    communicationAnalytics = [],
  } = location.state || {};
  
  const [dbResultData, setDbResultData] = useState<any | null>(null);
  const [dbRadarScores, setDbRadarScores] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryParams = new URLSearchParams(location.search);
  const sessionId = queryParams.get("id") || location.state?.sessionId;

  useEffect(() => {
    if (!sessionId || passedOverallScore !== undefined) return;

    const loadSessionData = async () => {
      setLoading(true);
      setError(null);
      try {
        console.log("Fetching session from Supabase:", sessionId);
        const { data: session, error: sessionErr } = await supabase
          .from("sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (sessionErr) throw sessionErr;

        if (session) {
          const { data: answers, error: answersErr } = await supabase
            .from("answers")
            .select("*")
            .eq("session_id", sessionId)
            .order("question_index", { ascending: true });

          if (answersErr) throw answersErr;

          console.log("Loaded session and answers from Supabase:", session, answers);
          
          // Helper to map answersData to evaluations
          const mappedEvaluations = (answers || []).map(a => {
            const improvements = a.score_data?.improvements 
              || (a.score_data?.gap ? [a.score_data.gap] : []);
            const strengths = a.score_data?.strengths 
              || (a.score_data?.strength ? [a.score_data.strength] : []);
            return {
              final_score: a.score_data?.score !== undefined ? a.score_data.score * 10 : 0,
              overall_feedback: a.score_data?.feedback || '',
              strengths: strengths,
              improvements: improvements,
              score_breakdown: {
                technical_accuracy: a.score_data?.technicalScore || 8,
                clarity_score: a.score_data?.clarity || 8,
                keyword_score: a.score_data?.relevance || 8,
                depth_score: a.score_data?.depth || 8,
                embedding_score: a.score_data?.relevance || 8,
              }
            };
          });

          const mappedQuestions = (answers || []).map((a: any, idx: number) => {
            const scoreVal = a.score_data?.score !== undefined ? a.score_data.score * 10 : 0;
            const improvements = a.score_data?.improvements 
              || (a.score_data?.gap ? [a.score_data.gap] : []);
            const strengths = a.score_data?.strengths 
              || (a.score_data?.strength ? [a.score_data.strength] : []);

            return {
              id: idx + 1,
              question: a.question_text || '',
              yourAnswer: a.answer_transcript || 'No answer provided',
              idealAnswer: a.score_data?.ideal_answer || 'A strong answer should explain the concepts clearly and provide relevant examples.',
              score: scoreVal,
              improvements: improvements,
              strengths: strengths
            };
          });

          const overallScoreVal = session.overall_score !== null ? Math.round(session.overall_score) : 0;

          const mappedResult = {
            overallScore: overallScoreVal,
            date: new Date(session.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            duration: `${session.duration_minutes || 15} min`,
            role: session.domain || 'Software Engineer',
            level: session.difficulty === 'easy' ? 'Entry Level' : session.difficulty === 'hard' ? 'Senior Level' : 'Mid Level',
            summary: generateSummary(mappedEvaluations, overallScoreVal),
            strengths: extractStrengths(mappedEvaluations),
            weaknesses: extractWeaknesses(mappedEvaluations),
            metrics: calculateMetrics(mappedEvaluations),
            questions: mappedQuestions
          };

          setDbResultData(mappedResult);

          const calculatedRadar = {
            technicalAccuracy: session.radar_scores?.technicalAccuracy || 80,
            communication: session.radar_scores?.communication || 80,
            problemSolving: session.radar_scores?.problemSolving || 80,
            confidence: session.radar_scores?.confidence || 80,
            relevance: session.radar_scores?.relevance || 80,
            structure: session.radar_scores?.structure || 80,
          };
          setDbRadarScores(calculatedRadar);
          
          // Cache to IndexedDB for offline access
          try {
            await db.saveSession({
              id: sessionId,
              date: mappedResult.date,
              dateShort: new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              timestamp: new Date(session.created_at).getTime(),
              role: mappedResult.role,
              level: mappedResult.level,
              difficulty: session.difficulty || 'medium',
              score: mappedResult.overallScore,
              duration: mappedResult.duration,
              questions: mappedResult.questions.length,
              questionsAnswered: mappedResult.questions.filter(q => q.yourAnswer && q.yourAnswer !== 'No answer provided').length,
              fullData: {
                questions: mappedResult.questions.map(q => ({ question: q.question, ideal_answer: q.idealAnswer })),
                answers: mappedResult.questions.map(q => q.yourAnswer),
                evaluations: mappedEvaluations,
                communicationAnalytics: session.communication_stats ? [session.communication_stats] : [],
                interviewConfig: {
                  role: mappedResult.role,
                  difficulty: session.difficulty || 'medium',
                }
              }
            });
          } catch (dbErr) {
            console.warn("Could not cache to IndexedDB:", dbErr);
          }
          return;
        }
      } catch (supabaseError: any) {
        console.warn("Supabase fetch failed, falling back to IndexedDB:", supabaseError.message || supabaseError);
        
        try {
          const localSession = await getInterviewSession(sessionId);
          if (localSession) {
            console.log("Loaded session from IndexedDB:", localSession);
            const mapped = {
              overallScore: localSession.score,
              date: localSession.date,
              duration: localSession.duration,
              role: localSession.role,
              level: localSession.level,
              summary: localSession.fullData?.evaluations 
                ? generateSummary(localSession.fullData.evaluations, localSession.score)
                : "No summary available",
              strengths: localSession.fullData?.evaluations ? extractStrengths(localSession.fullData.evaluations) : [],
              weaknesses: localSession.fullData?.evaluations ? extractWeaknesses(localSession.fullData.evaluations) : [],
              metrics: localSession.fullData?.evaluations 
                ? calculateMetrics(localSession.fullData.evaluations)
                : mockResultData.metrics,
              questions: (localSession.fullData?.questions || []).map((q: any, idx: number) => ({
                id: idx + 1,
                question: q.question || '',
                yourAnswer: localSession.fullData?.answers?.[idx] || 'No answer provided',
                idealAnswer: q.ideal_answer || '',
                score: localSession.fullData?.evaluations?.[idx]?.final_score || 0,
                improvements: localSession.fullData?.evaluations?.[idx]?.improvements || [],
                strengths: localSession.fullData?.evaluations?.[idx]?.strengths || [],
              }))
            };
            setDbResultData(mapped);

            const calculatedRadar = computeRadarScores(
              localSession.fullData?.evaluations || [],
              localSession.fullData?.communicationAnalytics || []
            );
            setDbRadarScores(calculatedRadar);
            return;
          }
        } catch (localErr) {
          console.error("IndexedDB fallback failed:", localErr);
        }
        setError("Failed to load interview results.");
      } finally {
        setLoading(false);
      }
    };

    loadSessionData();
  }, [sessionId]);

  // Show save modal on page load (only if we have real data and not already saved)
  useEffect(() => {
    if (passedOverallScore !== undefined && !isSaved) {
      // Show modal after 1 second delay
      const timer = setTimeout(() => {
        setShowSaveModal(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [passedOverallScore, isSaved]);
  
  // Transform real evaluation data to match expected format
  const localResultData = passedOverallScore !== undefined ? {
    overallScore: passedOverallScore,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    duration: `${Math.floor(realQuestions.length * 2)} min`,
    role: interviewConfig?.role || 'Software Engineer',
    level: interviewConfig?.difficulty === 'easy' ? 'Entry Level' : interviewConfig?.difficulty === 'hard' ? 'Senior Level' : 'Mid Level',
    summary: generateSummary(evaluations, passedOverallScore),
    strengths: extractStrengths(evaluations),
    weaknesses: extractWeaknesses(evaluations),
    metrics: calculateMetrics(evaluations),
    questions: realQuestions.map((q: any, idx: number) => ({
      id: idx + 1,
      question: q.question,
      yourAnswer: userAnswers[idx] || 'No answer provided',
      idealAnswer: q.ideal_answer,
      score: evaluations[idx]?.final_score || 0,
      improvements: evaluations[idx]?.improvements || [],
      strengths: evaluations[idx]?.strengths || [],
    })),
  } : mockResultData;

  const localRadarScores = passedOverallScore !== undefined
    ? computeRadarScores(evaluations, communicationAnalytics)
    : {
        technicalAccuracy: 92,
        communication: 85,
        problemSolving: 88,
        confidence: 82,
        relevance: 90,
        structure: 86
      };

  const resultData = dbResultData || localResultData;
  const radarScores = dbRadarScores || localRadarScores;

  const handleCopyReport = async () => {
    const metricsText = resultData.metrics.map(m => `- ${m.label}: ${m.score}% (${m.feedback})`).join("\n");
    const strengthsText = resultData.strengths.map(s => `- ${s}`).join("\n");
    const weaknessesText = resultData.weaknesses.map(w => `- ${w}`).join("\n");
    const questionsText = resultData.questions.map((q, idx) => 
      `Question ${idx + 1}: ${q.question}\nYour Answer: ${q.yourAnswer}\nIdeal Answer framework: ${q.idealAnswer}\nScore: ${q.score}%\nImprovements:\n${q.improvements.map(i => `  - ${i}`).join("\n")}`
    ).join("\n\n");

    const reportText = `INTERVOX AI INTERVIEW PRACTICE REPORT
=====================================
Date: ${resultData.date}
Role: ${resultData.role} (${resultData.level})
Overall Score: ${resultData.overallScore}%
Duration: ${resultData.duration}

OVERALL SUMMARY
---------------
${resultData.summary}

PERFORMANCE BREAKDOWN
--------------------
${metricsText}

KEY INSIGHTS
------------
Strengths:
${strengthsText || "None recorded"}

Areas for Improvement:
${weaknessesText || "None recorded"}

DETAILED REVIEW
---------------
${questionsText}
`;

    try {
      await navigator.clipboard.writeText(reportText);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch (err) {
      console.error("Failed to copy report: ", err);
    }
  };

  // Export PDF functionality
  const handleExportPDF = () => {
    try {
      // Open print dialog (user can save as PDF)
      window.print();
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  // Share Results functionality
  const handleShareResults = async () => {
    try {
      const shareData = {
        title: `InterVox Interview Results - ${resultData.overallScore}%`,
        text: `I scored ${resultData.overallScore}% on my ${resultData.role} interview practice! 🎯\n\nPerformance Breakdown:\n${resultData.metrics.map(m => `${m.label}: ${m.score}%`).join('\n')}\n\nPowered by InterVox AI`,
        url: window.location.href,
      };

      // Check if Web Share API is supported
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: Copy to clipboard
        const shareText = `InterVox Interview Results\n\nScore: ${resultData.overallScore}%\nRole: ${resultData.role}\nDate: ${resultData.date}\n\n${shareData.text}`;
        await navigator.clipboard.writeText(shareText);
        alert('Results copied to clipboard! You can now paste and share.');
      }
    } catch (error) {
      console.error('Share error:', error);
      // Fallback to clipboard if share fails
      try {
        const shareText = `InterVox Interview Results\nScore: ${resultData.overallScore}%\nRole: ${resultData.role}`;
        await navigator.clipboard.writeText(shareText);
        alert('Results copied to clipboard!');
      } catch {
        alert('Sharing not supported. Please take a screenshot to share your results.');
      }
    }
  };

  // Save interview to history
  const handleSaveInterview = async () => {
    try {
      const activeId = sessionId || `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const questionsAnswered = userAnswers.filter((a: string) => a && a.trim()).length;
      
      // Calculate duration based on analytics or fallback
      const durationMinutes = Math.floor(realQuestions.length * 2);
      const duration = `${durationMinutes} min`;
      
      await db.saveSession({
        id: activeId,
        date: resultData.date,
        dateShort: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        timestamp: Date.now(),
        role: resultData.role,
        level: resultData.level,
        difficulty: interviewConfig?.difficulty || 'medium',
        score: resultData.overallScore,
        duration: duration,
        questions: realQuestions.length,
        questionsAnswered: questionsAnswered,
        fullData: {
          questions: realQuestions,
          answers: userAnswers,
          evaluations: evaluations,
          communicationAnalytics: communicationAnalytics,
          interviewConfig: interviewConfig,
        },
      });
      
      setIsSaved(true);
      setShowSaveModal(false);
      
      console.log('✅ Interview saved to history!');
    } catch (error) {
      console.error('❌ Error saving interview:', error);
      alert('Failed to save interview. Please try again.');
    }
  };

  // Skip saving
  const handleSkipSave = () => {
    setShowSaveModal(false);
    console.log('⏭️ Interview not saved');
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <>
      {/* Save Interview Modal */}
      <SaveInterviewModal
        open={showSaveModal}
        onSave={handleSaveInterview}
        onSkip={handleSkipSave}
        score={resultData.overallScore}
        role={resultData.role}
      />
      
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            margin: 1cm;
            size: A4;
          }
          
          /* Hide navigation and action buttons */
          header button,
          .no-print {
            display: none !important;
          }
          
          /* Ensure proper page breaks */
          .page-break-avoid {
            page-break-inside: avoid;
          }
          
          /* Optimize colors for print */
          body {
            background: white !important;
          }
          
          /* Make sure content is visible */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      
      <div className="min-h-screen bg-background text-foreground" id="results-content">{/* Print-friendly ID */}
      {/* Top Bar */}
      <header className="glass-panel sticky top-0 z-30 px-6 lg:px-8 py-4 border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-text-secondary hover:text-primary transition-colors"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: "0.875rem",
            }}
          >
            <ChevronLeft size={16} strokeWidth={2} />
            Back to Dashboard
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-glass-border bg-glass-bg hover:bg-white/10 transition-colors text-text-primary"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: "0.875rem",
              }}
            >
              <Download size={14} strokeWidth={2} />
              Export PDF
            </button>
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-glass-border bg-glass-bg hover:bg-white/10 transition-colors text-text-primary"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: "0.875rem",
              }}
            >
              {copiedReport ? (
                <>
                  <Check size={14} className="text-emerald-400 animate-pulse" strokeWidth={2.5} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} strokeWidth={2} />
                  Copy Report
                </>
              )}
            </button>
            <button
              onClick={handleShareResults}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: "0.875rem",
                boxShadow: "0 4px 12px var(--accent-glow)",
              }}
            >
              <Share2 size={14} strokeWidth={2} />
              Share Results
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
        {/* Hero Section */}
        <div
          className="glass-panel p-8 lg:p-10 mb-8"
        >
          <div className="flex flex-col lg:flex-row items-center gap-8">
            {/* Score Ring */}
            <div className="flex-shrink-0">
              <CircularProgress score={resultData.overallScore} />
            </div>

            {/* Info and Actions */}
            <div className="flex-1 text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-2 mb-3">
                <Trophy size={20} className="text-[#F59E0B]" strokeWidth={2} />
                <h1
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 800,
                    fontSize: "clamp(1.5rem, 4vw, 2rem)",
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Interview Complete!
                </h1>
              </div>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "1rem",
                  color: "var(--text-secondary)",
                  marginBottom: "8px",
                }}
              >
                {resultData.role} • {resultData.level}
              </p>
              <div className="flex items-center justify-center lg:justify-start gap-4 text-sm text-[#94A3B8] mb-6">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} strokeWidth={2} />
                  {resultData.date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Clock size={14} strokeWidth={2} />
                  {resultData.duration}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white transition-colors"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    boxShadow: "0 4px 16px var(--accent-glow)",
                  }}
                >
                  <RotateCcw size={14} strokeWidth={2} />
                  Retake Interview
                </button>
                <button
                  onClick={() => navigate("/dashboard/history")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-glass-border bg-glass-bg hover:bg-white/10 text-text-primary transition-colors"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  View History
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section B — Radar chart + per-dimension breakdown */}
        <div className="glass-panel p-6 lg:p-8 mb-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left half: RadarChart centered, size=300 */}
          <div className="lg:col-span-6 flex justify-center">
            <RadarChart scores={radarScores} size={300} animated={true} />
          </div>
          
          {/* Right half: 6 metric rows */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              Performance Metrics
            </h3>
            <div className="flex flex-col gap-4">
              <DimensionRow label="Technical Accuracy" score={radarScores.technicalAccuracy} />
              <DimensionRow label="Communication" score={radarScores.communication} />
              <DimensionRow label="Problem Solving" score={radarScores.problemSolving} />
              <DimensionRow label="Confidence" score={radarScores.confidence} />
              <DimensionRow label="Relevance" score={radarScores.relevance} />
              <DimensionRow label="Structure" score={radarScores.structure} />
            </div>
          </div>
        </div>

        {/* AI Summary Section */}
        {resultData.summary && (
          <div className="mb-8">
            <div
              className="glass-panel p-6 lg:p-8 border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/5"
              style={{ boxShadow: "0 8px 32px rgba(99, 102, 241, 0.08)" }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Sparkles size={24} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2
                    style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontWeight: 800,
                      fontSize: "1.5rem",
                      color: "var(--text-primary)",
                      marginBottom: "6px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    🤖 AI Interview Summary
                  </h2>
                  <p className="text-indigo-300 text-sm font-semibold">
                    Comprehensive analysis based on your interview performance
                  </p>
                </div>
              </div>
              <div className="bg-surface-2/60 backdrop-blur-sm rounded-xl p-6 border border-glass-border shadow-sm">
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "1rem",
                    color: "var(--text-primary)",
                    lineHeight: 1.9,
                    fontWeight: 400,
                  }}
                >
                  {resultData.summary}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Section C — Question-by-question breakdown */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: "1.25rem",
                color: "var(--text-primary)",
              }}
            >
              Detailed Question Review
            </h2>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
              }}
            >
              {resultData.questions.length} questions answered
            </span>
          </div>

          <Accordion.Root type="single" collapsible className="flex flex-col gap-4">
            {resultData.questions.map((question, index) => {
              const { grade, color: badgeColor } = getScoreGrade(question.score);
              const truncatedQuestion = question.question.length > 80 
                ? question.question.substring(0, 80) + "..." 
                : question.question;
                
              return (
                <Accordion.Item
                  key={question.id || index}
                  value={`question-${index}`}
                  className="glass-panel overflow-hidden border border-glass-border rounded-2xl"
                >
                  <Accordion.Header className="flex">
                    <Accordion.Trigger className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left outline-none group">
                      <div className="flex items-start gap-4 flex-1">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: "rgba(108, 92, 231, 0.15)" }}
                        >
                          <span
                            style={{
                              fontFamily: "'Montserrat', sans-serif",
                              fontWeight: 700,
                              fontSize: "0.875rem",
                              color: "var(--accent-primary)",
                            }}
                          >
                            {index + 1}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontWeight: 600,
                              fontSize: "0.9rem",
                              color: "var(--text-primary)",
                              lineHeight: 1.5,
                            }}
                          >
                            {truncatedQuestion}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border flex-shrink-0 ${badgeColor}`}>
                          <span className="font-bold text-xs">
                            Grade {grade} ({question.score}%)
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        strokeWidth={2}
                        className="text-text-secondary ml-3 flex-shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                      />
                    </Accordion.Trigger>
                  </Accordion.Header>

                  <Accordion.Content className="overflow-hidden border-t border-glass-border data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="p-5 flex flex-col gap-5"
                    >
                      {/* Full Question */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Full Question</h4>
                        <p className="text-sm text-white leading-relaxed">{question.question}</p>
                      </div>

                      {/* Candidate's Answer */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Your Answer</h4>
                        <div className="p-4 rounded-xl border border-glass-border bg-white/5">
                          <p className="text-sm text-white leading-relaxed">{question.yourAnswer}</p>
                        </div>
                      </div>

                      {/* AI Feedback (Strengths and improvements) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">Strength</h4>
                          <p className="text-sm text-emerald-100/90 leading-relaxed">
                            {question.strengths && question.strengths.length > 0 ? (
                              question.strengths.join(", ")
                            ) : (
                              "Demonstrated solid core technical skills and logical structuring."
                            )}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">Gap / Improvement</h4>
                          <p className="text-sm text-amber-100/90 leading-relaxed">
                            {question.improvements && question.improvements.length > 0 ? (
                              question.improvements.join(", ")
                            ) : (
                              "Could add more specific quantifiable metrics and outline STAR framework."
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Individual Score Bar */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold text-text-secondary mb-1">
                          <span>Question Score</span>
                          <span>{question.score}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary animate-pulse"
                            style={{ width: `${question.score}%` }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  </Accordion.Content>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        </div>
      </div>
    </div>
    </>
  );
}