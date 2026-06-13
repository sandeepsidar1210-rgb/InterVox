import { motion } from "framer-motion";
import { Logo } from "../Logo";

export default function PageLoader() {
  const dotVariants = {
    animate: (i: number) => ({
      scale: [1, 1.4, 1],
      opacity: [0.4, 1, 0.4],
      transition: {
        duration: 0.8,
        repeat: Infinity,
        delay: i * 0.15,
        ease: "easeInOut",
      },
    }),
  };

  return (
    <div className="fixed inset-0 bg-[#0e0e11] text-[#f0f0f5] flex flex-col items-center justify-center z-50 gap-6">
      {/* Animated Logo */}
      <motion.div
        animate={{
          scale: [0.97, 1.03, 0.97],
          opacity: [0.85, 1, 0.85],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Logo className="h-14" />
      </motion.div>
      
      {/* 3 pulsing dots */}
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            custom={i}
            variants={dotVariants}
            animate="animate"
            className="w-2.5 h-2.5 rounded-full bg-primary"
          />
        ))}
      </div>
    </div>
  );
}
