import { Sparkles, Play, Mic, Video, MessageSquare, Star, ChevronRight } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Link } from "react-router";
import { motion } from "motion/react";
import { NeuralNetwork } from "./NeuralNetwork";
import { MagneticButton } from "./MagneticButton";
import { WordReveal } from "./WordReveal";
import GridBackground from "./ui/GridBackground";

const interviewImage = "https://images.unsplash.com/photo-1622131072758-dc5b5c4cca6e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvbmxpbmUlMjBpbnRlcnZpZXclMjBjb2FjaGluZyUyMGFwcCUyMGludGVyZmFjZXxlbnwxfHx8fDE3NzI0NDY1NjZ8MA&ixlib=rb-4.1.0&q=80&w=1080";

export function HeroSection() {
  return (
    <section className="bg-background pt-16 pb-12 lg:pt-24 lg:pb-20 overflow-hidden relative">
      {/* Grid Background */}
      <GridBackground />

      {/* Neural Network Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <NeuralNetwork />
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left Content */}
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col gap-8"
          >
            {/* Pill Tag */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex items-center gap-2 w-fit"
            >
              <span className="flex items-center gap-2 bg-primary/10 text-primary text-xs px-4 py-1.5 rounded-full border border-primary/20"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: "0.02em" }}>
                <Sparkles size={12} strokeWidth={2.5} />
                AI Powered Interview
              </span>
            </motion.div>

            {/* H1 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex flex-col gap-4"
            >
              <h1
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(2rem, 4vw, 3.25rem)",
                  lineHeight: 1.15,
                  letterSpacing: "-0.03em",
                  color: "var(--text-primary)",
                }}
              >
                What if you could{" "}
                <span className="text-secondary font-bold">train with an AI Interviewer</span>{" "}
                today?
              </h1>

              {/* Subtext */}
              <p
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: "1.0625rem", lineHeight: 1.7 }}
                className="text-text-secondary max-w-md"
              >
                Get instant feedback, refine your answers, and boost confidence. Say hello to smarter preparation.
              </p>
            </motion.div>

            {/* Social Proof */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex items-center gap-3"
            >
              <div className="flex -space-x-2">
                {["#6C5CE7", "#00CEC9", "#059669", "#DC2626"].map((color, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
                    className="w-8 h-8 rounded-full border-2 border-[#0e0e11] flex items-center justify-center text-white text-xs"
                    style={{ backgroundColor: color, fontWeight: 700 }}
                  >
                    {["J", "A", "M", "S"][i]}
                  </motion.div>
                ))}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={11} className="fill-[#F59E0B] text-[#F59E0B]" />
                  ))}
                </div>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Loved by <strong style={{ color: "var(--text-primary)" }}>2,400+</strong> job seekers
                </span>
              </div>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="flex flex-wrap items-center gap-4"
            >
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 10px rgba(108, 92, 231, 0.3)",
                    "0 0 22px rgba(108, 92, 231, 0.65)",
                    "0 0 10px rgba(108, 92, 231, 0.3)"
                  ]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="rounded-xl"
              >
                <Link
                  to="/ai-practice"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/95 text-white px-6 py-3 rounded-xl transition-all duration-150 hover:-translate-y-0.5 text-sm"
                >
                  <Play size={14} strokeWidth={2.5} className="fill-white" />
                  Try AI Mock Interview!
                </Link>
              </motion.div>
              <Link
                to="/communication-practice"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
                className="flex items-center gap-2 border-2 border-secondary text-secondary hover:bg-secondary/10 px-6 py-3 rounded-xl transition-all duration-150 text-sm"
              >
                <Mic size={14} strokeWidth={2.5} />
                Communication Practice
                <ChevronRight size={14} strokeWidth={2.5} />
              </Link>
            </motion.div>

            {/* Feature tags */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="flex flex-wrap gap-2"
            >
              {["No credit card required", "Free 5 mock sessions", "Instant AI feedback"].map((tag, i) => (
                <motion.span
                  key={tag}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 1 + i * 0.1 }}
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: "0.75rem" }}
                  className="flex items-center gap-1.5 text-text-secondary bg-surface-2 border border-glass-border px-3 py-1 rounded-full"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                  {tag}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Side — UI Mockup */}
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="relative flex items-center justify-center lg:justify-end"
          >
            {/* Decorative background blob */}
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.6, 0.4, 0.6]
              }}
              transition={{ 
                duration: 4, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-[420px] h-[420px] rounded-full bg-primary/10 blur-3xl opacity-60" />
            </motion.div>

            {/* Main mockup card */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="glass-panel relative w-full max-w-[520px] overflow-hidden shadow-2xl border-glass-border"
            >
              {/* Window bar */}
              <div className="bg-surface-3 px-4 py-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
                <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
                <span className="w-3 h-3 rounded-full bg-[#22C55E]" />
                <div className="flex-1 mx-4 bg-surface-1 rounded-md px-3 py-1 flex items-center">
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.65rem", color: "var(--text-secondary)" }}>
                    app.intervox.ai/interview
                  </span>
                </div>
              </div>

              {/* Mock interview interface */}
              <div className="bg-surface-1 p-4 relative">
                <ImageWithFallback
                  src={interviewImage}
                  alt="AI Mock Interview UI"
                  className="w-full h-56 object-cover rounded-xl opacity-80"
                />

                {/* Overlay UI elements */}
                <div className="absolute top-8 left-8 right-8 flex items-start justify-between">
                  {/* AI Coach tag */}
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full border border-white/20"
                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                    AI Coach • Live
                  </div>
                  {/* Timer */}
                  <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full border border-white/20"
                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    <Video size={11} />
                    02:34
                  </div>
                </div>
              </div>

              {/* Bottom panel */}
              <div className="bg-surface-2 border-t border-glass-border px-4 pb-4">
                {/* Question bubble */}
                <div className="bg-surface-3 rounded-xl p-4 mb-3 mt-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-white" />
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        AI Interviewer
                      </p>
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.8rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                        "Tell me about a time you handled a challenging project under a tight deadline."
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feedback bar */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 bg-surface-3 rounded-lg p-2.5 flex items-center gap-2 border border-glass-border">
                    <MessageSquare size={12} className="text-primary" />
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                      Your answer is being analyzed...
                    </span>
                    <div className="ml-auto flex gap-0.5">
                      {[40, 70, 55, 85, 65, 90, 75].map((h, i) => (
                        <motion.div 
                          key={i} 
                          animate={{ height: [`${h * 0.2}px`, `${h * 0.15}px`, `${h * 0.2}px`] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                          className="w-1 rounded-full bg-primary opacity-70" 
                          style={{ height: `${h * 0.2}px` }} 
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Score chips */}
                <div className="flex items-center gap-2">
                  {[
                    { label: "Clarity", score: "8.5", color: "#34D399" },
                    { label: "Confidence", score: "7.2", color: "#FBBF24" },
                    { label: "Structure", score: "9.0", color: "#6C5CE7" },
                  ].map((item) => (
                    <div key={item.label} className="flex-1 bg-surface-3 border border-glass-border rounded-lg p-2 text-center">
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.65rem", color: "var(--text-secondary)" }}>{item.label}</div>
                      <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.875rem", fontWeight: 700, color: item.color }}>
                        {item.score}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Floating badges */}
            <motion.div 
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              className="glass-panel absolute -left-4 top-1/4 shadow-xl border-glass-border px-4 py-3 hidden xl:flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles size={16} className="text-primary" />
              </div>
              <div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)" }}>Instant Feedback</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.65rem", color: "var(--text-secondary)" }}>Real-time AI analysis</div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1 }}
              whileHover={{ scale: 1.05 }}
              className="glass-panel absolute -right-2 bottom-1/4 shadow-xl border-glass-border px-4 py-3 hidden xl:flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Star size={16} className="text-emerald-400 fill-emerald-400/50" />
              </div>
              <div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)" }}>Score: 87%</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.65rem", color: "var(--text-secondary)" }}>Great performance!</div>
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}