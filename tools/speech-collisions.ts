// Отчёт «не стала ли проверка речи слишком мягкой». Запуск: npm run speech:collisions [-- --all]
// Для каждой пары разных слов уроков проверяет, принял бы распознаватель одно слово за другое (произнесли X, ожидалось Y),
// по прежнему правилу (скелет из букв, допуск в одну ошибку от 4 букв) и по новому (сравнение по звучанию, `soundDistance`).
// По умолчанию пары берутся внутри одной темы: именно такие слова ученик видит рядом и легче всего перепутает.
// --all: все пары слов всех тем (дольше, список обычно шире).
// Код возврата всегда 0: это отчёт для решения владельца, а не проверка.
import { parseArgs } from "node:util";
import { consonantSkeleton, isSpeechMatch, levenshtein, normalizeHebrew } from "@milav/shared";
import { lessons } from "../content";

const { values } = parseArgs({ options: { all: { type: "boolean", default: false } } });

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
    items.push({ id: word.id, he: word.he, ru: word.ru, topic: lesson.topicId });
  }
}

const accepted = (a: Item, b: Item, rule: (heard: string, expected: string) => boolean): boolean =>
  rule(a.he, b.he) || rule(b.he, a.he);

let pairs = 0;
const gained: [Item, Item][] = [];
const lost: [Item, Item][] = [];
let bothAccept = 0;
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
    if (!before && after) gained.push([a, b]);
    if (before && !after) lost.push([a, b]);
  }
}

const show = ([a, b]: [Item, Item]): string => `  ${a.he} (${a.ru}) ~ ${b.he} (${b.ru})   [${a.topic}${a.topic === b.topic ? "" : ` / ${b.topic}`}]`;

console.log(`Слов: ${items.length}. Пар проверено: ${pairs} (${values.all ? "все темы" : "внутри одной темы"}).`);
console.log(`Принимались друг за друга и раньше, и теперь: ${bothAccept}`);
console.log(`Стали приниматься друг за друга теперь: ${gained.length}`);
for (const pair of gained.slice(0, 80)) console.log(show(pair));
if (gained.length > 80) console.log(`  … и ещё ${gained.length - 80}`);
console.log(`Перестали приниматься (раньше принимались): ${lost.length}`);
for (const pair of lost.slice(0, 40)) console.log(show(pair));
