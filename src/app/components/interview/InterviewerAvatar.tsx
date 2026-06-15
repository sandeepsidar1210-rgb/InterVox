import { motion } from "framer-motion";

interface InterviewerAvatarProps {
  state: "idle" | "speaking" | "listening" | "thinking";
  name?: string;
  voice?: string;
  highlight?: boolean;
}

export default function InterviewerAvatar({ state, name = "Arjun", voice = "meera", highlight = false }: InterviewerAvatarProps) {
  // Get initials from name
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AI";

  const getStatusText = () => {
    switch (state) {
      case "speaking":
        return "Speaking...";
      case "listening":
        return "Listening...";
      case "thinking":
        return "Thinking...";
      default:
        return "Ready";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-var(--surface-2) rounded-2xl border border-var(--glass-border) glass-panel text-center w-full max-w-sm mx-auto select-none">
      <div className="relative w-40 h-40 flex items-center justify-center mb-6">
        {/* Personalisation Reference Glow Highlight */}
        {highlight && (
          <motion.div
            className="absolute -inset-2 rounded-full border-4"
            style={{
              borderColor: "var(--accent-secondary, #00CEC9)",
              boxShadow: "0 0 20px var(--accent-secondary, #00CEC9)",
              opacity: 0.9,
            }}
            animate={{
              scale: [1, 1.06, 1],
              opacity: [0.9, 0.3, 0.9],
            }}
            transition={{
              duration: 1.5,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Pulsing ring for speaking */}
        {state === "speaking" && (
          <motion.div
            className="absolute inset-0 rounded-full border-4"
            style={{
              borderColor: "var(--accent-primary)",
              opacity: 0.6,
            }}
            animate={{
              scale: [1, 1.08, 1.04, 1.08, 1],
              opacity: [0.6, 0.2, 0.4, 0.2, 0.6],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Pulsing ring for listening */}
        {state === "listening" && (
          <motion.div
            className="absolute inset-0 rounded-full border-4"
            style={{
              borderColor: "var(--accent-secondary)",
              opacity: 0.8,
            }}
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.8, 0.3, 0.8],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Shimmer overlay for thinking */}
        {state === "thinking" && (
          <div className="absolute inset-0 rounded-full overflow-hidden border-2 border-dashed border-[#6C5CE7]/40 animate-pulse">
            <div
              className="w-[200%] h-full bg-gradient-to-r from-transparent via-white/10 to-transparent absolute top-0 -left-full animate-[shimmer_1.5s_infinite]"
              style={{
                backgroundSize: "200% 100%",
              }}
            />
          </div>
        )}

        {/* Circular Avatar Body */}
        <div
          className="w-32 h-32 rounded-full flex items-center justify-center relative z-10 shadow-lg text-4xl font-extrabold tracking-wide"
          style={{
            background: "radial-gradient(circle, var(--accent-primary) 0%, var(--accent-secondary) 100%)",
            color: "var(--text-primary)",
            textShadow: "0 2px 10px rgba(0,0,0,0.3)",
            boxShadow: "0 8px 32px var(--accent-glow)",
          }}
        >
          {initials}
        </div>
      </div>

      {/* Interviewer Profile Details */}
      <h3 className="text-lg font-bold text-white mb-1">{name}</h3>
      <p className="text-xs text-[#9090a8] mb-4 uppercase tracking-wider font-semibold">Voice Model: {voice}</p>

      {/* Dynamic Status Pill Badge */}
      <span
        className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
          state === "speaking"
            ? "bg-[#6C5CE7]/20 text-[#6C5CE7] border border-[#6C5CE7]/30 shadow-[0_0_12px_rgba(108,92,231,0.2)]"
            : state === "listening"
            ? "bg-[#00CEC9]/20 text-[#00CEC9] border border-[#00CEC9]/30 shadow-[0_0_12px_rgba(0,206,201,0.2)]"
            : state === "thinking"
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse"
            : "bg-[#1e1e24] text-[#9090a8] border border-var(--glass-border)"
        }`}
      >
        {getStatusText()}
      </span>

      {/* Inline styles for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
