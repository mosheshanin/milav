import { readBodyLimited } from "./body";
import { lessons } from "@milav/content";
import { normalizeWords, type SpeechMatchDetail } from "@milav/shared";
import { describeError, logError, logWarn, type LogFields } from "./telemetry";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
/**
 * Предел записи голоса (вопрос 91, 22.11.2026). Запись идёт не дольше 4 с (фраза, SPEAK_PHRASE_MAX_MS) с битрейтом 32 кбит/с
 * (`AUDIO_BITS_PER_SECOND` в приложении), это около 16 КБ; 150 КБ хватает с большим запасом и для телефонов, которые битрейт
 * не соблюдают. Whisper берёт плату за минуты звука, поэтому длинная запись могла бы за минуты сжечь суточную квоту на всех.
 */
export const MAX_AUDIO_BYTES = 150_000;

interface SpeechModel {
  run(model: string, input: unknown): Promise<unknown>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Читает запись голоса из тела запроса: не больше MAX_AUDIO_BYTES и не пустую. */
export async function readAudio(
  request: Request,
): Promise<{ ok: true; audio: Uint8Array } | { ok: false; status: 400 | 413; error: "audio_too_large" | "empty_audio" }> {
  const audio = await readBodyLimited(request, MAX_AUDIO_BYTES);
  if (!audio) return { ok: false, status: 413, error: "audio_too_large" };
  if (audio.byteLength === 0) return { ok: false, status: 400, error: "empty_audio" };
  return { ok: true, audio };
}

const topicWords = new Map<string, { id: string; he: string }[]>();

/**
 * Другие слова той же темы (всех её уроков): с ними сравниваем услышанное, чтобы близкое слово не засчитывалось
 * (סבתא вместо סבא, вопрос 71). Список темы строится один раз на изолят.
 */
export function rivalsOf(topicId: string, wordId: string): string[] {
  let words = topicWords.get(topicId);
  if (!words) {
    words = lessons.filter((l) => l.topicId === topicId).flatMap((l) => l.words.map((w) => ({ id: w.id, he: w.he })));
    topicWords.set(topicId, words);
  }
  return words.filter((w) => w.id !== wordId).map((w) => w.he);
}

/**
 * Поля записи `speech` для журнала, кроме `heard`: ожидаемое слово, расстояние до него (`cost`), допуск (`budget`) и ближайший
 * вариант услышанного (`closest`), а при отказе из-за соседнего слова это слово (`rival`). По ним видно, не слишком ли строги или мягки допуски (docs/DEPLOY.md, «Речь»).
 * Пустые значения не пишем: запись короче, а в Workers Logs записи хранятся недолго.
 */
export function speechLogFields(he: string, detail: SpeechMatchDetail): LogFields {
  return {
    he,
    cost: detail.cost,
    budget: detail.budget,
    closest: detail.closest || undefined,
    rival: detail.rival,
    latin: detail.latin,
    digits: detail.digits,
  };
}

// ---- Тишина и «галлюцинации» Whisper (22.11.2026) ----
// На тишине, шуме или дыхании Whisper не возвращает пустоту, а «слышит» частую фразу из субтитров, на иврите почти всегда
// «תודה רבה» («спасибо большое»). Раньше ученик видел «Услышано: תודה רבה», хотя ничего такого не говорил, а попытка
// в викторине тратилась. Теперь: (1) Whisper сам вырезает тишину (`vad_filter`), (2) пустой результат и сегменты, которые сам
// Whisper считает «не речью», означают «голоса не слышно», (3) известные фразы-галлюцинации, не совпавшие со словом, тоже.
// Ответ «голоса не слышно» (`noSpeech`) не тратит попытку и не показывает выдуманный текст.

/** Фразы, которые Whisper выдаёт на тишине (без огласовок, слова через пробел, как `normalizeWords`). */
const SILENCE_PHRASES = new Set(
  ["תודה רבה", "תודה", "תודה רבה לכם", "תודה לכם", "תודה שצפיתם", "תודה רבה שצפיתם", "תודה על הצפייה", "צפייה מהנה"].map(
    normalizeWords,
  ),
);
/** Титры субтитров («תורגם על ידי…», «כתוביות…»): если такое слово есть в ответе, это не речь ученика. */
const SUBTITLE_MARKERS = ["כתוביות", "תורגם", "תרגום", "תמלול"].map(normalizeWords);
/** Английские галлюцинации того же рода. */
const LATIN_SILENCE = new Set(["thank you", "thanks for watching", "thank you for watching", "you"]);
/** Сегмент, который сам Whisper с такой уверенностью считает «не речью», в расчёт не берём. */
export const NO_SPEECH_PROB = 0.8;

/** Что распознал Whisper. `noSpeech`: по самому ответу видно, что голоса не было (пусто, тишина вырезана, «не речь»). */
export interface Transcript {
  text: string;
  noSpeech: boolean;
  /** Наибольшая вероятность «не речи» среди сегментов, для журнала (подбор порога). */
  noSpeechProb?: number;
}

interface WhisperSegment {
  text?: string;
  no_speech_prob?: number;
}

interface WhisperOutput {
  text?: string;
  segments?: WhisperSegment[];
  transcription_info?: { duration_after_vad?: number };
}

/** Разбирает ответ Whisper. Числа и латиница тоже речь, поэтому «пусто» значит «нет ни одной буквы и цифры». */
export function readTranscript(raw: unknown): Transcript {
  const out = (raw ?? {}) as WhisperOutput;
  const text = (typeof out.text === "string" ? out.text : "").trim();
  const probs = (Array.isArray(out.segments) ? out.segments : [])
    .map((s) => s?.no_speech_prob)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  const noSpeechProb = probs.length ? Math.max(...probs) : undefined;
  const empty = !/[\p{L}\p{N}]/u.test(text);
  const vadSilent = out.transcription_info?.duration_after_vad === 0;
  const allSilent = probs.length > 0 && probs.every((p) => p >= NO_SPEECH_PROB);
  return { text, noSpeech: empty || vadSilent || allSilent, ...(noSpeechProb !== undefined ? { noSpeechProb } : {}) };
}

/** Ответ Whisper это известная фраза, которую он выдумывает на тишине («תודה רבה», титры субтитров, «thank you»). */
export function isSilencePhrase(text: string): boolean {
  const words = normalizeWords(text);
  if (words && SILENCE_PHRASES.has(words)) return true;
  if (words && SUBTITLE_MARKERS.some((m) => words.split(" ").includes(m))) return true;
  const latin = text.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  return LATIN_SILENCE.has(latin);
}

/**
 * Голоса не слышно: по ответу Whisper или потому что он выдал фразу-галлюцинацию, не совпавшую со словом.
 * Совпавшую не трогаем: «תודה רבה» это ещё и слово урока, и сказанное верно должно засчитываться.
 */
export function isNoSpeech(transcript: Transcript, match: boolean): boolean {
  return transcript.noSpeech || (!match && isSilencePhrase(transcript.text));
}

/** Поля журнала про тишину: `nsp` (наибольшая вероятность «не речи») нужен, чтобы проверить порог NO_SPEECH_PROB. */
export function silenceLogFields(transcript: Transcript): LogFields {
  return transcript.noSpeechProb !== undefined ? { nsp: Math.round(transcript.noSpeechProb * 100) / 100 } : {};
}

/**
 * Распознаёт речь на иврите (Whisper в Workers AI). null, если распознаватель не отработал.
 * Сначала с вырезанием тишины (`vad_filter`); если Workers AI этот параметр не примет, повторяем без него, чтобы проверка
 * произношения не сломалась совсем (событие `whisper_vad_error` в журнале скажет, что так случилось).
 */
export async function transcribeHebrew(ai: unknown, audio: Uint8Array): Promise<Transcript | null> {
  const input = { audio: toBase64(audio), language: "he", task: "transcribe" };
  const model = ai as SpeechModel;
  try {
    return readTranscript(await model.run(WHISPER_MODEL, { ...input, vad_filter: true }));
  } catch (err) {
    logWarn("whisper_vad_error", describeError(err));
  }
  try {
    return readTranscript(await model.run(WHISPER_MODEL, input));
  } catch (err) {
    // Причина сбоя Workers AI (лимит нейронов, таймаут, формат записи) видна только здесь: пишем её в журнал.
    logError("whisper_error", describeError(err));
    return null;
  }
}
