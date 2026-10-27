// Тренажёр «Числа на слух» (docs/SPEC.md): на сервере только проверка речи. Задания, проверка набранных цифр и озвучка
// считаются на телефоне, потому что тренажёр ничего не сохраняет и не даёт очков. Речь идёт через Whisper, поэтому у неё два лимита:
// общий `speech` и свой суточный `numbers` (NUMBERS_SPEECH_PER_DAY), чтобы тренажёр не съел квоту «говори» в уроках (вопрос 91).
import { Hono } from "hono";
import { checkSpoken, parseNumberTarget } from "@milav/shared";
import { requireUser } from "./auth";
import type { AppEnv } from "./env";
import { numbersTrainerOn } from "./play";
import { rateLimit } from "./rateLimit";
import { readAudio, transcribeHebrew } from "./speech";
import { logEvent, logWarn } from "./telemetry";

export const numbersRoutes = new Hono<AppEnv>();

// Тренажёр выключен в панели («Тренажёр «Числа на слух»»): маршрут отвечает 403, приложение прячет строку входа.
numbersRoutes.use("/api/numbers/*", requireUser, async (c, next) => {
  if (!(await numbersTrainerOn(c.env, c.get("user").id))) return c.json({ error: "feature_off" }, 403);
  await next();
});

// Запись голоса (тело запроса, audio/*) и задание в адресе: scene=number|price|floor|age и value, либо scene=time, hour и minute.
// Сервер не доверяет присланному только в одном: числа вне 0…9999 и время не из набора отклоняются.
numbersRoutes.post("/api/numbers/speech", rateLimit("numbers"), rateLimit("speech"), async (c) => {
  const user = c.get("user");
  const scene = c.req.query("scene");
  const target = parseNumberTarget(scene, c.req.query("value"), c.req.query("hour"), c.req.query("minute"));
  if (!target) return c.json({ error: "bad_target" }, 400);
  if (!c.env.AI) return c.json({ error: "speech_unavailable" }, 503);

  const recording = await readAudio(c.req.raw);
  if (!recording.ok) return c.json({ error: recording.error }, recording.status);

  const heard = await transcribeHebrew(c.env.AI, recording.audio);
  if (heard === null) {
    logWarn("speech_failed", { uid: user.id, where: "numbers", scene, bytes: recording.audio.byteLength });
    return c.json({ error: "speech_failed" }, 502);
  }
  const verdict = checkSpoken(target, heard);
  // Что услышал распознаватель: по несовпадениям видно, как Whisper пишет числа (цифрами или словами).
  logEvent("speech", { uid: user.id, where: "numbers", scene, match: verdict.match, heard, digits: verdict.digits });
  return c.json({ heard, match: verdict.match });
});
