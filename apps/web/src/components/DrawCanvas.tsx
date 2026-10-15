import { useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent, type Ref } from "react";
import {
  CANVAS_BASE_LINE as BASE_LINE,
  CANVAS_HEIGHT as HEIGHT,
  CANVAS_LINE_HEIGHT as LINE_HEIGHT,
  CANVAS_TOP_LINE as TOP_LINE,
  type Stroke,
} from "@milav/shared";

// Геометрия холста (высота, направляющие) лежит в packages/shared: по ней же сервер проверяет штрихи.
/** Высота «א» в шрифте относительно кегля (подобрано по глифам Gveret Levin). */
const GLYPH_HEIGHT_PER_EM = 0.7;

/** Кегль подсказки-призрака: обычная буква шрифта занимает строку между направляющими (около 141 px). */
const GHOST_FONT_SIZE = LINE_HEIGHT / GLYPH_HEIGHT_PER_EM;

/**
 * Толщина штриха в шрифте подсказки Gveret Levin как доля кегля. Измерено 15.10 по всем 27 формам (ширина штриха по оси
 * буквы, медиана 15,8 px при кегле 141,4 px, половина штрихов от 15 до 16,5 px).
 */
const FONT_STROKE_PER_EM = 0.112;

/**
 * Толщина линии, которой рисуется буква (px), на экране записи шаблонов и на этапе «пиши»: такая же, как у штриха
 * в шрифте подсказки (решение владельца 15.10; при нынешней геометрии 16 px, раньше было 6, потом 12). Считается
 * от кегля подсказки, поэтому при изменении холста остаётся равной шрифту. Только для вида: распознавание сравнивает
 * точки штрихов, толщина на него не влияет. Ею же рисуются превью записанных вариантов (`StrokePreview`).
 */
export const INK_WIDTH = Math.round(GHOST_FONT_SIZE * FONT_STROKE_PER_EM);

export interface DrawHandle {
  clear: () => void;
  strokes: () => Stroke[];
  hasInk: () => boolean;
  /** Высота обычной буквы в пикселях холста (для сравнения с шаблонами). */
  lineHeight: () => number;
}

interface Props {
  /** Бледная подсказка: буква, которую надо обвести. */
  ghost?: string;
  /** Вызывается при каждом изменении: есть ли на холсте рисунок. */
  onInkChange?: (hasInk: boolean) => void;
  disabled?: boolean;
  ref?: Ref<DrawHandle>;
}

/** Холст для рукописной буквы: рисование пальцем, направляющие линии и необязательная подсказка. */
export function DrawCanvas({ ghost, onInkChange, disabled = false, ref }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = canvas.clientWidth;
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    // Направляющие линии.
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    for (const k of [TOP_LINE, BASE_LINE]) {
      ctx.beginPath();
      ctx.moveTo(0, k * HEIGHT);
      ctx.lineTo(width, k * HEIGHT);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (ghost) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = `${GHOST_FONT_SIZE}px "Gveret Levin", Heebo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(ghost, width / 2, BASE_LINE * HEIGHT);
    }

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = INK_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x + 0.01, stroke[0]!.y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, [ghost]);

  // Размер с учётом плотности экрана; перерисовка при смене ширины или подсказки.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(HEIGHT * ratio);
      paint();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    // Шрифт подсказки может загрузиться позже первой отрисовки.
    if (ghost) void document.fonts.load(`48px "Gveret Levin"`, ghost).then(paint);
    return () => observer.disconnect();
  }, [paint, ghost]);

  const notify = useCallback(() => onInkChange?.(strokesRef.current.length > 0), [onInkChange]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokesRef.current = [];
        paint();
        notify();
      },
      strokes: () => strokesRef.current.map((s) => s.slice()),
      hasInk: () => strokesRef.current.length > 0,
      lineHeight: () => LINE_HEIGHT,
    }),
    [paint, notify],
  );

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([point(e)]);
    paint();
    notify();
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    strokesRef.current[strokesRef.current.length - 1]?.push(point(e));
    paint();
  }

  function up() {
    drawingRef.current = false;
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="draw-canvas"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ height: HEIGHT, touchAction: "none" }}
      className="w-full rounded-card border border-line bg-surface"
    />
  );
}
