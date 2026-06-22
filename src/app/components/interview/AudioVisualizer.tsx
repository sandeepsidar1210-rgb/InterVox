import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isActive: boolean;
  color?: string;
  analyser?: AnalyserNode | null;
  getAnalyser?: () => AnalyserNode | null;
}

export default function AudioVisualizer({ isActive, color = "var(--accent-primary)", analyser, getAnalyser }: AudioVisualizerProps) {
  const barsCount = 28;
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const activeAnalyser = analyser || (getAnalyser ? getAnalyser() : null);
    
    // Determine if we should run or stay flat
    const hasAnalyserSource = !!analyser || !!getAnalyser;
    const shouldRun = isActive && (!hasAnalyserSource || activeAnalyser);
    
    if (!shouldRun) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Reset all bar heights to 4px (flat)
      if (containerRef.current) {
        const barElements = containerRef.current.children;
        for (let i = 0; i < barElements.length; i++) {
          (barElements[i] as HTMLElement).style.height = "4px";
        }
      }
      return;
    }

    const bufferLength = activeAnalyser ? activeAnalyser.frequencyBinCount : 0;
    const dataArray = activeAnalyser ? new Uint8Array(bufferLength) : null;
    let time = 0;

    const updateBars = () => {
      if (activeAnalyser && dataArray) {
        activeAnalyser.getByteFrequencyData(dataArray);
        
        if (containerRef.current) {
          const barElements = containerRef.current.children;
          for (let i = 0; i < barElements.length; i++) {
            // Focus on vocal frequency range
            const binIndex = Math.floor((i / barsCount) * (bufferLength * 0.4));
            const value = dataArray[binIndex] || 0;
            
            // Bell curve weighting to shape it like a symmetric wave
            const center = barsCount / 2;
            const distance = Math.abs(i - center);
            const weight = Math.pow(Math.cos((distance / center) * (Math.PI / 2.2)), 1.5);
            
            // Map 0-255 analyser value to a height between 4px and 44px
            const height = Math.max(4, (value / 255) * 40 * weight);
            (barElements[i] as HTMLElement).style.height = `${height}px`;
          }
        }
      } else {
        // Simulated natural voice waveform animation when real audio is not available (e.g. interviewer speaking)
        time += 0.15;
        if (containerRef.current) {
          const barElements = containerRef.current.children;
          for (let i = 0; i < barElements.length; i++) {
            const center = barsCount / 2;
            const distance = Math.abs(i - center);
            const weight = Math.pow(Math.cos((distance / center) * (Math.PI / 2.2)), 1.5);
            
            // Combination of multiple sine waves for organic look
            const noise = Math.sin(i * 0.3 - time) * Math.cos(i * 0.1 + time * 0.5) * 0.5 + 0.5;
            const height = Math.max(4, 4 + noise * 36 * weight * (0.6 + Math.sin(time * 0.2) * 0.4));
            (barElements[i] as HTMLElement).style.height = `${height}px`;
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateBars);
    };

    updateBars();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isActive, analyser, getAnalyser]);

  const bars = Array.from({ length: barsCount });

  return (
    <div 
      ref={containerRef}
      className="flex items-end justify-center gap-[3px] h-[52px] px-4 py-1 select-none pointer-events-none"
    >
      {bars.map((_, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: "4px",
            height: "4px",
            background: color === "var(--accent-primary)"
              ? "linear-gradient(to top, var(--accent-primary), var(--accent-secondary))"
              : color,
          }}
        />
      ))}
    </div>
  );
}

