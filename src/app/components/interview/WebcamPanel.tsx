import React, { useState } from "react";
import { motion } from "framer-motion";
import { Video, VideoOff, Eye, EyeOff, Shield, ShieldAlert, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus } from "lucide-react";
import { NonVerbalMetrics } from "../../../hooks/useNonVerbalAnalysis";

interface WebcamPanelProps {
  isActive: boolean;
  metrics: NonVerbalMetrics;
  onEnable: () => void;
  onDisable: () => void;
  isEnabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export default function WebcamPanel({
  isActive,
  metrics,
  onEnable,
  onDisable,
  isEnabled,
  videoRef,
}: WebcamPanelProps) {
  const [isPaused, setIsPaused] = useState(false);

  // Helper to draw the pose arrow
  const renderPoseIcon = () => {
    switch (metrics.headPose) {
      case "up":
        return <ArrowUp size={14} className="text-primary animate-bounce" />;
      case "down":
        return <ArrowDown size={14} className="text-primary animate-bounce" />;
      case "left":
        return <ArrowLeft size={14} className="text-primary animate-bounce" />;
      case "right":
        return <ArrowRight size={14} className="text-primary animate-bounce" />;
      default:
        return <Minus size={14} className="text-emerald-400" />;
    }
  };

  // Helper for expression color/style
  const getExpressionBadgeStyle = () => {
    switch (metrics.expressionState) {
      case "confident":
        return "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30";
      case "uncertain":
        return "bg-amber-500/25 text-amber-400 border border-amber-500/30";
      case "stressed":
        return "bg-red-500/25 text-red-400 border border-red-500/30";
      default:
        return "bg-white/10 text-white border border-white/20";
    }
  };

  return (
    <div className="w-[280px] flex-shrink-0 select-none">
      {!isEnabled ? (
        /* Disabled Placeholder */
        <div className="h-[210px] w-full rounded-2xl border-2 border-dashed border-glass-border bg-glass-bg flex flex-col items-center justify-center p-6 text-center transition-all hover:border-primary/50">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
            <Video size={20} className="text-text-secondary" />
          </div>
          <p className="text-xs font-semibold text-white mb-1">
            Enable camera for body language analysis
          </p>
          <p className="text-[10px] text-text-secondary mb-4 leading-normal">
            Runs locally — no video is uploaded or stored
          </p>
          <button
            onClick={onEnable}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-[0_4px_12px_var(--accent-glow)]"
          >
            <Video size={12} strokeWidth={2.5} />
            Enable Camera
          </button>
        </div>
      ) : (
        /* Active Webcam Panel */
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-3"
        >
          <div className="relative h-[210px] w-full rounded-2xl overflow-hidden bg-black/80 border border-glass-border group shadow-xl">
            {/* Webcam Video */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                isPaused ? "opacity-30" : "opacity-100"
              }`}
            />

            {/* Privacy Shield Button (Top Right) */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm flex items-center justify-center border border-white/10 transition-colors text-white"
              title={isPaused ? "Resume Analysis" : "Pause Analysis (Privacy Shield)"}
            >
              {isPaused ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>

            {/* Privacy Shield Overlay */}
            {isPaused && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-md text-center p-4">
                <Shield size={28} className="text-[#00CEC9] mb-2 animate-pulse" />
                <p className="text-xs font-bold text-white mb-0.5">Privacy Shield Active</p>
                <p className="text-[10px] text-text-secondary">Analysis paused, camera remains open</p>
              </div>
            )}

            {/* Live Metrics Overlay (Bottom) */}
            {!isPaused && (
              <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 flex items-center justify-between gap-2">
                {/* Eye Contact Indicator */}
                <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/5">
                  <span className="relative flex h-2.5 w-2.5">
                    {metrics.framesSampled > 0 ? (
                      metrics.isLookingAtScreen ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      )
                    ) : (
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    )}
                  </span>
                  <span className="text-[10px] font-bold text-white tracking-wider">Eye Contact</span>
                </div>

                {/* Head Pose & Expression Badges */}
                <div className="flex items-center gap-1.5">
                  {/* Pose */}
                  <div className="flex items-center justify-center bg-black/50 backdrop-blur-sm w-6 h-6 rounded-lg border border-white/5" title={`Head pose: ${metrics.headPose}`}>
                    {renderPoseIcon()}
                  </div>

                  {/* Expression */}
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${getExpressionBadgeStyle()}`}>
                    {metrics.expressionState}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Trigger / Footer Links */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-text-secondary flex items-center gap-1">
              <Shield size={10} className="text-emerald-400" /> Real-time On-device
            </span>
            <button
              onClick={onDisable}
              className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors focus:outline-none"
            >
              Disable Camera
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
