import { useEffect, useState } from "react";

const EMOJI: Record<string, string> = {
  idle: "🐱", thinking: "🤔", alert: "⚠️", happy: "😸", sleep: "😴",
};

const FPS: Record<string, number> = {
  idle: 2, thinking: 4, alert: 3, happy: 4, sleep: 1,
};

const FRAME_COUNT = 4;

interface CatProps {
  state: string;
  size?: number;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function Cat({ state, size = 96, style, onClick }: CatProps) {
  const [frame, setFrame] = useState(1);
  const [fallback, setFallback] = useState(false);

  useEffect(() => { setFrame(1); setFallback(false); }, [state]);

  useEffect(() => {
    const interval = 1000 / (FPS[state] ?? 2);
    const id = setInterval(() => setFrame(f => (f % FRAME_COUNT) + 1), interval);
    return () => clearInterval(id);
  }, [state]);

  if (fallback) {
    return (
      <div
        onClick={onClick}
        style={{
          width: size, height: size,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.6,
          cursor: onClick ? "pointer" : "default",
          userSelect: "none",
          ...style,
        }}
      >
        {EMOJI[state] ?? "🐱"}
      </div>
    );
  }

  const src = `/cat/${state}/${state}_${String(frame).padStart(2, "0")}.png`;

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={state}
      draggable={false}
      onClick={onClick}
      onError={() => setFallback(true)}
      style={{
        imageRendering: "pixelated",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        ...style,
      }}
    />
  );
}
