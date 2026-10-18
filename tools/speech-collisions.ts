// Отчёт «не стала ли проверка речи слишком мягкой». Запуск: npm run speech:collisions [-- --all]
// Для каждой пары разных слов уроков проверяет, принял бы распознаватель одно слово за другое (произнесли X, ожидалось Y),
// по прежнему правилу (скелет из букв, допуск в одну ошибку от 4 букв) и по новому (сравнение по звучанию, `soundDistance`).
// По умолчанию пары берутся внутри одной темы: именно такие слова ученик видит рядом и легче всего перепутает.
// --all: все пары слов всех тем (дольше, список обычно шире).
//   --latin: что будет, если Whisper запишет слово латиницей (как «akhbar» вместо עכבר): транскрипция слова из урока переводится
//     в латиницу, и считается, у скольких слов проверка сработает, а у скольких откажет из-за соседа или промахнётся.
// Код возврата всегда 0: это отчёт для решения владельца, а не проверка.
import { parseArgs } from "node:util";
import { consonantSkeleton, isSpeechMatch, levenshtein, normalizeHebrew, speechMatchDetail } from "@milav/shared";
import { lessons } from "../content";

const { values } = parseArgs({ options: { all: { type: "boolean", default: false }, latin: { type: "boolean", default: false } } });

/** Прежнее правило, как было до сравнения по звучанию (оставлено здесь только для сравнения). */
function legacyToken(heard: string, expected: string): boolean {
  const h = normalizeHebrew(heard);
  const e = normalizeHebrew(expected);
  if (!h || !e) return false;
  if (h === e) return true;
  const hs = consonantSkeleton(h);
  const es = consonantSkeleton(e);
  if (hs && hs === es) return true;
  return es.length >= 4 && levenshtein(hs, es) <= 1;
}
function legacyMatch(heard: string, expected: string): boolean {
  if (legacyToken(heard, expected)) return true;
  return heard
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => legacyToken(token, expected));
}

interface Item {
  id: string;
  translit: string;
  he: string;
  ru: string;
  topic: string;
}
const seen = new Set<string>();
const items: Item[] = [];
for (const lesson of lessons) {
  for (const word of lesson.words) {
    if (seen.has(word.id)) continue;
    seen.add(word.id);
    items.push({ id: word.id, he: word.he, ru: word.ru, topic: lesson.topicId, translit: word.translit });
  }
}

const accepted = (a: Item, b: Item, rule: (heard: string, expected: string) => boolean): boolean =>
  rule(a.he, b.he) || rule(b.he, a.he);

// Слова темы, как их видит сервер при проверке (apps/api/src/speech.ts, rivalsOf).
const byTopic = new Map<string, string[]>();
for (const item of items) byTopic.set(item.topic, [...(byTopic.get(item.topic) ?? []), item.he]);
const withRivals = (heard: string, expected: string): boolean => {
  const topic = items.find((i) => i.he === expected)?.topic ?? "";
  return isSpeechMatch(heard, expected, (byTopic.get(topic) ?? []).filter((he) => he !== expected));
};

if (values.latin) {
  const CYR: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ы: "i", э: "e", ю: "yu", я: "ya",
  };
  // Кириллическая «х» передаёт и ה, и ח, и כ: Whisper напишет «h» или «kh», поэтому пробуем оба варианта и считаем успехом любой.
  const toLatin = (cyr: string, khaAs: string): string =>
    [...cyr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC").toLowerCase()]
      .map((ch) => (ch === "х" ? khaAs : (CYR[ch] ?? (/[a-z\s]/.test(ch) ? ch : ""))))
      .join("");
  let ok = 0;
  const blocked: string[] = [];
  const missed: string[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const rivals = (byTopic.get(item.topic) ?? []).filter((he) => he !== item.he);
    const variants = ["kh", "h"].map((kha) => toLatin(item.translit, kha));
    const results = variants.map((v) => speechMatchDetail(v, item.he, rivals));
    const best = results.findIndex((r) => r.match);
    const d = results[best >= 0 ? best : 0]!;
    const latin = variants[best >= 0 ? best : 0]!;
    if (d.match) ok++;
    else if (d.rival) blocked.push(`  ${item.he} (${item.ru}): «${latin}» ближе к ${d.rival}`);
    else if (d.cost === null) skipped.push(`  ${item.he} (${item.ru})`);
    else missed.push(`  ${item.he} (${item.ru}): «${latin}», расстояние ${d.cost}, допуск ${d.budget}`);
  }
  console.log(`Латиницей (из транскрипции): слов ${items.length}, пройдут ${ok}, отказ из-за соседа ${blocked.length}, не проверяются (одна опорная согласная) ${skipped.length}, мимо ${missed.length}.`);
  console.log("Отказ из-за соседа:");
  for (const line of blocked.slice(0, 40)) console.log(line);
  console.log("Не проверяются латиницей (одна опорная согласная, нужен ответ ивритом):");
  for (const line of skipped.slice(0, 40)) console.log(line);
  console.log("Мимо (расстояние больше допуска):");
  for (const line of missed.slice(0, 40)) console.log(line);
  process.exit(0);
}

let pairs = 0;
const gained: [Item, Item][] = [];
const lost: [Item, Item][] = [];
let bothAccept = 0;
let stillAccepted = 0;
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const a = items[i]!;
    const b = items[j]!;
    if (!values.all && a.topic !== b.topic) continue;
    if (normalizeHebrew(a.he) === normalizeHebrew(b.he)) continue; // одно написание: это не путаница
    pairs++;
    const before = accepted(a, b, legacyMatch);
    const after = accepted(a, b, isSpeechMatch);
    if (before && after) bothAccept++;
    if (accepted(a, b, withRivals)) stillAccepted++;
    if (!before && after) gained.push([a, b]);
    if (before && !after) lost.push([a, b]);
  }
}

const show = ([a, b]: [Item, Item]): string => `  ${a.he} (${a.ru}) ~ ${b.he} (${b.ru})   [${a.topic}${a.topic === b.topic ? "" : ` / ${b.topic}`}]`;

console.log(`Слов: ${items.length}. Пар проверено: ${pairs} (${values.all ? "все темы" : "внутри одной темы"}).`);
console.log(`Принимались друг за друга и раньше, и теперь (без проверки соседних слов): ${bothAccept}`);
console.log(`Принимаются друг за друга с проверкой соседних слов темы (так работает сервер): ${stillAccepted}`);
console.log(`Стали приниматься друг за друга теперь: ${gained.length}`);
for (const pair of gained.slice(0, 80)) console.log(show(pair));
if (gained.length > 80) console.log(`  … и ещё ${gained.length - 80}`);
console.log(`Перестали приниматься (раньше принимались): ${lost.length}`);
for (const pair of lost.slice(0, 40)) console.log(show(pair));
