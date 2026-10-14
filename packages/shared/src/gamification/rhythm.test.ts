import { describe, expect, it } from "vitest";
import { applyActivity, EMPTY_PLAY, viewPlay, type PlayState } from "./rhythm";
import { epochDayToIso, weekIndex } from "./time";

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
// Воскресенье 11.10.2026 начинает неделю; D(n) это n-й день после него.
const SUN = day("2026-10-11");
const D = (n: number) => SUN + n;

function run(events: [number, number][], goal = 5, from: PlayState = EMPTY_PLAY) {
  let state = from;
  const log: { newDay: boolean; goalMet: boolean }[] = [];
  for (const [d, words] of events) {
    const r = applyActivity(state, { day: d, words }, goal);
    state = r.state;
    log.push({ newDay: r.newDay, goalMet: r.goalMet });
  }
  return { state, log };
}

describe("день занятий", () => {
  it("первое занятие создаёт день, неделю и отмечает день недели", () => {
    const { state } = run([[D(3), 1]]);
    expect(state.activeDays).toBe(1);
    expect(state.lastDay).toBe(D(3));
    expect(state.weekIdx).toBe(weekIndex(SUN));
    expect(state.weekDays).toBe(0b0001000);
    expect(state.weekWords).toBe(1);
  });

  it("повторное занятие в тот же день не создаёт новый день, но слова считаются", () => {
    const { state, log } = run([[D(3), 1], [D(3), 1], [D(3), 1]]);
    expect(state.activeDays).toBe(1);
    expect(state.weekWords).toBe(3);
    expect(log.map((l) => l.newDay)).toEqual([true, false, false]);
  });

  it("викторина (0 слов) тоже день занятий", () => {
    const { state } = run([[D(1), 0]]);
    expect(state.activeDays).toBe(1);
    expect(state.weekWords).toBe(0);
  });

  it("день не идёт назад: занятие со сменой пояса «назад» засчитывается в последний день", () => {
    const { state, log } = run([[D(4), 1], [D(3), 1]]);
    expect(state.lastDay).toBe(D(4));
    expect(state.activeDays).toBe(1);
    expect(state.weekWords).toBe(2);
    expect(log[1]!.newDay).toBe(false);
  });
});

describe("недели ритма", () => {
  it("неделя ритмична, когда набрано 3 дня; счёт растёт сразу и один раз", () => {
    const { state } = run([[D(0), 1], [D(2), 1]]);
    expect(state.rhythmWeeks).toBe(0);
    const third = applyActivity(state, { day: D(5), words: 1 }, 5);
    expect(third.state.rhythmWeeks).toBe(1);
    expect(third.state.rhythmHist & 1).toBe(1);
    const fourth = applyActivity(third.state, { day: D(6), words: 1 }, 5);
    expect(fourth.state.rhythmWeeks).toBe(1);
  });

  it("новая неделя: итоги прошлой запоминаются, окно сдвигается, счёт недель ритма не уменьшается", () => {
    const { state } = run([[D(0), 2], [D(1), 3], [D(2), 4], [D(7), 1]]);
    expect(state.weekIdx).toBe(weekIndex(SUN) + 1);
    expect(state.rhythmWeeks).toBe(1);
    expect(state.rhythmHist).toBe(0b10);
    expect(state.prevWeekIdx).toBe(weekIndex(SUN));
    expect(state.prevWeekDays).toBe(3);
    expect(state.prevWeekWords).toBe(9);
    expect(state.weekDays).toBe(0b1);
    expect(state.weekWords).toBe(1);
  });

  it("пропуск нескольких недель: окно сдвигается на пропуск, итогов прошлой недели нет, накопленное остаётся", () => {
    const { state } = run([[D(0), 1], [D(1), 1], [D(2), 1], [D(7 * 3 + 1), 1]]);
    expect(state.rhythmWeeks).toBe(1);
    expect(state.rhythmHist).toBe(0b1000);
    expect(state.prevWeekIdx).toBe(0);
    expect(state.weekIdx).toBe(weekIndex(SUN) + 3);
  });

  it("пропуск больше 8 недель обнуляет окно, но не счёт", () => {
    const { state } = run([[D(0), 1], [D(1), 1], [D(2), 1], [D(7 * 9), 1]]);
    expect(state.rhythmHist).toBe(0);
    expect(state.rhythmWeeks).toBe(1);
  });

  it("недели ритма набираются «всего», не подряд", () => {
    const events: [number, number][] = [];
    for (const week of [0, 2, 5, 9]) for (const d of [0, 1, 2]) events.push([D(week * 7 + d), 1]);
    expect(run(events).state.rhythmWeeks).toBe(4);
  });
});

