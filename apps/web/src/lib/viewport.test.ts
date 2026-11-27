import { describe, expect, it, vi } from "vitest";
import { hiddenBottom, revealDelta, watchViewport } from "./viewport";

describe("спрятанная снизу часть окна", () => {
  it("окно выше видимой части: спрятана разница", () => {
    expect(hiddenBottom(1180, 900)).toBe(280);
    expect(hiddenBottom(820, 619.5)).toBe(201);
  });

  it("всё видно или разница меньше 2 px: ничего не спрятано", () => {
    expect(hiddenBottom(844, 844)).toBe(0);
    expect(hiddenBottom(844, 843)).toBe(0);
    expect(hiddenBottom(844, 900)).toBe(0);
  });

  it("нет данных от Telegram или они странные: 0", () => {
    expect(hiddenBottom(844, undefined)).toBe(0);
    expect(hiddenBottom(844, 0)).toBe(0);
    expect(hiddenBottom(844, Number.NaN)).toBe(0);
    expect(hiddenBottom(0, 500)).toBe(0);
  });

  it("сбой данных не съедает больше 60% окна", () => {
    expect(hiddenBottom(1000, 10)).toBe(600);
  });
});

describe("слежение за видимой частью", () => {
  function fakeWindow(innerHeight: number) {
    const style = new Map<string, string>();
    const listeners: Array<() => void> = [];
    const win = {
      innerHeight,
      document: { documentElement: { style: { setProperty: (k: string, v: string) => style.set(k, v) } } },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    };
    return { win: win as unknown as Window, style, resize: (h: number) => ((win.innerHeight = h), listeners.forEach((f) => f())) };
  }

  it("пишет переменную сразу, при событии Telegram и при повороте", () => {
    const { win, style, resize } = fakeWindow(1180);
    let onChange = () => {};
    const tg = { viewportStableHeight: 900, onEvent: vi.fn((_: string, fn: () => void) => (onChange = fn)) };
    watchViewport(tg, win);
    expect(style.get("--app-hidden-bottom")).toBe("280px");
    expect(tg.onEvent).toHaveBeenCalledWith("viewportChanged", expect.any(Function));

    tg.viewportStableHeight = 1180;
    onChange();
    expect(style.get("--app-hidden-bottom")).toBe("0px");

    tg.viewportStableHeight = 600;
    resize(820);
    expect(style.get("--app-hidden-bottom")).toBe("220px");
  });
});

describe("докрутка блока в видимую часть", () => {
  // Шапка до 80, видимая часть до 544: место 464 px.
  it("блок виден целиком: страница не двигается", () => {
    expect(revealDelta(100, 400, 80, 544)).toBe(0);
  });

  it("низ блока за краем: прокрутка вниз ровно настолько", () => {
    expect(revealDelta(300, 690, 80, 544)).toBe(146);
  });

  it("верх блока под шапкой: прокрутка вверх", () => {
    expect(revealDelta(63, 347, 80, 544)).toBe(-17);
  });

  it("блок выше видимой части: виден верх (холст), а не кнопки", () => {
    expect(revealDelta(300, 900, 80, 544)).toBe(220);
    expect(revealDelta(20, 620, 80, 544)).toBe(-60);
  });
});
