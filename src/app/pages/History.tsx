import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Calendar,
  Clock,
  Eye,
  TrendingUp,
  Filter,
  Search,
  ChevronDown,
  FileText,
  Trophy,
  Briefcase,
  Server,
  Brain,
  BarChart2,
  Layout,
  Cloud,
  ChevronRight,
  GitCompare
} from "lucide-react";
import { getInterviewHistory, getHistoryStats, type InterviewSession } from "../../utils/interviewStorage";
import { PageLoader } from "../components";

const domainIcons: Record<string, any> = {
  'Backend': Server,
  'ML': Brain,
  'Data Science': BarChart2,
  'Frontend': Layout,
  'DevOps': Cloud
};

const domainColors: Record<string, string> = {
  'Backend': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'ML': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'Data Science': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Frontend': 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  'DevOps': 'text-amber-400 bg-amber-500/10 border-amber-500/20'
};

function getScoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function getScoreBg(score: number) {
  if (score >= 70) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 50) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
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

export default function History() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [stats, setStats] = useState({ totalSessions: 0, averageScore: 0, bestScore: 0, recentTrend: 0 });
  const [loading, setLoading] = useState(true);

  // Filters State
  const [selectedDomain, setSelectedDomain] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [selectedSort, setSelectedSort] = useState("newest");

  // Load interview history from IndexedDB on component mount
  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const history = await getInterviewHistory();
        const historyStats = await getHistoryStats();
        
        setSessions(history);
        setStats(historyStats);
        console.log(`📚 Loaded ${history.length} interviews from history`);
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadHistory();
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  // Filter and sort sessions
  const filteredSessions = sessions.filter((session) => {
    const matchesSearch = session.role.toLowerCase().includes(searchTerm.toLowerCase());
    
    const domain = session.domain || "Backend";
    const matchesDomain = selectedDomain === "All" || domain === selectedDomain;
    
    const matchesDifficulty = selectedDifficulty === "All" || session.difficulty.toLowerCase() === selectedDifficulty.toLowerCase();
    
    return matchesSearch && matchesDomain && matchesDifficulty;
  });

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (selectedSort === "newest") return b.timestamp - a.timestamp;
    if (selectedSort === "oldest") return a.timestamp - b.timestamp;
    if (selectedSort === "highest") return b.score - a.score;
    if (selectedSort === "lowest") return a.score - b.score;
    return 0;
  });

  const handleViewReport = (session: InterviewSession) => {
    if (session.fullData) {
      navigate('/interview-results', {
        state: {
          questions: session.fullData.questions,
          answers: session.fullData.answers,
          evaluations: session.fullData.evaluations,
          overallScore: session.score,
          interviewConfig: session.fullData.interviewConfig,
          communicationAnalytics: session.fullData.communicationAnalytics,
        }
      });
    } else {
      alert('Interview data not available');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <header className="glass-panel border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock size={18} className="text-primary" strokeWidth={2} />
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  fontSize: "1.5rem",
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                Interview History
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                }}
              >
                Track your progress and review past interview sessions
              </p>
            </div>
          </div>

          {/* Session Comparison Shortcut Link */}
          {sessions.length >= 2 && (
            <button
              onClick={() => navigate("/compare")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/30 text-primary transition-all text-sm font-semibold"
            >
              <GitCompare size={15} />
              Compare Sessions
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
        {/* Stats Overview */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="glass-panel p-5 bg-surface-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText size={18} className="text-primary" strokeWidth={2} />
                </div>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Total Interviews
                </p>
              </div>
              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  fontSize: "2rem",
                  color: "var(--text-primary)",
                  lineHeight: 1,
                }}
              >
                {stats.totalSessions}
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                }}
              >
                Completed sessions
              </p>
            </div>

            <div className="glass-panel p-5 bg-surface-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp size={18} className="text-emerald-400" strokeWidth={2} />
                </div>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Average Score
                </p>
              </div>
              <p
                className={getScoreColor(stats.averageScore)}
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  fontSize: "2rem",
                  lineHeight: 1,
                }}
              >
                {stats.averageScore}%
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                }}
              >
                Overall performance average
              </p>
            </div>

            <div className="glass-panel p-5 bg-surface-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Trophy size={18} className="text-amber-400" strokeWidth={2} />
                </div>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Best Score
                </p>
              </div>
              <p
                className={getScoreColor(stats.bestScore)}
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  fontSize: "2rem",
                  lineHeight: 1,
                }}
              >
                {stats.bestScore}%
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                }}
              >
                Personal high score
              </p>
            </div>
          </div>
        )}

        {/* Filters Bar */}
        <div className="glass-panel p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-2/40">
          {/* Search bar */}
          <div className="flex items-center gap-2 bg-black/30 border border-glass-border rounded-xl px-3 py-2 flex-1 max-w-md">
            <Search size={14} strokeWidth={2} className="text-text-secondary" />
            <input
              type="text"
              placeholder="Search roles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent outline-none text-sm text-white placeholder-text-secondary w-full"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Domain filter dropdown */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <span>Domain:</span>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="bg-surface-3 border border-glass-border rounded-lg px-2.5 py-1.5 text-white outline-none cursor-pointer focus:border-primary text-xs font-semibold"
              >
                <option value="All">All Domains</option>
                <option value="Backend">Backend</option>
                <option value="Frontend">Frontend</option>
                <option value="ML">ML / AI</option>
                <option value="Data Science">Data Science</option>
                <option value="DevOps">DevOps</option>
              </select>
            </div>

            {/* Difficulty Filter */}
            <div className="flex items-center gap-1">
              {["All", "Easy", "Medium", "Hard"].map((diff) => (
                <button
                  key={diff}
                  onClick={() => setSelectedDifficulty(diff)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    selectedDifficulty === diff
                      ? "bg-primary border-primary text-white shadow-[0_2px_8px_var(--accent-glow)]"
                      : "bg-surface-3 border-glass-border text-text-secondary hover:text-white"
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>

            {/* Sort filter */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <span>Sort:</span>
              <select
                value={selectedSort}
                onChange={(e) => setSelectedSort(e.target.value)}
                className="bg-surface-3 border border-glass-border rounded-lg px-2.5 py-1.5 text-white outline-none cursor-pointer focus:border-primary text-xs font-semibold"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest">Highest Score</option>
                <option value="lowest">Lowest Score</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sessions list */}
        {sortedSessions.length === 0 ? (
          // Empty state
          <div className="glass-panel p-16 text-center max-w-xl mx-auto flex flex-col items-center">
            {/* Microphone outline SVG */}
            <svg
              className="w-20 h-20 text-text-secondary/35 stroke-current mb-6"
              fill="none"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              No interviews yet
            </h3>
            <p className="text-sm text-text-secondary mb-8 max-w-sm">
              {searchTerm || selectedDomain !== "All" || selectedDifficulty !== "All"
                ? "No completed interviews match your active search filters."
                : "You haven't completed any AI voice interviews yet. Start practice to get detailed analytics."}
            </p>
            <button
              onClick={() => navigate("/dashboard/practice")}
              className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white transition-all font-semibold text-sm shadow-[0_4px_16px_var(--accent-glow)]"
            >
              Start your first interview
            </button>
          </div>
        ) : (
          // Card Grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sortedSessions.map((session) => {
              const domain = session.domain || "Backend";
              const Icon = domainIcons[domain] || Server;
              const badgeColor = domainColors[domain] || domainColors.Backend;
              const radarScores = computeRadarScores(
                session.fullData?.evaluations || [],
                session.fullData?.communicationAnalytics || []
              );
              
              const barValues = [
                radarScores.technicalAccuracy,
                radarScores.communication,
                radarScores.problemSolving,
                radarScores.confidence,
                radarScores.relevance,
                radarScores.structure
              ];

              return (
                <div
                  key={session.id}
                  onClick={() => handleViewReport(session)}
                  className="glass-panel p-5 bg-surface-2/40 hover:bg-surface-2/65 hover:border-primary/45 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between min-h-[220px] group border-glass-border"
                >
                  <div>
                    {/* Top Row: Domain Icon & Difficulty Pill */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${badgeColor}`}>
                        <Icon size={16} />
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-glass-border text-text-secondary">
                        {session.difficulty}
                      </span>
                    </div>

                    {/* Middle: Role Title & Meta Info */}
                    <h4 className="text-base font-bold text-white group-hover:text-primary transition-colors mb-1 line-clamp-1">
                      {session.role}
                    </h4>
                    <p className="text-xs text-text-secondary mb-4 flex items-center gap-1">
                      <Calendar size={11} />
                      {session.date} • {session.duration}
                    </p>
                  </div>

                  {/* Bottom: Mini Radar Scores and Score Ring/Number */}
                  <div className="flex items-end justify-between border-t border-glass-border/40 pt-4 mt-auto">
                    {/* Mini score visualizer */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-text-secondary">
                        Skill Profile
                      </span>
                      <div className="flex gap-1 items-end h-7">
                        {barValues.map((val, idx) => (
                          <div
                            key={idx}
                            className="w-1.5 bg-primary/40 group-hover:bg-primary rounded-t-sm transition-all"
                            style={{ height: `${Math.max(15, (val / 100) * 100)}%` }}
                            title={`${val}%`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Score badge */}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-text-secondary">
                        Score
                      </span>
                      <div className={`px-3 py-1 rounded-xl border font-bold text-sm ${getScoreBg(session.score)} ${getScoreColor(session.score)}`}>
                        {session.score}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
