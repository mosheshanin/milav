// Геймификация на настоящем SQLite (docs/GAMIFICATION.md, раздел 14): счётчики, бейджи, ритм по дням, цель, настройки.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alphabetLesson, auth, api, completeLetter, completeLesson, completeWord, ctx, lesson, meOf, playQuiz, post, resetHarness, speak, startQuiz, stageBody, statsRow, word } from "./test-utils/harness";
import { allLessons, catalog } from "@milav/content";

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const put = (path: string, as: number, body: unknown, env = ctx.env) =>
  api(path, { method: "PUT", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, env);
const count = async (sql: string, ...params: unknown[]) => (await ctx.env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;
const badgeIds = async (uid: number) =>
  (await ctx.env.DB.prepare("SELECT badge_id FROM user_badges WHERE user_id = ? ORDER BY badge_id").bind(uid).all<{ badge_id: string }>()).results.map((r) => r.badge_id);

/** Бейдж темы зависит от того, сколько уроков в теме первого урока: в этих проверках он не важен. */
const withoutTopic = (ids: string[]) => ids.filter((id) => !id.startsWith("topic-"));

/** Проходит все четыре этапа слова и возвращает ответ на последний этап (в нём итог слова и бейджи). */
async function finishWord(as: number, index: number) {
  const w = lesson.words[index]!;
  for (const stage of ["listen", "write", "type"] as const) {
    expect((await post("/api/progress/stage", as, await stageBody(w, stage))).status).toBe(200);
  }
  ctx.heard = w.he;
  const res = await speak(as, w.id);
  expect(res.status).toBe(200);
  return (await res.json()) as any;
}

beforeEach(() => {
  resetHarness();
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-10-14T09:00:00Z"); // среда, 12:00 по Иерусалиму
});
afterEach(() => vi.useRealTimers());

describe("новичок", () => {
  it("блок «Мой путь» пустой, цель дня включена на 5, участие в таблице выключено", async () => {
    const me = await meOf(1);
    expect(me.points).toBe(0);
    expect(me.play).toMatchObject({
      tz: "Asia/Jerusalem",
      unseenBadges: 0,
      activeDays: 0,
      recap: null,
      goal: { target: 5, done: 0, met: false },
      settings: { dailyGoal: 5, leaderboard: false, cohortExcluded: false },
      features: { leaderboard: false, repeat: true },
      week: { target: 3, wordsThisWeek: 0, rhythmWeeks: 0, rhythmLast8: 0, daysThisWeek: 0 },
      statusPath: { key: "pawn", from: 0, to: 6, passed: 0 },
    });
    expect(me.play.week.days).toEqual([false, false, false, false, false, false, false]);
    expect(me.play.week.todayIndex).toBe(3);
  });

  it("строка счётчиков создаётся один раз и не меняется от повторных входов", async () => {
    await meOf(1);
    const first = await statsRow(1);
    await meOf(1);
    expect(await statsRow(1)).toEqual(first);
    expect(await count("SELECT COUNT(*) AS n FROM user_stats")).toBe(1);
  });
});

describe("очки и счётчики", () => {
  it("слово: очко, счётчик, день занятий и первый бейдж приходят в ответе на последний этап", async () => {
    const last = await finishWord(1, 0);
    expect(last.pointsAwarded).toBe(1);
    expect(last.points).toBe(1);
    expect(last.play.newBadges).toEqual(["first-word"]);
    expect(last.play.goal).toEqual({ target: 5, done: 1, met: false });
    const row = await statsRow(1);
    expect(row).toMatchObject({ words_done: 1, letters_done: 0, active_days: 1, week_words: 1, goal_words: 1, lb_week_points: 1 });
    expect((await meOf(1)).points).toBe(1);
  });

  it("повторные и одновременные отметки очков не дают и бейдж не выдаётся дважды", async () => {
    await finishWord(1, 0);
    const again = (await (await post("/api/progress/stage", 1, { wordId: word.id, stage: "listen" })).json()) as any;
    expect(again.pointsAwarded).toBe(0);
    expect(again.play).toBeUndefined();

    // Слово 2: три этапа, затем «печатай» тремя одновременными запросами.
    const w2 = lesson.words[1]!;
    await post("/api/progress/stage", 1, await stageBody(w2, "listen"));
    await post("/api/progress/stage", 1, await stageBody(w2, "write"));
    ctx.heard = w2.he;
    await speak(1, w2.id);
    const body = await stageBody(w2, "type");
    const results = await Promise.all([1, 2, 3].map(async () => (await (await post("/api/progress/stage", 1, body)).json()) as any));
    expect(results.reduce((n, r) => n + r.pointsAwarded, 0)).toBe(1);
    expect(results.filter((r) => r.play).length).toBe(1);
    expect(await statsRow(1)).toMatchObject({ words_done: 2, active_days: 1, week_words: 2 });
    expect(await badgeIds(1)).toEqual(["first-word"]);
  });

  it("буква: считается отдельно от слов и даёт «Первый ход»", async () => {
    await completeLetter(1, alphabetLesson.letters[0]!.id);
    const row = await statsRow(1);
    expect(row).toMatchObject({ words_done: 0, letters_done: 1, active_days: 1 });
    expect(await badgeIds(1)).toEqual(["first-letter"]);
    expect((await meOf(1)).points).toBe(1);
  });

  it("слова других пользователей не влияют друг на друга", async () => {
    await finishWord(1, 0);
    await meOf(2);
    expect(await statsRow(2)).toMatchObject({ words_done: 0, active_days: 0 });
  });
});

describe("викторина: счётчики, бейджи, статус", () => {
  it("безошибочная викторина сдаёт урок: «Первая партия» и «Без единой ошибки», счётчики обновлены", async () => {
    await completeLesson(1);
    expect(await badgeIds(1)).toEqual(expect.arrayContaining(["first-word", "words-10"]));
    const res = await playQuiz(1, await startQuiz(1));
    expect(res.result).toMatchObject({ passed: true, correct: 25, firstTimePassed: true, passedLessons: 1 });
    expect(res.result!.statusChanged).toBeUndefined();
    expect(withoutTopic(res.result!.play.newBadges).sort()).toEqual(["first-lesson", "quiz-perfect"]);
    expect(await statsRow(1)).toMatchObject({ passed_lessons: 1, perfect_quizzes: 1, sections_mask: 2, alphabet_lessons: 0, words_done: 10 });
    expect(await badgeIds(1)).toContain("first-lesson");
  });

  it("повторная безошибочная викторина того же урока ничего не накручивает", async () => {
    await completeLesson(1);
    await playQuiz(1, await startQuiz(1));
    const before = await statsRow(1);
    const again = await playQuiz(1, await startQuiz(1));
    expect(again.result).toMatchObject({ firstTimePassed: false, passedLessons: 1 });
    expect(again.result!.play.newBadges).toEqual([]);
    const after = await statsRow(1);
    expect(after).toMatchObject({ passed_lessons: 1, perfect_quizzes: 1 });
    expect(after.words_done).toBe(before.words_done);
  });

  it("20 из 25 сдают урок, но «Без единой ошибки» не даёт", async () => {
    await completeLesson(1);
    const res = await playQuiz(1, await startQuiz(1), [0, 1, 2, 3, 4]);
    expect(res.result).toMatchObject({ passed: true, correct: 20 });
    expect(withoutTopic(res.result!.play.newBadges)).toEqual(["first-lesson"]);
    expect((await statsRow(1)).perfect_quizzes).toBe(0);
  });

  it("прерванная викторина ничего не меняет в счётчиках и не создаёт день занятий", async () => {
    await completeLesson(1);
    at("2026-10-15T09:00:00Z");
    const before = await statsRow(1);
    const res = await playQuiz(1, await startQuiz(1), [0, 1, 2, 3, 4, 5]);
    expect(res.aborted).toBe(true);
    expect(await statsRow(1)).toEqual(before);
  });

  it("алфавит: буквы, сданный урок алфавита и раздел", async () => {
    for (const l of alphabetLesson.letters) await completeLetter(1, l.id);
    const res = await playQuiz(1, await startQuiz(1, alphabetLesson.id));
    expect(res.result).toMatchObject({ passed: true, firstTimePassed: true });
    expect(res.result!.play.newBadges.sort()).toEqual(["first-lesson", "quiz-perfect"]);
    expect(await statsRow(1)).toMatchObject({ letters_done: 5, alphabet_lessons: 1, sections_mask: 1, passed_lessons: 1, perfect_quizzes: 1 });
  });

  it("закрытие темы: последний урок темы выдаёт бейдж темы", async () => {
    // Самая короткая тема существительных из двух и больше уроков: проход всех её викторин подряд
    // не должен упираться в минутный лимит распознавания речи, сколько бы уроков ни было в больших темах.
    const byTopic = new Map<string, typeof allLessons>();
    for (const l of allLessons.filter((l) => l.section === "nouns")) {
      byTopic.set(l.topicId, [...(byTopic.get(l.topicId) ?? []), l]);
    }
    const [topicId, topic] = [...byTopic.entries()]
      .filter(([, ls]) => ls.length >= 2)
      .sort(([a, x], [b, y]) => x.length - y.length || a.localeCompare(b))[0]!;
    expect(topic.length).toBeGreaterThanOrEqual(2);
    // Все слова темы пройдены, кроме викторин: прогресс записан прямо в базу.
    await meOf(1);
    for (const l of topic) {
      for (const item of (l as any).words) {
        await ctx.env.DB.prepare(
          "INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES (?, ?, ?, 1, 1, 1, 1, datetime('now'))",
        ).bind(1, item.id, l.id).run();
      }
    }
    for (const l of topic.slice(0, -1)) await playQuiz(1, await startQuiz(1, l.id));
    expect(await badgeIds(1)).not.toContain(`topic-${topicId}`);
    const last = topic[topic.length - 1]!;
    const res = await playQuiz(1, await startQuiz(1, last.id));
    expect(res.result!.play.newBadges).toContain(`topic-${topicId}`);
    expect((await statsRow(1)).topics_closed).toBe(1);
  });
});

describe("пересчёт для существующих пользователей", () => {
  async function seedOldUser(uid: number) {
    await ctx.env.DB.prepare("INSERT INTO users (id, first_name) VALUES (?, 'Старый')").bind(uid).run();
    const words = lesson.words;
    for (const [i, w] of words.entries()) {
      // Слова проходились по одному в день, начиная с 1 октября.
      const day = String(1 + i).padStart(2, "0");
      await ctx.env.DB.prepare(
        "INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES (?, ?, ?, 1, 1, 1, 1, ?)",
      ).bind(uid, w.id, lesson.id, `2026-10-${day} 08:00:00`).run();
    }
    await ctx.env.DB.prepare("INSERT INTO quiz_attempts (user_id, lesson_id, correct, total, passed, created_at) VALUES (?, ?, 25, 25, 1, '2026-10-11 08:00:00')").bind(uid, lesson.id).run();
    await ctx.env.DB.prepare("INSERT INTO lesson_passed (user_id, lesson_id, first_passed_at) VALUES (?, ?, '2026-10-11 08:00:00')").bind(uid, lesson.id).run();
  }

  it("первый вход после выпуска: счётчики, дни и бейджи восстановлены из таблиц прогресса", async () => {
    await seedOldUser(7);
    const me = await meOf(7);
    expect(me.points).toBe(10);
    expect(me.passedLessons).toBe(1);
    const row = await statsRow(7);
    expect(row).toMatchObject({ words_done: 10, passed_lessons: 1, perfect_quizzes: 1, sections_mask: 2, active_days: 11, goal_days: 0 });
    expect(await badgeIds(7)).toEqual(
      expect.arrayContaining(["first-word", "words-10", "first-lesson", "quiz-perfect", "days-7", "rhythm-1"]),
    );
    // Найденные бейджи помечены как выданные задним числом и ещё не просмотрены.
    const rows = (await ctx.env.DB.prepare("SELECT badge_id, earned_at, retro, seen FROM user_badges WHERE user_id = 7").all<any>()).results;
    expect(rows.every((r) => r.retro === 1 && r.seen === 0)).toBe(true);
    expect(me.play.unseenBadges).toBe(rows.length);
    // Дата получения восстановлена: «Дебют» заработан десятым словом (10 октября), «Первая партия» сдачей урока (11 октября).
    const earned = (id: string) => rows.find((r) => r.badge_id === id)!.earned_at;
    expect(earned("words-10")).toBe(Date.UTC(2026, 9, 10, 8, 0, 0) / 1000);
    expect(earned("first-lesson")).toBe(Date.UTC(2026, 9, 11, 8, 0, 0) / 1000);
  });

  it("счётчики после пересчёта совпадают с теми, что накопились при живых событиях", async () => {
    // Дату прохождения слова пишет SQLite (`datetime('now')`, настоящие часы), а живые счётчики считаются по времени теста.
    // Чтобы день совпал в любой день запуска, время теста здесь равно настоящему.
    vi.setSystemTime(vi.getRealSystemTime());
    await completeLesson(1);
    await playQuiz(1, await startQuiz(1));
    for (const l of alphabetLesson.letters) await completeLetter(1, l.id);
    await playQuiz(1, await startQuiz(1, alphabetLesson.id));
    const live = await statsRow(1);
    const liveBadges = await badgeIds(1);

    await ctx.env.DB.prepare("DELETE FROM user_stats WHERE user_id = 1").run();
    expect((await meOf(1)).points).toBe(15);
    const recounted = await statsRow(1);
    for (const key of ["words_done", "letters_done", "passed_lessons", "alphabet_lessons", "perfect_quizzes", "topics_closed", "sections_mask", "active_days", "rhythm_weeks", "last_day", "week_words"]) {
      expect(recounted[key], key).toBe(live[key]);
    }
    expect(await badgeIds(1)).toEqual(liveBadges);
  });

  it("новый бейдж в каталоге выдаётся один раз при следующем входе", async () => {
    await completeLesson(1);
    const before = await badgeIds(1);
    // Имитация: человек был проверен по старой версии каталога и пропустил бейдж.
    await ctx.env.DB.prepare("DELETE FROM user_badges WHERE user_id = 1 AND badge_id = 'words-10'").run();
    await ctx.env.DB.prepare("UPDATE user_stats SET badges_ver = 1 WHERE user_id = 1").run();
    await meOf(1);
    expect(await badgeIds(1)).toEqual(before);
    expect((await statsRow(1)).badges_ver).toBe(catalog.version);
    const retro = await ctx.env.DB.prepare("SELECT retro FROM user_badges WHERE user_id = 1 AND badge_id = 'words-10'").first<{ retro: number }>();
    expect(retro!.retro).toBe(1);
  });
});

describe("ритм по дням (воскресенье — первый день недели, граница дня — местная полночь)", () => {
  it("три дня за неделю дают «Ритм найден», неделя закрывается итогами", async () => {
    at("2026-10-11T08:00:00Z"); // воскресенье
    await meOf(1);
    expect((await finishWord(1, 0)).play.newBadges).toEqual(["first-word"]);
    at("2026-10-12T08:00:00Z"); // понедельник
    expect((await finishWord(1, 1)).play.newBadges).toEqual([]);
    at("2026-10-13T08:00:00Z"); // вторник
    const third = await finishWord(1, 2);
    expect(third.play.newBadges).toEqual(["rhythm-1"]);

    let me = await meOf(1);
    expect(me.play.week).toMatchObject({ days: [true, true, true, false, false, false, false], daysThisWeek: 3, wordsThisWeek: 3, rhythmWeeks: 1, rhythmLast8: 1, todayIndex: 2 });
    expect(me.play.activeDays).toBe(3);

    at("2026-10-18T08:00:00Z"); // следующее воскресенье
    me = await meOf(1);
    expect(me.play.week.days.every((d: boolean) => !d)).toBe(true);
    expect(me.play.week.rhythmWeeks).toBe(1);
    expect(me.play.recap).toMatchObject({ words: 3, days: 3 });
  });

  it("граница дня это местная полночь, в том числе при переходе на зимнее время 25.10.2026", async () => {
    // Летнее время (UTC+3): 23:59 и 00:01 по Иерусалиму.
    at("2026-10-11T20:59:00Z");
    await finishWord(1, 0);
    at("2026-10-11T21:01:00Z");
    await finishWord(1, 1);
    expect((await statsRow(1)).active_days).toBe(2);
    // После перехода (UTC+2): 23:59 по Иерусалиму это 21:59 UTC, полночь в 22:00 UTC.
    at("2026-10-25T21:59:00Z");
    await finishWord(1, 2);
    at("2026-10-25T22:01:00Z");
    await finishWord(1, 3);
    expect((await statsRow(1)).active_days).toBe(4);
    // Два занятия внутри одних местных суток день не удваивают.
    await finishWord(1, 4);
    expect((await statsRow(1)).active_days).toBe(4);
  });

  it("возвращение после перерыва в 14 дней выдаёт «С возвращением»", async () => {
    at("2026-09-01T08:00:00Z");
    await finishWord(1, 0);
    at("2026-09-20T08:00:00Z");
    const back = await finishWord(1, 1);
    expect(back.play.newBadges).toEqual(["return-14"]);
    expect((await statsRow(1)).returns).toBe(1);
  });

  it("часовой пояс определяет местный день: один и тот же момент даёт разные дни в Нью-Йорке и Иерусалиме", async () => {
    at("2026-10-15T02:00:00Z"); // 22:00 14 октября в Нью-Йорке и 05:00 15 октября в Иерусалиме
    await meOf(1, { "X-Timezone": "America/New_York" });
    await meOf(2, { "X-Timezone": "Asia/Jerusalem" });
    await finishWord(1, 0);
    await finishWord(2, 0);
    expect((await statsRow(2)).last_day - (await statsRow(1)).last_day).toBe(1);
  });

  it("часовой пояс меняется не чаще раза в сутки; неверный пояс игнорируется", async () => {
    await meOf(1, { "X-Timezone": "America/New_York" });
    await meOf(1, { "X-Timezone": "Asia/Tokyo" }); // пояс при создании не считается сменой
    expect((await statsRow(1)).tz).toBe("Asia/Tokyo");
    await meOf(1, { "X-Timezone": "Europe/Paris" }); // сегодня уже менялся
    expect((await statsRow(1)).tz).toBe("Asia/Tokyo");
    await meOf(1, { "X-Timezone": "Mars/Base" });
    expect((await statsRow(1)).tz).toBe("Asia/Tokyo");
    at("2026-10-15T09:00:00Z");
    await meOf(1, { "X-Timezone": "Europe/Paris" });
    expect((await statsRow(1)).tz).toBe("Europe/Paris");
  });
});

describe("цель дня", () => {
  it("по умолчанию 5; выполнение засчитывается один раз в день, на следующий день счёт заново", async () => {
    expect((await put("/api/settings", 1, { dailyGoal: 3 })).status).toBe(200);
    const flags: boolean[] = [];
    for (let i = 0; i < 4; i++) flags.push((await finishWord(1, i)).play.goalMet);
    expect(flags).toEqual([false, false, true, false]);
    let me = await meOf(1);
    expect(me.play.goal).toEqual({ target: 3, done: 4, met: true });
    expect((await statsRow(1)).goal_days).toBe(1);
    at("2026-10-15T09:00:00Z");
    me = await meOf(1);
    expect(me.play.goal).toEqual({ target: 3, done: 0, met: false });
  });

  it("выключенная цель (0): в профиле null, дни цели не копятся", async () => {
    await put("/api/settings", 1, { dailyGoal: 0 });
    for (let i = 0; i < 3; i++) await finishWord(1, i);
    expect((await meOf(1)).play.goal).toBeNull();
    expect((await statsRow(1)).goal_days).toBe(0);
  });

  it("седьмой выполненный день дают «Цель достигнута»", async () => {
    await put("/api/settings", 1, { dailyGoal: 3 });
    await ctx.env.DB.prepare("UPDATE user_stats SET goal_days = 6 WHERE user_id = 1").run();
    expect((await finishWord(1, 0)).play.newBadges).not.toContain("goal-7");
    await finishWord(1, 1);
    expect((await finishWord(1, 2)).play.newBadges).toEqual(["goal-7"]);
  });
});

describe("настройки", () => {
  it("цель дня, учёт в сравнении и часовой пояс сохраняются и возвращаются в профиле", async () => {
    const res = await put("/api/settings", 1, { dailyGoal: 10, cohortExcluded: true, tz: "Asia/Tokyo" });
    expect(res.status).toBe(200);
    const { play } = (await res.json()) as any;
    expect(play.settings).toEqual({ dailyGoal: 10, leaderboard: false, cohortExcluded: true, gender: "m" });
    expect(play.tz).toBe("Asia/Tokyo");
    expect((await meOf(1)).play.settings.dailyGoal).toBe(10);
  });

  it("род для фраз-примеров: по умолчанию мужской, сохраняется и возвращается в профиле", async () => {
    expect((await meOf(1)).play.settings.gender).toBe("m");
    const res = await put("/api/settings", 1, { gender: "f" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).play.settings.gender).toBe("f");
    expect((await meOf(1)).play.settings.gender).toBe("f");
    expect((await statsRow(1)).gender).toBe("f");
    await put("/api/settings", 1, { gender: "m" });
    expect((await meOf(1)).play.settings.gender).toBe("m");
  });

  it("плохие значения отклоняются, ничего не меняя", async () => {
    await meOf(1);
    const before = await statsRow(1);
    for (const [body, error] of [
      [{ dailyGoal: 4 }, "bad_goal"],
      [{ dailyGoal: "5" }, "bad_goal"],
      [{ tz: "Mars/Base" }, "bad_tz"],
      [{ tz: 5 }, "bad_tz"],
      [{ leaderboard: "yes" }, "bad_request"],
      [{ cohortExcluded: 1 }, "bad_request"],
      [{ gender: "x" }, "bad_request"],
      [{ gender: null }, "bad_request"],
      [{ unknown: true }, "bad_request"],
      [[], "bad_request"],
    ] as const) {
      const res = await put("/api/settings", 1, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(((await res.json()) as any).error).toBe(error);
    }
    expect(await statsRow(1)).toEqual(before);
  });

  it("вступить в таблицу, пока она выключена, нельзя, выйти можно; без входа 401", async () => {
    const res = await put("/api/settings", 1, { leaderboard: true });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error).toBe("feature_disabled");
    expect((await put("/api/settings", 1, { leaderboard: false })).status).toBe(200);
    expect((await api("/api/settings", { method: "PUT", body: "{}" })).status).toBe(401);
  });

  it("слишком частые изменения настроек получают 429", async () => {
    let last = 200;
    for (let i = 0; i < 21; i++) last = (await put("/api/settings", 1, { dailyGoal: i % 2 ? 3 : 5 })).status;
    expect(last).toBe(429);
  });
});

describe("достижения", () => {
  it("список бейджей, счётчики и отметка «просмотрено» только по своим бейджам", async () => {
    await completeLesson(1);
    let me = await meOf(1);
    expect(me.play.unseenBadges).toBe(2); // first-word, words-10

    const res = await api("/api/achievements", { as: 1 });
    const body = (await res.json()) as any;
    expect(body.earned.map((e: any) => e.id).sort()).toEqual(["first-word", "words-10"]);
    expect(body.earned.every((e: any) => e.seen === false && e.retro === false)).toBe(true);
    expect(body.counters).toMatchObject({ words: 10, letters: 0, lessons: 0, activeDays: 1 });
    expect(body.catalogVersion).toBe(catalog.version);

    // Чужие и выдуманные id ничего не отмечают.
    await meOf(2);
    const foreign = await post("/api/achievements/seen", 2, { ids: ["first-word", "words-10", "nope"] });
    expect(((await foreign.json()) as any).marked).toBe(0);
    expect((await meOf(1)).play.unseenBadges).toBe(2);

    const own = await post("/api/achievements/seen", 1, { ids: ["first-word"] });
    expect(((await own.json()) as any).marked).toBe(1);
    expect((await meOf(1)).play.unseenBadges).toBe(1);
    const again = await post("/api/achievements/seen", 1, { ids: ["first-word"] });
    expect(((await again.json()) as any).marked).toBe(0);
  });

  it("плохие тела «просмотрено» отклоняются", async () => {
    for (const body of [{}, { ids: "first-word" }, { ids: [1] }, { ids: Array.from({ length: 101 }, (_, i) => `b${i}`) }]) {
      expect((await post("/api/achievements/seen", 1, body)).status).toBe(400);
    }
    expect((await post("/api/achievements/seen", 1, { ids: [] })).status).toBe(200);
  });

  it("потерянная выдача лечится при открытии экрана достижений", async () => {
    await completeLesson(1);
    await ctx.env.DB.prepare("DELETE FROM user_badges WHERE user_id = 1 AND badge_id = 'words-10'").run();
    const body = (await (await api("/api/achievements", { as: 1 })).json()) as any;
    expect(body.earned.map((e: any) => e.id)).toContain("words-10");
  });

  it("бейджи, которых нет в каталоге, не показываются", async () => {
    await meOf(1);
    await ctx.env.DB.prepare("INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES (1, 'old-removed', 1)").run();
    const body = (await (await api("/api/achievements", { as: 1 })).json()) as any;
    expect(body.earned.map((e: any) => e.id)).not.toContain("old-removed");
  });
});

describe("таблица лидеров", () => {
  const lb = () => ({ ...ctx.env, LEADERBOARD_ENABLED: "1" });
  const board = async (as: number, name = "week") => (await (await api(`/api/leaderboard?board=${name}`, { as }, lb())).json()) as any;
  const join = (as: number, on = true) => put("/api/settings", as, { leaderboard: on }, lb());
  const name = (as: number, firstName: string) => api("/api/me", { headers: auth(as, firstName) });

  async function seedParticipants(n: number, firstId = 100) {
    for (let i = 0; i < n; i++) {
      const id = firstId + i;
      await ctx.env.DB.prepare("INSERT INTO users (id, first_name) VALUES (?, ?)").bind(id, `Игрок ${i + 1}`).run();
      await ctx.env.DB.prepare(
        `INSERT INTO user_stats (user_id, words_done, lb_optin, lb_week_idx, lb_week_points, lb_updated_at, created_at)
         VALUES (?, ?, 1, ?, ?, ?, 1)`,
      ).bind(id, 2000 - 2 * i, 0, 0, 100 + i).run();
    }
  }

  it("пока не выпущена: 404, и в профиле это видно", async () => {
    const res = await api("/api/leaderboard?board=week", { as: 1 });
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).error).toBe("feature_disabled");
    expect((await meOf(1)).play.features.leaderboard).toBe(false);
    expect(((await (await api("/api/me", { as: 1 }, lb())).json()) as any).play.features.leaderboard).toBe(true);
  });

  it("плохая таблица это 400", async () => {
    expect((await api("/api/leaderboard?board=year", { as: 1 }, lb())).status).toBe(400);
    expect((await api("/api/leaderboard", { as: 1 }, lb())).status).toBe(200);
  });

  it("места по очкам, ничья делит место, скрытые, забаненные и не вступившие не видны, id и username наружу не уходят", async () => {
    await name(11, "Анна");
    await name(12, "Борис https://evil.example");
    await name(13, "Вера");
    await name(14, "Гена");
    await name(15, "Хулиган");
    for (const [uid, words] of [[11, 2], [12, 3], [13, 3], [14, 1], [15, 4]] as const) {
      for (let i = 0; i < words; i++) await finishWord(uid, i);
    }
    for (const uid of [11, 12, 13, 15]) expect((await join(uid)).status).toBe(200);
    await ctx.env.DB.prepare("UPDATE user_stats SET lb_banned = 1 WHERE user_id = 15").run();

    const mine = await board(11);
    expect(mine.participating).toBe(true);
    expect(mine.weekEndsOn).toBe("2026-10-17"); // суббота той недели
    expect(mine.top.map((r: any) => [r.rank, r.name, r.points])).toEqual([
      [1, "Борис", 3],
      [1, "Вера", 3],
      [3, "Анна", 2],
    ]);
    expect(mine.top[2].me).toBe(true);
    expect(mine.me).toMatchObject({ rank: 3, points: 2, around: [] });
    const text = JSON.stringify(mine);
    expect(text).not.toMatch(/username|first_name|"id"|evil|spam|Хулиган|Гена/);

    // Не участвующий видит таблицу, но не своё место.
    const outsider = await board(14);
    expect(outsider.participating).toBe(false);
    expect(outsider.me).toBeNull();
    expect(outsider.top.length).toBe(3);
  });

  it("выход из таблицы действует сразу, не дожидаясь нового снимка", async () => {
    await name(11, "Анна");
    await name(12, "Борис");
    await finishWord(11, 0);
    await finishWord(12, 0);
    await finishWord(12, 1);
    await join(11);
    await join(12);
    expect((await board(11)).top.map((r: any) => r.name)).toEqual(["Борис", "Анна"]);
    await join(12, false);
    const after = await board(11);
    expect(after.top.map((r: any) => r.name)).toEqual(["Анна"]);
    expect((await board(12)).me).toBeNull();
  });

  it("«всё время» считает общие очки; неделя таблицы сбрасывается с новой неделей", async () => {
    await name(11, "Анна");
    await finishWord(11, 0);
    await finishWord(11, 1);
    await join(11);
    expect((await board(11, "week")).me.points).toBe(2);
    expect((await board(11, "all")).me.points).toBe(2);

    at("2026-10-18T09:00:00Z"); // следующее воскресенье
    const week = await board(11, "week");
    expect(week.top).toEqual([]);
    expect(week.me).toMatchObject({ rank: null, points: 0 });
    const all = await board(11, "all");
    expect(all.top.map((r: any) => r.points)).toEqual([2]);
    await finishWord(11, 2);
    expect((await board(11, "week")).me.points).toBe(1);
  });

  it("снимок обновляется не чаще чем раз в 10 минут", async () => {
    await name(11, "Анна");
    await finishWord(11, 0);
    await join(11);
    expect((await board(11)).top[0].points).toBe(1);
    await finishWord(11, 1);
    expect((await board(11)).top[0].points).toBe(1);
    expect((await board(11)).me.points).toBe(2); // свои очки живые
    at("2026-10-14T09:11:00Z");
    expect((await board(11)).top[0].points).toBe(2);
  });

  it("свою строку вне первой двадцатки видно с соседями (по два выше и ниже)", async () => {
    await seedParticipants(30);
    // Свои очки 1951 лежат между 1952 (25-й из посеянных) и 1950 (26-й): место 26.
    await name(11, "Анна");
    await join(11);
    await ctx.env.DB.prepare("UPDATE user_stats SET words_done = 1951, lb_week_idx = 0 WHERE user_id = 11").run();
    const res = await board(11, "all");
    expect(res.total).toBe(31);
    expect(res.top.length).toBe(20);
    expect(res.me.rank).toBe(26);
    expect(res.me.around.map((r: any) => r.rank)).toEqual([24, 25, 26, 27, 28]);
    expect(res.me.around.find((r: any) => r.me)).toMatchObject({ name: "Анна", points: 1951 });
  });

  it("имя очищается: ссылки, @, длина; пустое имя заменяется", async () => {
    await name(11, "@" + "Я".repeat(40));
    await name(12, "https://evil.example");
    await finishWord(11, 0);
    await finishWord(12, 0);
    await join(11);
    await join(12);
    const names = (await board(11)).top.map((r: any) => r.name).sort();
    expect(names).toEqual(["Игрок", "Я".repeat(20)].sort());
  });
});

