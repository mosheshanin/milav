import { describe, expect, it } from "vitest";
import {
  checkReminderText,
  isShabbat,
  localDayMinute,
  minuteText,
  nextReminderAt,
  pickReminder,
  renderReminder,
} from "./reminders";

const TZ = "Asia/Jerusalem";
const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();
/** Номер дня по дате (полдень UTC, чтобы не зависеть от пояса). */
const dayOf = (date: string) => Math.floor(at(`${date}T12:00:00Z`) / 86_400_000);

describe("шаббат", () => {
  it("с пятницы 15:00 до конца субботы", () => {
    // 16.10.2026 пятница, 17.10 суббота, 18.10 воскресенье.
    expect(isShabbat(dayOf("2026-10-16"), 14 * 60 + 59)).toBe(false);
    expect(isShabbat(dayOf("2026-10-16"), 15 * 60)).toBe(true);
    expect(isShabbat(dayOf("2026-10-17"), 0)).toBe(true);
    expect(isShabbat(dayOf("2026-10-17"), 23 * 60 + 59)).toBe(true);
    expect(isShabbat(dayOf("2026-10-18"), 0)).toBe(false);
    expect(isShabbat(dayOf("2026-10-15"), 20 * 60)).toBe(false);
  });
});

describe("следующее напоминание", () => {
  it("сегодня, если время ещё впереди, иначе завтра (по часам ученика)", () => {
    // Иерусалим летнее время +3: 20:00 местного это 17:00 UTC.
    expect(iso(nextReminderAt(TZ, 1200, at("2026-10-14T10:00:00Z")))).toBe("2026-10-14T17:00:00.000Z");
    expect(iso(nextReminderAt(TZ, 1200, at("2026-10-14T17:00:00Z")))).toBe("2026-10-15T17:00:00.000Z");
    // Нью-Йорк: 08:00 местного (-4 летом) это 12:00 UTC.
    expect(iso(nextReminderAt("America/New_York", 480, at("2026-10-14T13:00:00Z")))).toBe("2026-10-15T12:00:00.000Z");
  });

  it("пятница вечером и суббота пропускаются, утро пятницы нет", () => {
    // Четверг 15.10 после 20:00 → вечер пятницы в шаббат → воскресенье 18.10.
    expect(iso(nextReminderAt(TZ, 1200, at("2026-10-15T18:00:00Z")))).toBe("2026-10-18T17:00:00.000Z");
    // В 8:00 пятница ещё не шаббат.
    expect(iso(nextReminderAt(TZ, 480, at("2026-10-15T18:00:00Z")))).toBe("2026-10-16T05:00:00.000Z");
  });

  it("переход на зимнее время (25.10.2026 в Израиле): 20:00 остаётся 20:00", () => {
    expect(iso(nextReminderAt(TZ, 1200, at("2026-10-25T10:00:00Z")))).toBe("2026-10-25T18:00:00.000Z");
  });

  it("местный день и минута", () => {
    expect(localDayMinute(TZ, at("2026-10-14T17:30:00Z"))).toEqual({ day: dayOf("2026-10-14"), minute: 20 * 60 + 30 });
    expect(localDayMinute(TZ, at("2026-10-14T21:10:00Z"))).toEqual({ day: dayOf("2026-10-15"), minute: 10 });
  });

  it("время текстом", () => {
    expect([minuteText(1200), minuteText(485), minuteText(0)]).toEqual(["20:00", "8:05", "0:00"]);
  });
});

describe("тексты", () => {
  it("проверка: пусто, длина, скобки, неизвестные подстановки", () => {
    expect(checkReminderText("daily", "  Привет, {имя}!  ")).toEqual({ ok: true, text: "Привет, {имя}!" });
    expect(checkReminderText("daily", "   ")).toMatchObject({ ok: false, error: "empty" });
    expect(checkReminderText("daily", 5)).toMatchObject({ ok: false, error: "empty" });
    expect(checkReminderText("daily", "а".repeat(501))).toMatchObject({ ok: false, error: "too_long" });
    expect(checkReminderText("daily", "Скобка { без пары")).toMatchObject({ ok: false, error: "bad_braces" });
    expect(checkReminderText("daily", "{имя} и }")).toMatchObject({ ok: false, error: "bad_braces" });
    expect(checkReminderText("daily", "Привет, {name}")).toEqual({ ok: false, error: "unknown_placeholder", name: "name" });
    // В подтверждении нет данных о прогрессе.
    expect(checkReminderText("enabled", "Осталось {осталось_слов}")).toMatchObject({ ok: false, error: "unknown_placeholder" });
    expect(checkReminderText("daily", "Строка 1\r\nСтрока 2\u0007")).toEqual({ ok: true, text: "Строка 1\nСтрока 2" });
  });

  it("подстановка и пропуск текстов без данных", () => {
    expect(renderReminder("Привет, {имя}! Осталось {осталось_слов}.", { имя: "Аня", осталось_слов: "3" })).toBe("Привет, Аня! Осталось 3.");
    expect(renderReminder("Осталось {осталось_слов}", { имя: "Аня" })).toBeNull();
    const texts = [
      { id: 1, text: "А {осталось_слов}" },
      { id: 2, text: "Б" },
      { id: 3, text: "В" },
    ];
    // Без данных о цели текст 1 не выбирается; прошлый текст (2) не повторяется.
    expect(pickReminder(texts, {}, 2, 0)).toEqual({ id: 3, text: "В" });
    expect(pickReminder(texts, { осталось_слов: "2" }, 3, 0)).toEqual({ id: 1, text: "А 2" });
    // Если подходит только прошлый текст, он повторяется.
    expect(pickReminder([{ id: 2, text: "Б" }], {}, 2, 0.9)).toEqual({ id: 2, text: "Б" });
    expect(pickReminder([], {}, null, 0)).toBeNull();
  });
});
