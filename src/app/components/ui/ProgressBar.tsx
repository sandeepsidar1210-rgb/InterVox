import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { motion, useAnimation } from "framer-motion";

export default function ProgressBar() {
  const location = useLocation();
  const controls = useAnimation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // On location change, animate progress bar from 0 to 1, then fade out
    const triggerTransition = async () => {
      setVisible(true);
      // Reset scaleX to 0 instantly
      await controls.set({ scaleX: 0, opacity: 1 });
      // Progress to 30% quickly
      await controls.start({
        scaleX: 0.3,
        transition: { duration: 0.1, ease: "easeOut" }
      });
      // Creep up to 70%
      await controls.start({
        scaleX: 0.7,
        transition: { duration: 0.3, ease: "linear" }
      });
      // Finish to 100%
      await controls.start({
        scaleX: 1,
        transition: { duration: 0.1, ease: "easeIn" }
      });
      // Fade out
      await controls.start({
        opacity: 0,
        transition: { duration: 0.2 }
      });
      setVisible(false);
    };

    triggerTransition();
  }, [location, controls]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={controls}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        backgroundColor: "var(--accent-primary)",
        originX: 0,
        zIndex: 9999,
        boxShadow: "0 0 8px var(--accent-glow)",
        pointerEvents: "none",
      }}
    />
  );
}
