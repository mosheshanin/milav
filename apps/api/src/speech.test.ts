import { describe, expect, it } from "vitest";
import { NO_SPEECH_PROB, isNoSpeech, isSilencePhrase, readTranscript } from "./speech";

describe("ответ Whisper: есть ли голос", () => {
  it("пусто, только знаки, тишина после VAD: голоса нет", () => {
    expect(readTranscript({ text: "" }).noSpeech).toBe(true);
    expect(readTranscript({ text: " .?! " }).noSpeech).toBe(true);
    expect(readTranscript({}).noSpeech).toBe(true);
    expect(readTranscript(null).noSpeech).toBe(true);
    expect(readTranscript({ text: "כלב", transcription_info: { duration_after_vad: 0 } }).noSpeech).toBe(true);
  });

  it("иврит, цифры и латиница это речь", () => {
    for (const text of ["כלב", "11", "akhbar"]) expect(readTranscript({ text }).noSpeech).toBe(false);
    expect(readTranscript({ text: "כלב", transcription_info: { duration_after_vad: 0.8 } }).noSpeech).toBe(false);
  });

  it("сегменты: «не речь» только если все сегменты такие и с высокой уверенностью", () => {
    const seg = (p: number) => ({ text: "כלב", no_speech_prob: p });
    expect(readTranscript({ text: "כלב", segments: [seg(NO_SPEECH_PROB)] }).noSpeech).toBe(true);
    expect(readTranscript({ text: "כלב", segments: [seg(0.95), seg(0.2)] }).noSpeech).toBe(false);
    expect(readTranscript({ text: "כלב", segments: [seg(0.6)] }).noSpeech).toBe(false);
    expect(readTranscript({ text: "כלב", segments: [seg(0.95), seg(0.2)] }).noSpeechProb).toBe(0.95);
    expect(readTranscript({ text: "כלב", segments: [{ text: "כלב" }] }).noSpeechProb).toBeUndefined();
  });

  it("фразы, которые Whisper выдумывает на тишине", () => {
    for (const text of ["תודה רבה", "תודה רבה.", "תּוֹדָה רַבָּה!", "תודה", "תודה שצפיתם", "תורגם על ידי", "כתוביות: ...", "Thank you.", "thanks for watching!"]) {
      expect(isSilencePhrase(text)).toBe(true);
    }
    for (const text of ["כלב", "תודה על קפה", "בית ספר", "thank", "akhbar", "11"]) expect(isSilencePhrase(text)).toBe(false);
  });

  it("совпавшая со словом фраза не считается тишиной: «תודה רבה» это слово урока", () => {
    const t = readTranscript({ text: "תודה רבה" });
    expect(isNoSpeech(t, true)).toBe(false);
    expect(isNoSpeech(t, false)).toBe(true);
    expect(isNoSpeech(readTranscript({ text: "" }), true)).toBe(true);
  });
});
