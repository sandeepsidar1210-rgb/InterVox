import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ChevronLeft,
  Share2,
  GitCompare,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Check,
  Calendar,
  Award
} from "lucide-react";
import { getInterviewHistory, type InterviewSession } from "../../utils/interviewStorage";
import { RadarChart, PageLoader } from "../components";

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

export default function CompareSessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [selectedIdA, setSelectedIdA] = useState<string>("");
  const [selectedIdB, setSelectedIdB] = useState<string>("");
  const [overlayMode, setOverlayMode] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const history = await getInterviewHistory();
        setSessions(history);
        if (history.length >= 2) {
          setSelectedIdA(history[1].id); // Second newest
          setSelectedIdB(history[0].id); // Newest
        } else if (history.length === 1) {
          setSelectedIdA(history[0].id);
        }
      } catch (err) {
        console.error("Failed to load sessions for comparison:", err);
      } finally {
        setLoading(false);
      }
    };
    loadSessions();
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  const sessionA = sessions.find(s => s.id === selectedIdA);
  const sessionB = sessions.find(s => s.id === selectedIdB);

  const scoresA = sessionA ? computeRadarScores(sessionA.fullData?.evaluations || [], sessionA.fullData?.communicationAnalytics || []) : null;
  const scoresB = sessionB ? computeRadarScores(sessionB.fullData?.evaluations || [], sessionB.fullData?.communicationAnalytics || []) : null;

  const dimensions = [
    { key: "technicalAccuracy", label: "Technical Accuracy" },
    { key: "communication", label: "Communication" },
    { key: "problemSolving", label: "Problem Solving" },
    { key: "confidence", label: "Confidence" },
    { key: "relevance", label: "Relevance" },
    { key: "structure", label: "Structure" }
  ] as const;

  const handleShareComparison = async () => {
    if (!sessionA || !sessionB || !scoresA || !scoresB) return;

    const summary = `INTERVOX SESSION COMPARISON REPORT
==================================
Session A: ${sessionA.role} (${sessionA.date}) - Score: ${sessionA.score}%
Session B: ${sessionB.role} (${sessionB.date}) - Score: ${sessionB.score}%

METRICS DIFF (Session A vs Session B):
${dimensions.map(dim => {
  const valA = scoresA[dim.key];
  const valB = scoresB[dim.key];
  const diff = valB - valA;
  const sign = diff > 0 ? "+" : "";
  return `- ${dim.label}: A = ${valA}%, B = ${valB}% (${sign}${diff}%)`;
}).join("\n")}

Overall Score Diff: ${sessionB.score - sessionA.score > 0 ? "+" : ""}${sessionB.score - sessionA.score}%
Report generated by InterVox AI Coach.`;

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy comparison:", err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground min-h-screen">
      {/* Top Bar */}
      <header className="glass-panel sticky top-0 z-30 px-6 lg:px-8 py-4 border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => navigate("/dashboard/history")}
            className="flex items-center gap-2 text-text-secondary hover:text-primary transition-colors text-sm font-semibold"
          >
            <ChevronLeft size={16} />
            Back to History
          </button>
          <div className="flex items-center gap-2">
            {sessionA && sessionB && (
              <button
                onClick={handleShareComparison}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors text-xs font-bold uppercase tracking-wider shadow-[0_4px_12px_var(--accent-glow)]"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-400 animate-pulse" />
                    Copied Comparison!
                  </>
                ) : (
                  <>
                    <Share2 size={14} />
                    Share Comparison
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
        {/* Title Section */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GitCompare size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              Compare Sessions
            </h1>
            <p className="text-sm text-text-secondary">
              Review differences and track improvements across your mock interview sessions.
            </p>
          </div>
        </div>

        {sessions.length < 2 ? (
          <div className="glass-panel p-10 text-center max-w-md mx-auto">
            <GitCompare size={48} className="text-text-secondary/40 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              Not enough interviews
            </h3>
            <p className="text-xs text-text-secondary mb-6 leading-relaxed">
              You need at least 2 completed interview sessions to compare performance side-by-side.
            </p>
            <button
              onClick={() => navigate("/dashboard/practice")}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white transition-colors text-xs font-bold uppercase tracking-wider"
            >
              Start Practice Session
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Top Selector Grid */}
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Session A Selector */}
              <div className="glass-panel p-5 bg-surface-2/40">
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                  Session A (Reference)
                </label>
                <select
                  value={selectedIdA}
                  onChange={(e) => setSelectedIdA(e.target.value)}
                  className="w-full bg-surface-3 border border-glass-border rounded-xl px-4 py-3 text-white outline-none cursor-pointer focus:border-primary text-sm font-semibold"
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id} disabled={s.id === selectedIdB}>
                      {s.role} (${s.score}%) - ${s.dateShort}
                    </option>
                  ))}
                </select>
              </div>

              {/* Session B Selector */}
              <div className="glass-panel p-5 bg-surface-2/40">
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">
                  Session B (Comparison)
                </label>
                <select
                  value={selectedIdB}
                  onChange={(e) => setSelectedIdB(e.target.value)}
                  className="w-full bg-surface-3 border border-glass-border rounded-xl px-4 py-3 text-white outline-none cursor-pointer focus:border-primary text-sm font-semibold"
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id} disabled={s.id === selectedIdA}>
                      {s.role} (${s.score}%) - ${s.dateShort}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Middle Visualization Panel */}
            <div className="lg:col-span-12 glass-panel p-6 flex flex-col items-center justify-center bg-surface-2/20">
              {/* Toggle Mode */}
              <div className="flex items-center gap-2 mb-6 bg-black/40 border border-glass-border p-1 rounded-xl">
                <button
                  onClick={() => setOverlayMode(true)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    overlayMode ? "bg-primary text-white" : "text-text-secondary hover:text-white"
                  }`}
                >
                  Overlay Mode
                </button>
                <button
                  onClick={() => setOverlayMode(false)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    !overlayMode ? "bg-primary text-white" : "text-text-secondary hover:text-white"
                  }`}
                >
                  Side-By-Side
                </button>
              </div>

              {/* Visual Display */}
              {sessionA && sessionB && scoresA && scoresB && (
                <div className="w-full flex flex-col items-center">
                  {overlayMode ? (
                    <div className="flex flex-col items-center">
                      <RadarChart
                        scores={scoresA}
                        comparisonScores={scoresB}
                        size={280}
                        animated={true}
                      />
                      {/* Legend */}
                      <div className="flex items-center gap-6 mt-4 text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-[#6C5CE7]" />
                          <span className="text-white">Session A (Reference)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-[#00CEC9]" />
                          <span className="text-[#00CEC9]">Session B (Comparison)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col md:flex-row justify-center items-center gap-10">
                      <div className="flex flex-col items-center">
                        <RadarChart scores={scoresA} size={240} animated={true} />
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-400 mt-2">
                          Session A ({sessionA.score}%)
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <RadarChart scores={scoresB} size={240} animated={true} />
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 mt-2">
                          Session B ({sessionB.score}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Diffs Table Panel */}
            {sessionA && sessionB && scoresA && scoresB && (
              <div className="lg:col-span-12 glass-panel p-6 bg-surface-2/30">
                <h3 className="text-base font-bold text-white mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  Dimension Metric Diffs
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-gray-300">
                    <thead>
                      <tr className="border-b border-glass-border/50 text-text-secondary text-xs uppercase tracking-wider font-bold">
                        <th className="pb-3 pr-4">Dimension</th>
                        <th className="pb-3 px-4">Session A</th>
                        <th className="pb-3 px-4">Session B</th>
                        <th className="pb-3 pl-4 text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-glass-border/40">
                      {dimensions.map((dim) => {
                        const valA = scoresA[dim.key];
                        const valB = scoresB[dim.key];
                        const diff = valB - valA;
                        
                        return (
                          <tr key={dim.key} className="hover:bg-white/[0.01]">
                            <td className="py-3.5 pr-4 font-semibold text-white">{dim.label}</td>
                            <td className="py-3.5 px-4 text-purple-400 font-extrabold">{valA}%</td>
                            <td className="py-3.5 px-4 text-cyan-400 font-extrabold">{valB}%</td>
                            <td className="py-3.5 pl-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                {diff > 0 ? (
                                  <>
                                    <ArrowUpRight size={14} className="text-emerald-400" />
                                    <span className="text-emerald-400 font-extrabold">+{diff}%</span>
                                  </>
                                ) : diff < 0 ? (
                                  <>
                                    <ArrowDownRight size={14} className="text-red-400" />
                                    <span className="text-red-400 font-extrabold">{diff}%</span>
                                  </>
                                ) : (
                                  <>
                                    <Minus size={14} className="text-gray-400" />
                                    <span className="text-gray-400 font-extrabold">0%</span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Overall Score Row */}
                      <tr className="hover:bg-white/[0.01] bg-white/[0.02]">
                        <td className="py-4 pr-4 font-bold text-white uppercase tracking-wider text-xs">
                          Overall Score
                        </td>
                        <td className="py-4 px-4 text-purple-400 font-extrabold text-base">{sessionA.score}%</td>
                        <td className="py-4 px-4 text-cyan-400 font-extrabold text-base">{sessionB.score}%</td>
                        <td className="py-4 pl-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            {sessionB.score - sessionA.score > 0 ? (
                              <>
                                <ArrowUpRight size={16} className="text-emerald-400" />
                                <span className="text-emerald-400 font-extrabold text-base">+{sessionB.score - sessionA.score}%</span>
                              </>
                            ) : sessionB.score - sessionA.score < 0 ? (
                              <>
                                <ArrowDownRight size={16} className="text-red-400" />
                                <span className="text-red-400 font-extrabold text-base">{sessionB.score - sessionA.score}%</span>
                              </>
                            ) : (
                              <>
                                <Minus size={16} className="text-gray-400" />
                                <span className="text-gray-400 font-extrabold text-base">0%</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
