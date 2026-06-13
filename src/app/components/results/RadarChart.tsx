import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface RadarScores {
  technicalAccuracy: number;
  communication: number;
  problemSolving: number;
  confidence: number;
  relevance: number;
  structure: number;
}

interface RadarChartProps {
  scores: RadarScores;
  comparisonScores?: RadarScores;
  size?: number;
  animated?: boolean;
}

export default function RadarChart({
  scores,
  comparisonScores,
  size = 320,
  animated = true,
}: RadarChartProps) {
  const center = size / 2;
  const radius = size * 0.38;
  const axes = 6;

  const keys: (keyof RadarScores)[] = [
    "technicalAccuracy",
    "communication",
    "problemSolving",
    "confidence",
    "relevance",
    "structure",
  ];

  const labels = [
    "Technical",
    "Communication",
    "Problem solving",
    "Confidence",
    "Relevance",
    "Structure",
  ];

  const [hoveredAxis, setHoveredAxis] = useState<{
    index: number;
    score: number;
    x: number;
    y: number;
    label: string;
    isComparison?: boolean;
  } | null>(null);

  // Generate grid points for concentric hexagons
  const getGridPoints = (level: number) => {
    const points = [];
    for (let i = 0; i < axes; i++) {
      const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
      const x = center + radius * level * Math.cos(angle);
      const y = center + radius * level * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(" ");
  };

  // Generate points string for a given score set
  const getScorePoints = (scoreData: RadarScores) => {
    const points = [];
    for (let i = 0; i < axes; i++) {
      const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
      const value = (scoreData[keys[i]] || 0) / 100;
      const x = center + radius * value * Math.cos(angle);
      const y = center + radius * value * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(" ");
  };

  const centerPointsStr = Array(axes).fill(`${center},${center}`).join(" ");
  const primaryPointsStr = getScorePoints(scores);
  const comparisonPointsStr = comparisonScores ? getScorePoints(comparisonScores) : null;

  // Text anchor positions helper
  const getTextAnchor = (angle: number) => {
    const cosVal = Math.cos(angle);
    if (cosVal > 0.15) return "start";
    if (cosVal < -0.15) return "end";
    return "middle";
  };

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        {/* Concentric hexagons grid */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, idx) => (
          <polygon
            key={idx}
            points={getGridPoints(level)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.07)"
            strokeWidth="0.5"
          />
        ))}

        {/* Axis lines */}
        {Array.from({ length: axes }).map((_, i) => {
          const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Axis Labels */}
        {labels.map((label, i) => {
          const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
          const labelDist = radius + 18;
          const x = center + labelDist * Math.cos(angle);
          const y = center + labelDist * Math.sin(angle) + 4; // micro offset for vertical alignment
          return (
            <text
              key={i}
              x={x}
              y={y}
              fill="var(--text-secondary)"
              fontSize="11"
              fontWeight="500"
              textAnchor={getTextAnchor(angle)}
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {label}
            </text>
          );
        })}

        {/* Comparison Polygon (Session B) */}
        {comparisonScores && comparisonPointsStr && (
          <motion.g>
            <motion.polygon
              points={animated ? centerPointsStr : comparisonPointsStr}
              animate={animated ? { points: comparisonPointsStr } : {}}
              transition={{ duration: 1.0, ease: "easeOut" }}
              fill="rgba(0, 206, 201, 0.15)"
              stroke="#00CEC9"
              strokeWidth="2"
            />
            {/* Dots */}
            {keys.map((key, i) => {
              const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
              const value = (comparisonScores[key] || 0) / 100;
              const x = center + radius * value * Math.cos(angle);
              const y = center + radius * value * Math.sin(angle);

              return (
                <circle
                  key={`comp-dot-${i}`}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#00CEC9"
                  className="cursor-pointer hover:r-6 transition-all"
                  onMouseEnter={() =>
                    setHoveredAxis({
                      index: i,
                      score: comparisonScores[key],
                      x,
                      y,
                      label: labels[i],
                      isComparison: true,
                    })
                  }
                  onMouseLeave={() => setHoveredAxis(null)}
                />
              );
            })}
          </motion.g>
        )}

        {/* Primary Polygon (Session A) */}
        <motion.g>
          <motion.polygon
            points={animated ? centerPointsStr : primaryPointsStr}
            animate={animated ? { points: primaryPointsStr } : {}}
            transition={{ duration: 1.0, ease: "easeOut" }}
            fill="rgba(108, 92, 231, 0.2)"
            stroke="#6C5CE7"
            strokeWidth="2"
          />
          {/* Dots */}
          {keys.map((key, i) => {
            const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
            const value = (scores[key] || 0) / 100;
            const x = center + radius * value * Math.cos(angle);
            const y = center + radius * value * Math.sin(angle);

            return (
              <circle
                key={`dot-${i}`}
                cx={x}
                cy={y}
                r="4"
                fill="#6C5CE7"
                className="cursor-pointer hover:r-6 transition-all"
                onMouseEnter={() =>
                  setHoveredAxis({
                    index: i,
                    score: scores[key],
                    x,
                    y,
                    label: labels[i],
                    isComparison: false,
                  })
                }
                onMouseLeave={() => setHoveredAxis(null)}
              />
            );
          })}
        </motion.g>
      </svg>

      {/* Tooltip Overlay */}
      <AnimatePresence>
        {hoveredAxis && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 5 }}
            className="absolute pointer-events-none bg-surface-3/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-glass-border shadow-xl z-30 flex flex-col items-center justify-center gap-0.5 text-center min-w-[100px]"
            style={{
              left: hoveredAxis.x - 50,
              top: hoveredAxis.y - 50,
            }}
          >
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {hoveredAxis.label}
            </span>
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: "14px",
                fontWeight: 800,
                color: hoveredAxis.isComparison ? "#00CEC9" : "#6C5CE7",
              }}
            >
              {hoveredAxis.score}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
