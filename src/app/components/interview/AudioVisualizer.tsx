import { motion } from "framer-motion";

interface AudioVisualizerProps {
  isActive: boolean;
  color?: string;
}

export default function AudioVisualizer({ isActive, color = "var(--accent-primary)" }: AudioVisualizerProps) {
  const barsCount = 28;
  const bars = Array.from({ length: barsCount });

  return (
    <div className="flex items-end justify-center gap-[2px] h-[52px] px-4 py-1 select-none pointer-events-none">
      {bars.map((_, i) => {
        // Random transition parameters generated once per bar (approximate by index variance)
        const randomDuration = 0.3 + (i % 5) * 0.1; // between 0.3s and 0.7s
        const randomHeight = 8 + (i % 7) * 6; // between 8px and 44px
        const delay = i * 0.04;

        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: "3px",
              backgroundColor: color,
            }}
            animate={
              isActive
                ? {
                    height: [randomHeight - 4, randomHeight + 4, randomHeight - 4],
                  }
                : {
                    height: 4,
                  }
            }
            transition={
              isActive
                ? {
                    duration: randomDuration,
                    repeat: Infinity,
                    repeatType: "mirror",
                    delay: delay,
                    ease: "easeInOut",
                  }
                : {
                    duration: 0.3,
                  }
            }
          />
        );
      })}
    </div>
  );
}
