import { readBodyLimited } from "./body";
import { lessons } from "@milav/content";
import type { SpeechMatchDetail } from "@milav/shared";
import { describeError, logError, type LogFields } from "./telemetry";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
/** Запись слова длится несколько секунд; всё, что больше, это не слово. */
export const MAX_AUDIO_BYTES = 1_500_000;

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

/** Распознаёт речь на иврите (Whisper в Workers AI). null, если распознаватель не отработал. */
export async function transcribeHebrew(ai: unknown, audio: Uint8Array): Promise<string | null> {
  try {
    const out = (await (ai as SpeechModel).run(WHISPER_MODEL, {
      audio: toBase64(audio),
      language: "he",
      task: "transcribe",
    })) as { text?: string };
    return (out.text ?? "").trim();
  } catch (err) {
    // Причина сбоя Workers AI (лимит нейронов, таймаут, формат записи) видна только здесь: пишем её в журнал.
    logError("whisper_error", describeError(err));
    return null;
  }
}
