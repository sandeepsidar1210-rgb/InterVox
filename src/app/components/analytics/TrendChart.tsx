import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TrendPoint {
  date: string;
  value: number;
  label: string;
}

interface TrendChartProps {
  data: TrendPoint[];
  color: string;
  title: string;
  unit: string;
}

export default function TrendChart({ data, color, title, unit }: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Setup dimensions
  const viewBoxWidth = 480;
  const viewBoxHeight = 140;
  const paddingLeft = 30;
  const paddingRight = 30;
  const paddingTop = 20;
  const paddingBottom = 20;

  const chartWidth = viewBoxWidth - paddingLeft - paddingRight;
  const chartHeight = viewBoxHeight - paddingTop - paddingBottom;

  if (!data || data.length === 0) {
    return (
      <div className="glass-panel p-5 flex flex-col items-center justify-center h-[140px] text-xs text-text-secondary">
        No data available
      </div>
    );
  }

  // Calculate scales
  const values = data.map((d) => d.value);
  const minVal = 0; // Baseline at 0 is standard for metrics
  const maxVal = Math.max(...values, 10) * 1.15; // 15% headroom

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index * chartWidth) / (data.length - 1);
  };

  const getY = (val: number) => {
    const range = maxVal - minVal;
    if (range === 0) return paddingTop + chartHeight / 2;
    // Invert because SVG y increases downwards
    return paddingTop + chartHeight - ((val - minVal) / range) * chartHeight;
  };

  // Map data to SVG points
  const points = data.map((d, index) => ({
    x: getX(index),
    y: getY(d.value),
    original: d,
    index,
  }));

  // Generate smooth Bezier path command
  const getBezierPath = () => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p1.x - (p1.x - p0.x) / 3;
      const cpY2 = p1.y;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const linePath = getBezierPath();
  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
    : "";

  const gradId = `gradient-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="glass-panel p-5 bg-surface-2/30 flex flex-col gap-3 relative border-glass-border">
      {/* Chart Header */}
      <div className="flex justify-between items-center">
        <div>
          <h4
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: "0.875rem",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h4>
          {data.length > 0 && (
            <p className="text-[10px] text-text-secondary">
              Latest: {data[data.length - 1].value} {unit}
            </p>
          )}
        </div>
      </div>

      {/* SVG Stage */}
      <div className="relative w-full h-[140px] flex items-center justify-center">
        <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = paddingTop + ratio * chartHeight;
            return (
              <line
                key={ratio}
                x1={paddingLeft}
                y1={y}
                x2={paddingLeft + chartWidth}
                y2={y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Area Fill under the curve */}
          {areaPath && (
            <path d={areaPath} fill={`url(#${gradId})`} />
          )}

          {/* Bezier Trend Line */}
          {linePath && (
            <motion.path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          )}

          {/* Vertices circles */}
          {points.map((pt) => (
            <circle
              key={pt.index}
              cx={pt.x}
              cy={pt.y}
              r={hoveredIndex === pt.index ? "5" : "3.5"}
              fill={color}
              stroke="var(--surface-1)"
              strokeWidth={hoveredIndex === pt.index ? "2" : "1"}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredIndex(pt.index)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>

        {/* Hover Tooltip */}
        <AnimatePresence>
          {hoveredIndex !== null && points[hoveredIndex] && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 5 }}
              className="absolute pointer-events-none bg-surface-3/95 backdrop-blur-md px-2.5 py-1 rounded-lg border border-glass-border shadow-xl z-30 flex flex-col items-center justify-center text-center min-w-[70px]"
              style={{
                left: `${(points[hoveredIndex].x / viewBoxWidth) * 100}%`,
                top: `${(points[hoveredIndex].y / viewBoxHeight) * 100 - 35}%`,
                transform: "translateX(-50%)",
              }}
            >
              <span className="text-[8px] font-bold text-text-secondary uppercase">
                {points[hoveredIndex].original.date}
              </span>
              <span className="text-xs font-extrabold text-white">
                {points[hoveredIndex].original.value} {unit}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
