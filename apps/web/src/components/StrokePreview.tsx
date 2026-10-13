import type { Stroke } from "@milav/shared";

/** Маленькая картинка записанных штрихов: по ней видно, что вариант записан, и какой он. */
export function StrokePreview({ strokes, className = "" }: { strokes: Stroke[]; className?: string }) {
  const points = strokes.flat();
  if (points.length === 0) return <div className={className} aria-hidden />;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // Квадрат с запасом, чтобы разные по форме буквы выглядели в одном масштабе и не прилипали к краю.
  const side = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1) * 1.2;
  const x0 = (minX + Math.max(...xs)) / 2 - side / 2;
  const y0 = (minY + Math.max(...ys)) / 2 - side / 2;

  return (
    <svg viewBox={`${x0} ${y0} ${side} ${side}`} className={className} role="img" aria-label="Записанный рисунок">
      {strokes.map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.length === 1 ? `${stroke[0]!.x},${stroke[0]!.y} ${stroke[0]!.x + 0.01},${stroke[0]!.y}` : stroke.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={side / 14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
