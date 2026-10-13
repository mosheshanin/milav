// Общая обвязка тестов API: подписанный вход, вызовы приложения, подмена Workers AI, прохождение слов урока.
import { expect } from "vitest";
import { alphabetLessons, lessons } from "@milav/content";
import { CANVAS_LINE_HEIGHT, loadBaseTemplates, roundStrokes, wordLetters, type Letter, type Stroke, type Word } from "@milav/shared";
import { app } from "../app";
import type { Bindings } from "../env";
import { createTestDb } from "./d1";
import { signInitData } from "./telegram";

export const TOKEN = "123456:TEST-bot-token";
export const lesson = lessons[0]!;
export const word = lesson.words[0]!;
/** Первый урок алфавита и его первая буква. */
export const alphabetLesson = alphabetLessons[0]!;
export const letter = alphabetLesson.letters[0]!;

/** Окружение теста и то, что «услышит» подменный распознаватель речи. Пересоздаётся перед каждым тестом (resetHarness). */
export const ctx: { env: Bindings; heard: string } = { env: undefined as unknown as Bindings, heard: "" };

export function resetHarness(): void {
  ctx.heard = word.he;
  ctx.env = { DB: createTestDb(), BOT_TOKEN: TOKEN, AI: { run: async () => ({ text: ctx.heard }) } };
}

export function auth(id: number, name = "Тест"): Record<string, string> {
  return { Authorization: `tma ${signInitData(TOKEN, { id, first_name: name })}` };
}

export async function api(path: string, init: RequestInit & { as?: number } = {}, e: Bindings = ctx.env) {
  const { as, ...rest } = init;
  const headers = { ...(as ? auth(as) : {}), ...(rest.headers as Record<string, string> | undefined) };
  return app.request(path, { ...rest, headers }, e);
}

export const post = (path: string, as: number, body: unknown) =>
  api(path, { method: "POST", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

/**
 * Штрихи буквы по шаблону из шрифта: каждая вторая точка облака как короткий штрих (24 штриха на букву, ровно предел сервера). Более редкая выборка не узнаётся для נ и ס.
 * Распознаватель принимает такой рисунок, потому что он повторяет шаблон.
 */
export async function letterStrokes(letter: string): Promise<Stroke[]> {
  const t = (await loadBaseTemplates()).find((x) => x.letter === letter);
  if (!t) throw new Error(`нет шаблона ${letter}`);
  const h = t.heightRatio * CANVAS_LINE_HEIGHT;
  const scale = t.aspect <= 1 ? h : h * t.aspect;
  const cx = 200;
  const cy = 0.62 * 220 - h / 2;
  return roundStrokes(
    t.points
      .filter((_, i) => i % 2 === 0)
      .map((p) => [
        { x: cx + p.x * scale, y: cy + p.y * scale },
        { x: cx + p.x * scale + 1.5, y: cy + p.y * scale },
      ]),
  );
}

/** Штрихи всех букв слова (в порядке написания). */
export const wordStrokes = (w: Word) => Promise.all(wordLetters(w.he).map(letterStrokes));

/** Тело запроса с доказательством этапа: набранное слово или штрихи всех букв. */
export async function stageBody(w: Word, stage: "listen" | "write" | "type") {
  if (stage === "type") return { wordId: w.id, stage, typed: wordLetters(w.he).join("") };
  if (stage === "write") return { wordId: w.id, stage, strokes: await wordStrokes(w) };
  return { wordId: w.id, stage };
}

export const speak = (as: number, wordId: string, bytes = 2000) =>
  api(`/api/speech/check?wordId=${wordId}`, {
    method: "POST",
    as,
    body: new Uint8Array(bytes),
    headers: { "Content-Type": "audio/webm" },
  });

/** Проходит все четыре этапа слова как пользователь `as`. */
export async function completeWord(as: number, wordId: string) {
  const target = lesson.words.find((w) => w.id === wordId)!;
  for (const stage of ["listen", "write", "type"] as const) {
    expect((await post("/api/progress/stage", as, await stageBody(target, stage))).status).toBe(200);
  }
  ctx.heard = target.he;
  expect((await speak(as, wordId)).status).toBe(200);
}

/** Проходит весь урок как пользователь `as`. */
export async function completeLesson(as: number) {
  for (const w of lesson.words) await completeWord(as, w.id);
}

/** Тело запроса с доказательством этапа буквы: нажатая буква или штрихи одной буквы. */
export async function letterStageBody(l: Letter, stage: "listen" | "write" | "type") {
  if (stage === "type") return { wordId: l.id, stage, typed: l.he };
  if (stage === "write") return { wordId: l.id, stage, strokes: [await letterStrokes(l.he)] };
  return { wordId: l.id, stage };
}

/** Проходит три этапа буквы (без «говори») как пользователь `as`. */
export async function completeLetter(as: number, letterId: string) {
  const target = alphabetLesson.letters.find((l) => l.id === letterId)!;
  for (const stage of ["listen", "write", "type"] as const) {
    expect((await post("/api/progress/stage", as, await letterStageBody(target, stage))).status).toBe(200);
  }
}

/** Проходит все буквы первого урока алфавита как пользователь `as`. */
export async function completeAlphabetLesson(as: number) {
  for (const l of alphabetLesson.letters) await completeLetter(as, l.id);
}
