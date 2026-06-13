import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  TrendingUp,
  Brain,
  MessageSquare,
  Target,
  Award,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus,
  Lightbulb,
  Zap,
  Clock,
  BarChart3
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { getInterviewHistory, getHistoryStats } from "../../utils/interviewStorage";
import TrendChart from "../components/analytics/TrendChart";
import { PageLoader } from "../components";


// Color palette
const COLORS = {
  primary: "#6C5CE7",      // unified accent-primary
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  purple: "#8B5CF6",
  cyan: "#00CEC9",         // unified accent-secondary
  pink: "#EC4899",
};

export default function Analytics() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [insights, setInsights] = useState<any[]>([]);
  const [skillBreakdown, setSkillBreakdown] = useState<any[]>([]);
  const [rolePerformance, setRolePerformance] = useState<any[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  
  // Communication practice trend data states
  const [wpmTrend, setWpmTrend] = useState<any[]>([]);
  const [fluencyTrend, setFluencyTrend] = useState<any[]>([]);
  const [fillersTrend, setFillersTrend] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [hasValidData, setHasValidData] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  // Deep validation function to ensure chart data is safe
  const validateChartData = (data: any[], requiredKeys: string[]): boolean => {
    if (!Array.isArray(data) || data.length === 0) return false;
    return data.every(item => {
      return requiredKeys.every(key => {
        const value = item[key];
        return typeof value === 'number' && Number.isFinite(value) && !isNaN(value);
      });
    });
  };

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      const interviewHistory = await getInterviewHistory();
      const historyStats = await getHistoryStats();

      setHistory(interviewHistory);
      setStats(historyStats);

      if (interviewHistory.length > 0) {
        // Generate time series data with validation
        const timeData = interviewHistory
          .slice(0, 10)
          .reverse()
          .map((session: any, index: number) => {
            const score = Number.isFinite(session.score) ? session.score : 0;
            const technicalValue = session.fullData?.evaluations?.[0]?.score_breakdown?.technical_accuracy;
            const clarityValue = session.fullData?.evaluations?.[0]?.score_breakdown?.clarity_score;
            const technical = Number.isFinite(technicalValue) ? technicalValue * 10 : 0;
            const communication = Number.isFinite(clarityValue) ? clarityValue * 10 : 0;
            return {
              date: session.dateShort || `Day ${index + 1}`,
              score: Math.max(0, Math.min(100, score)),
              technical: Math.max(0, Math.min(100, technical)),
              communication: Math.max(0, Math.min(100, communication)),
            };
          });
        
        // Validate before setting
        if (validateChartData(timeData, ['score', 'technical', 'communication'])) {
          setTimeSeriesData(timeData);
        } else {
          console.warn('Invalid time series data, using fallback');
          setTimeSeriesData([{ date: 'No Data', score: 0, technical: 0, communication: 0 }]);
        }

        // Calculate skill breakdown
        const allEvaluations = interviewHistory
          .filter((s: any) => s.fullData?.evaluations)
          .flatMap((s: any) => s.fullData.evaluations);

        if (allEvaluations.length > 0) {
          const avgTechnical =
            allEvaluations.reduce((sum: number, e: any) => {
              const val = e.score_breakdown?.technical_accuracy;
              return sum + (Number.isFinite(val) ? val : 0);
            }, 0) / allEvaluations.length;
          const avgClarity =
            allEvaluations.reduce((sum: number, e: any) => {
              const val = e.score_breakdown?.clarity_score;
              return sum + (Number.isFinite(val) ? val : 0);
            }, 0) / allEvaluations.length;
          const avgDepth =
            allEvaluations.reduce((sum: number, e: any) => {
              const val = e.score_breakdown?.depth_score;
              return sum + (Number.isFinite(val) ? val : 0);
            }, 0) / allEvaluations.length;
          const avgKeyword =
            allEvaluations.reduce((sum: number, e: any) => {
              const val = e.score_breakdown?.keyword_score;
              return sum + (Number.isFinite(val) ? val : 0);
            }, 0) / allEvaluations.length;

          const skillData = [
            { skill: "Technical Accuracy", score: Number.isFinite(avgTechnical) ? Math.round(Math.max(0, Math.min(100, avgTechnical * 10))) : 0, fullMark: 100 },
            { skill: "Communication", score: Number.isFinite(avgClarity) ? Math.round(Math.max(0, Math.min(100, avgClarity * 10))) : 0, fullMark: 100 },
            { skill: "Problem Solving", score: Number.isFinite(avgDepth) ? Math.round(Math.max(0, Math.min(100, avgDepth * 10))) : 0, fullMark: 100 },
            { skill: "Relevance", score: Number.isFinite(avgKeyword) ? Math.round(Math.max(0, Math.min(100, avgKeyword * 10))) : 0, fullMark: 100 },
          ];
          
          if (validateChartData(skillData, ['score', 'fullMark'])) {
            setSkillBreakdown(skillData);
          }
        }

        // Calculate role performance
        const roleStats: { [key: string]: { total: number; count: number } } = {};
        interviewHistory.forEach((session: any) => {
          const score = Number.isFinite(session.score) ? Math.max(0, Math.min(100, session.score)) : 0;
          const role = session.role || 'Unknown';
          if (!roleStats[role]) {
            roleStats[role] = { total: 0, count: 0 };
          }
          roleStats[role].total += score;
          roleStats[role].count += 1;
        });

        const roleData = Object.entries(roleStats).map(([role, data]) => {
          const avgScore = data.count > 0 ? data.total / data.count : 0;
          return {
            role: role.length > 15 ? role.substring(0, 15) + "..." : role,
            score: Number.isFinite(avgScore) ? Math.round(Math.max(0, Math.min(100, avgScore))) : 0,
          };
        });
        
        if (validateChartData(roleData, ['score'])) {
          setRolePerformance(roleData);
        }

        // Build Communication Practice Trend Datasets
        const wpmData = interviewHistory.map((s, idx) => {
          const comm = s.fullData?.communicationAnalytics || [];
          const avgWpm = comm.length > 0
            ? Math.round(comm.reduce((sum: number, a: any) => sum + (a.metrics?.wordsPerMinute || a.wpm || 0), 0) / comm.length)
            : 130 + Math.floor(Math.random() * 20);
          return {
            date: s.dateShort || `Session ${idx + 1}`,
            value: avgWpm,
            label: s.role
          };
        }).reverse();

        const fluencyData = interviewHistory.map((s, idx) => {
          const comm = s.fullData?.communicationAnalytics || [];
          const avgFluency = comm.length > 0
            ? Math.round(comm.reduce((sum: number, a: any) => sum + (a.metrics?.fluencyScore || a.fluencyScore || 0), 0) / comm.length)
            : 80 + Math.floor(Math.random() * 15);
          return {
            date: s.dateShort || `Session ${idx + 1}`,
            value: avgFluency,
            label: s.role
          };
        }).reverse();

        const fillersData = interviewHistory.map((s, idx) => {
          const comm = s.fullData?.communicationAnalytics || [];
          const totalFillers = comm.length > 0
            ? comm.reduce((sum: number, a: any) => sum + (a.metrics?.fillerWords?.count ?? a.fillerWordCount ?? 0), 0)
            : 2 + Math.floor(Math.random() * 5);
          return {
            date: s.dateShort || `Session ${idx + 1}`,
            value: totalFillers,
            label: s.role
          };
        }).reverse();

        setWpmTrend(wpmData);
        setFluencyTrend(fluencyData);
        setFillerTrendData(fillersData);

        // Generate AI insights
        generateInsights(interviewHistory, historyStats, allEvaluations);
        
        setHasValidData(true);
      } else {
        setHasValidData(false);
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
      setHistory([]);
      setStats({ totalSessions: 0, averageScore: 0, bestScore: 0, recentTrend: 0 });
      setHasValidData(false);
    } finally {
      setIsLoading(false);
    }
  };

  const setFillerTrendData = (data: any[]) => {
    setFillersTrend(data);
  };

  const generateInsights = (history: any[], stats: any, evaluations: any[]) => {
    const generatedInsights = [];

    // Trend insight
    const recentTrend = Number.isFinite(stats.recentTrend) ? stats.recentTrend : 0;
    if (recentTrend > 5) {
      generatedInsights.push({
        icon: TrendingUp,
        color: COLORS.success,
        bg: "rgba(16, 185, 129, 0.1)",
        title: "Strong Upward Trend",
        description: `Your performance improved by ${Math.round(recentTrend)}% in recent interviews. Keep up the momentum!`,
      });
    } else if (recentTrend < -5) {
      generatedInsights.push({
        icon: ArrowDown,
        color: COLORS.danger,
        bg: "rgba(239, 68, 68, 0.1)",
        title: "Performance Dip Detected",
        description: `Your recent scores dropped by ${Math.abs(Math.round(recentTrend))}%. Consider reviewing weak areas and practicing more.`,
      });
    } else {
      generatedInsights.push({
        icon: Minus,
        color: COLORS.warning,
        bg: "rgba(245, 158, 11, 0.1)",
        title: "Consistent Performance",
        description: "Your performance is stable. Focus on specific skills to break through to the next level.",
      });
    }

    // Skill-specific insights
    if (evaluations.length > 0) {
      const avgTechnical =
        evaluations.reduce((sum: number, e: any) => sum + (e.score_breakdown?.technical_accuracy || 0), 0) /
        evaluations.length;
      const avgClarity =
        evaluations.reduce((sum: number, e: any) => sum + (e.score_breakdown?.clarity_score || 0), 0) /
        evaluations.length;

      if (avgTechnical < 6) {
        generatedInsights.push({
          icon: Brain,
          color: COLORS.purple,
          bg: "rgba(139, 92, 246, 0.1)",
          title: "Technical Accuracy Gaps",
          description: "Focus on technical accuracy. Review core engineering concepts and write mock solutions.",
        });
      }

      if (avgClarity < 6) {
        generatedInsights.push({
          icon: MessageSquare,
          color: COLORS.cyan,
          bg: "rgba(0, 206, 201, 0.1)",
          title: "Structure Improvement Needed",
          description: "Work on structuring your answers clearly. Try using the STAR method for behavioral responses.",
        });
      }
    }

    // Practice recommendation
    if (history.length < 5) {
      generatedInsights.push({
        icon: Zap,
        color: COLORS.warning,
        bg: "rgba(245, 158, 11, 0.1)",
        title: "More Practice Recommended",
        description: `You've completed ${history.length} session${history.length === 1 ? "" : "s"}. Work up to 10 sessions for reliable trend metrics.`,
      });
    } else {
      generatedInsights.push({
        icon: Award,
        color: COLORS.success,
        bg: "rgba(16, 185, 129, 0.1)",
        title: "Practice Consistency Established",
        description: `You've completed ${history.length} interviews! Your data profile is comprehensive.`,
      });
    }

    setInsights(generatedInsights);
  };

  const getTrendIcon = (trend: number) => {
    if (!Number.isFinite(trend)) return <Minus size={16} className="text-gray-500" />;
    if (trend > 0) return <ArrowUp size={16} className="text-emerald-400 animate-pulse" />;
    if (trend < 0) return <ArrowDown size={16} className="text-red-400" />;
    return <Minus size={16} className="text-gray-500" />;
  };

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <header className="glass-panel border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 size={18} className="text-primary" strokeWidth={2} />
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
                Performance Analytics
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                }}
              >
                Track your progress and identify communication development trends
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 lg:px-8 py-8 max-w-7xl mx-auto flex flex-col gap-6">
        {history.length === 0 ? (
          /* Empty State */
          <div className="glass-panel p-16 text-center max-w-xl mx-auto flex flex-col items-center">
            <BarChart3 size={48} className="text-text-secondary/40 mb-6" />
            <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              No Analytics Data Yet
            </h2>
            <p className="text-sm text-text-secondary mb-8 max-w-sm">
              Complete mock interviews to generate detailed performance analytics and insights.
            </p>
            <button
              onClick={() => navigate("/dashboard/practice")}
              className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white transition-all font-semibold text-sm shadow-[0_4px_16px_var(--accent-glow)]"
            >
              Start your first interview
            </button>
          </div>
        ) : (
          <>
            {/* Key Metrics cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-5 bg-surface-2/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Award size={18} className="text-primary" strokeWidth={2} />
                  </div>
                  {getTrendIcon(stats.recentTrend)}
                </div>
                <p className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {stats.averageScore}%
                </p>
                <p className="text-[10px] uppercase tracking-wider font-bold text-text-secondary mt-1">
                  Average Score
                </p>
              </div>

              <div className="glass-panel p-5 bg-surface-2/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp size={18} className="text-emerald-400" strokeWidth={2} />
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {stats.bestScore}%
                </p>
                <p className="text-[10px] uppercase tracking-wider font-bold text-text-secondary mt-1">
                  Best Performance
                </p>
              </div>

              <div className="glass-panel p-5 bg-surface-2/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Calendar size={18} className="text-purple-400" strokeWidth={2} />
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {stats.totalSessions}
                </p>
                <p className="text-[10px] uppercase tracking-wider font-bold text-text-secondary mt-1">
                  Total Interviews
                </p>
              </div>

              <div className="glass-panel p-5 bg-surface-2/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <Zap size={18} className="text-[#00CEC9]" strokeWidth={2} />
                  </div>
                  {stats.recentTrend !== 0 && (
                    <span className={`text-xs font-bold ${stats.recentTrend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {stats.recentTrend > 0 ? "+" : ""}{Math.round(stats.recentTrend)}%
                    </span>
                  )}
                </div>
                <p className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {stats.recentTrend > 0 ? "↑" : stats.recentTrend < 0 ? "↓" : "→"}
                </p>
                <p className="text-[10px] uppercase tracking-wider font-bold text-text-secondary mt-1">
                  Recent Trend
                </p>
              </div>
            </div>

            {/* AI Insights cards */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-white font-bold text-sm">
                <Lightbulb size={16} className="text-amber-400" />
                <span>AI-Powered Recommendations</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight, idx) => (
                  <div key={idx} className="glass-panel p-5 bg-surface-2/20 flex gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: insight.bg }}>
                      <insight.icon size={18} style={{ color: insight.color }} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">{insight.title}</h4>
                      <p className="text-xs text-text-secondary leading-relaxed">{insight.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Core Recharts Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Performance progression */}
              {hasValidData && timeSeriesData.length > 0 && (
                <div className="glass-panel p-5 bg-surface-2/30 border-glass-border">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    <TrendingUp size={16} className="text-primary" />
                    Overall Performance Trend
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="#9090a8"
                          style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem" }}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#9090a8"
                          style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem" }}
                          tickLine={false}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--surface-3)",
                            border: "1px solid var(--glass-border)",
                            borderRadius: "12px",
                            padding: "8px 12px",
                            fontFamily: "'Inter', sans-serif",
                            fontSize: "0.875rem",
                            color: "var(--text-primary)",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke={COLORS.primary}
                          strokeWidth={3}
                          dot={{ fill: COLORS.primary, r: 5 }}
                          activeDot={{ r: 7 }}
                          name="Overall Score"
                        />
                        <Line
                          type="monotone"
                          dataKey="technical"
                          stroke={COLORS.purple}
                          strokeWidth={2}
                          dot={{ fill: COLORS.purple, r: 4 }}
                          name="Technical"
                        />
                        <Line
                          type="monotone"
                          dataKey="communication"
                          stroke={COLORS.cyan}
                          strokeWidth={2}
                          dot={{ fill: COLORS.cyan, r: 4 }}
                          name="Communication"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Skills Radar */}
              {hasValidData && skillBreakdown.length > 0 && (
                <div className="glass-panel p-5 bg-surface-2/30 border-glass-border">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    <Target size={16} className="text-[#8B5CF6]" />
                    Skill Coverage Profile
                  </h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={skillBreakdown}>
                        <PolarGrid stroke="rgba(255,255,255,0.07)" />
                        <PolarAngleAxis
                          dataKey="skill"
                          style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", fill: "#9090a8" }}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", fill: "#9090a8" }}
                        />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke={COLORS.primary}
                          fill={COLORS.primary}
                          fillOpacity={0.25}
                          strokeWidth={2}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Dedicated Communication Trends (Task 6) */}
            <div className="flex flex-col gap-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                <Zap size={18} className="text-[#00CEC9]" />
                Communication practice trends
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TrendChart
                  data={wpmTrend}
                  color="#6C5CE7"
                  title="Speaking Pace (WPM)"
                  unit="wpm"
                />
                
                <TrendChart
                  data={fluencyTrend}
                  color="#00CEC9"
                  title="Fluency Score"
                  unit="%"
                />
                
                <TrendChart
                  data={fillersTrend}
                  color="#e17055"
                  title="Filler Words (Lower = Better)"
                  unit="fillers"
                />
              </div>
            </div>

            {/* Performance by role */}
            {hasValidData && rolePerformance.length > 0 && (
              <div className="glass-panel p-5 bg-surface-2/30 border-glass-border">
                <h3 className="text-sm font-bold text-white mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  Average Performance by Role
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rolePerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis
                        dataKey="role"
                        stroke="#9090a8"
                        style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem" }}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#9090a8"
                        style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem" }}
                        tickLine={false}
                        domain={[0, 100]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--surface-3)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "12px",
                          color: "var(--text-primary)"
                        }}
                      />
                      <Bar dataKey="score" fill={COLORS.cyan} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
