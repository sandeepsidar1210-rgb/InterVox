export default function GridBackground() {
  return (
    <div
      className="absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden"
      style={{
        zIndex: 0,
      }}
    >
      {/* SVG Grid Pattern */}
      <svg
        className="absolute inset-0 w-full h-full"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="grid-pattern"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(255, 255, 255, 0.04)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>

      {/* Radial fading mask */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 20%, var(--surface-1) 80%)",
        }}
      />
    </div>
  );
}