describe("возвращение", () => {
  it("перерыв в 14 пустых дней даёт возвращение, 13 нет", () => {
    expect(run([[D(0), 1], [D(15), 1]]).state.returns).toBe(1);
    expect(run([[D(0), 1], [D(14), 1]]).state.returns).toBe(0);
  });

  it("первое занятие не считается возвращением", () => {
    expect(run([[D(100), 1]]).state.returns).toBe(0);
  });
});

describe("цель дня", () => {
  it("засчитывается один раз в день, в тот момент, когда набрано нужное число", () => {
    const { state, log } = run([[D(1), 1], [D(1), 1], [D(1), 1], [D(1), 1]], 3);
    expect(log.map((l) => l.goalMet)).toEqual([false, false, true, false]);
    expect(state.goalDays).toBe(1);
    expect(state.goalWords).toBe(4);
  });

  it("новый день начинает счёт слов заново", () => {
    const { state } = run([[D(1), 3], [D(2), 2]], 3);
    expect(state.goalDays).toBe(1);
    expect(state.goalWords).toBe(2);
  });

  it("выключенная цель (0) не считается; викторина цель не двигает", () => {
    expect(run([[D(1), 10]], 0).state.goalDays).toBe(0);
    expect(run([[D(1), 0]], 3).state.goalDays).toBe(0);
  });
});

describe("что показать (viewPlay)", () => {
  it("дни текущей недели и цель сегодня", () => {
    const { state } = run([[D(1), 2], [D(3), 4]], 5);
    const view = viewPlay(state, D(3), 5);
    expect(view.days).toEqual([false, true, false, true, false, false, false]);
    expect(view.todayIndex).toBe(3);
    expect(view.daysThisWeek).toBe(2);
    expect(view.wordsThisWeek).toBe(6);
    expect(view.goal).toEqual({ target: 5, done: 4, met: false });
    expect(view.recap).toBeNull();
  });

  it("на следующей неделе дни пусты, цель за вчера не считается, итоги прошлой недели показываются", () => {
    const { state } = run([[D(0), 2], [D(1), 3], [D(2), 4]], 5);
    const view = viewPlay(state, D(7), 5);
    expect(view.days.every((d) => !d)).toBe(true);
    expect(view.wordsThisWeek).toBe(0);
    expect(view.goal).toEqual({ target: 5, done: 0, met: false });
    expect(view.recap).toEqual({ weekIdx: weekIndex(SUN), words: 9, days: 3 });
    expect(view.rhythmLast8).toBe(1);
    expect(view.rhythmWeeks).toBe(1);
  });

  it("итоги прошлой недели остаются и после первого занятия новой недели", () => {
    const { state } = run([[D(0), 5], [D(7), 1]], 5);
    const view = viewPlay(state, D(7), 5);
    expect(view.recap).toEqual({ weekIdx: weekIndex(SUN), words: 5, days: 1 });
  });

  it("через две недели итогов прошлой недели нет (на ней ничего не было), окно сдвинулось", () => {
    const { state } = run([[D(0), 1], [D(1), 1], [D(2), 1]]);
    const view = viewPlay(state, D(14), 5);
    expect(view.recap).toBeNull();
    expect(view.rhythmLast8).toBe(1);
    expect(viewPlay(state, D(7 * 8), 5).rhythmLast8).toBe(0);
  });

  it("без занятий: пустая неделя, цель выключена даёт null", () => {
    const view = viewPlay(EMPTY_PLAY, D(2), 0);
    expect(view.days.every((d) => !d)).toBe(true);
    expect(view.goal).toBeNull();
    expect(view.recap).toBeNull();
    expect(epochDayToIso(D(0))).toBe("2026-10-11");
  });
});
