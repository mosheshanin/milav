/** Эквалайзер в реальном времени: столбики по уровню звука с микрофона (значения 0..1). */
export function Equalizer({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-16 items-end justify-center gap-1" data-testid="equalizer" aria-hidden>
      {bars.map((level, i) => (
        <div
          key={i}
          className="w-2 rounded-full bg-success transition-[height] duration-75"
          style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
        />
      ))}
    </div>
  );
}
