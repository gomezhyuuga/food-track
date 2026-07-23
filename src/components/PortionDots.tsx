interface Props {
  count: number;
  target: number; // -1 = libre
  color: string;
}

export default function PortionDots({ count, target, color }: Props) {
  if (target === -1) {
    return (
      <div className="dots">
        {Array.from({ length: Math.max(count, 0) }, (_, i) => (
          <span key={i} className="dot filled" style={{ background: color }} />
        ))}
        <span className="dots-free">libre</span>
      </div>
    );
  }
  const total = Math.max(target, count);
  return (
    <div className="dots">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < count;
        const over = filled && i >= target;
        return (
          <span
            key={i}
            className={`dot ${filled ? "filled" : ""} ${over ? "over" : ""}`}
            style={filled && !over ? { background: color } : undefined}
          />
        );
      })}
    </div>
  );
}