describe("сравнение с теми, кто пришёл в одно время", () => {
  async function seedCohort(week: number, values: number[], firstId: number) {
    for (const [i, points] of values.entries()) {
      const id = firstId + i;
      await ctx.env.DB.prepare("INSERT INTO users (id, first_name) VALUES (?, 'x')").bind(id).run();
      await ctx.env.DB.prepare("INSERT INTO user_stats (user_id, words_done, cohort_week, created_at) VALUES (?, ?, ?, 1)").bind(id, points, week).run();
    }
  }
  const cohort = async (as: number) => (await (await api("/api/cohort", { as })).json()) as any;
  const viewerWeek = async (week: number, words = 0) => {
    await meOf(1);
    await ctx.env.DB.prepare("UPDATE user_stats SET cohort_week = ?, words_done = ? WHERE user_id = 1").bind(week, words).run();
  };

  it("группа той же недели от 20 человек: размер и квартили без имён", async () => {
    await viewerWeek(2900, 7);
    await seedCohort(2900, Array.from({ length: 24 }, (_, i) => i + 1), 500);
    const res = await cohort(1);
    expect(res).toMatchObject({ level: "week", size: 25, mine: 7, excluded: false });
    expect(res.p25).toBeLessThanOrEqual(res.p50);
    expect(res.p50).toBeLessThanOrEqual(res.p75);
    expect(JSON.stringify(res)).not.toMatch(/name|id/);
  });

  it("мало людей в неделе, но достаточно в окне ±2 недели: уровень «окно»", async () => {
    await viewerWeek(2900, 5);
    await seedCohort(2900, [5, 6, 7, 8, 9, 10, 11, 12, 13], 500);
    await seedCohort(2899, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 600);
    const res = await cohort(1);
    expect(res).toMatchObject({ level: "window", size: 22 });
  });

  it("меньше 20 человек даже в окне: данных мало", async () => {
    await viewerWeek(2900, 5);
    await seedCohort(2900, [1, 2, 3], 500);
    expect(await cohort(1)).toMatchObject({ level: "none", size: 0, mine: 5, excluded: false });
  });

  it("не начавшие (0 очков) и отказавшиеся в группу не входят", async () => {
    await viewerWeek(2900, 5);
    await seedCohort(2900, Array.from({ length: 19 }, () => 4), 500);
    await seedCohort(2900, [0, 0, 0, 0, 0], 700);
    await ctx.env.DB.prepare("UPDATE user_stats SET cohort_excluded = 1 WHERE user_id = 500").run();
    expect((await cohort(1)).level).toBe("none"); // 18 + сам зритель = 19
  });

  it("кто отключил учёт, не видит сравнение и сам в него не входит", async () => {
    await viewerWeek(2900, 5);
    await seedCohort(2900, Array.from({ length: 24 }, (_, i) => i + 1), 500);
    await put("/api/settings", 1, { cohortExcluded: true });
    expect(await cohort(1)).toMatchObject({ level: "none", excluded: true, mine: 5 });
  });

  it("снимок пересчитывается не чаще раза в сутки", async () => {
    await viewerWeek(2900, 5);
    await seedCohort(2900, Array.from({ length: 24 }, (_, i) => i + 1), 500);
    expect((await cohort(1)).size).toBe(25);
    await seedCohort(2900, [50, 51], 800);
    expect((await cohort(1)).size).toBe(25);
    at("2026-10-15T10:00:00Z");
    expect((await cohort(1)).size).toBe(27);
  });
});
