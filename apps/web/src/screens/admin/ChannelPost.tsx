// «Пост в канал»: бот публикует в канал пост с картинкой, простой разметкой и кнопкой-ссылкой под ним.
// Сначала «Прислать мне» (пост приходит в чат с ботом), потом «Опубликовать в канал». Черновик текста хранится на устройстве.
import { useEffect, useRef, useState } from "react";
import {
  CHANNEL_BUTTON_DEFAULT,
  CHANNEL_CAPTION_MAX,
  CHANNEL_DEFAULT,
  CHANNEL_PHOTO_MAX_BYTES,
  CHANNEL_PHOTO_TYPES,
  CHANNEL_TEXT_MAX,
  checkChannelPost,
  parsePost,
  postLength,
  type ChannelPostTarget,
} from "@milav/shared";
import { api } from "../../api";
import { Toggle } from "../../components/Controls";
import { Button, Card } from "../../components/ui";
import { adminErrorText, channelPostErrorText } from "../../lib/adminText";
import { confirmAction, getTelegram } from "../../telegram";

const DRAFT_KEY = "milav.admin.channelDraft";

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(text: string): void {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Хранилище недоступно: черновик просто не запомнится.
  }
}

function openLink(url: string): void {
  const tg = getTelegram();
  if (tg?.openTelegramLink && url.startsWith("https://t.me/")) tg.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

const inputClass = "min-h-12 w-full rounded-control border border-line bg-page px-3 text-ink";

export function ChannelPost() {
  const [channel, setChannel] = useState(CHANNEL_DEFAULT);
  const [text, setText] = useState(loadDraft);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [withButton, setWithButton] = useState(true);
  const [buttonText, setButtonText] = useState<string>(CHANNEL_BUTTON_DEFAULT.text);
  const [buttonUrl, setButtonUrl] = useState<string>(CHANNEL_BUTTON_DEFAULT.url);
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string; link?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveDraft(text), [text]);
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const max = photo ? CHANNEL_CAPTION_MAX : CHANNEL_TEXT_MAX;
  const length = postLength(text.trim());

  function pickPhoto(file: File | undefined) {
    setStatus(null);
    if (!file) return;
    if (!(CHANNEL_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setStatus({ tone: "error", text: channelPostErrorText("photo_type") });
      return;
    }
    if (file.size > CHANNEL_PHOTO_MAX_BYTES) {
      setStatus({ tone: "error", text: channelPostErrorText("photo_too_big") });
      return;
    }
    setPhoto(file);
  }

  async function send(target: ChannelPostTarget) {
    if (busy) return;
    const check = checkChannelPost({
      text,
      channel,
      buttonText: withButton ? buttonText : "",
      buttonUrl: withButton ? buttonUrl : "",
      hasPhoto: photo !== null,
    });
    if (!check.ok) {
      setStatus({ tone: "error", text: channelPostErrorText(check.error, check.max) });
      return;
    }
    if (target === "channel" && !(await confirmAction(`Опубликовать пост в ${check.post.channel}? Его сразу увидят подписчики.`))) return;
    const form = new FormData();
    form.set("target", target);
    form.set("text", check.post.text);
    form.set("channel", check.post.channel);
    if (check.post.button) {
      form.set("buttonText", check.post.button.text);
      form.set("buttonUrl", check.post.button.url);
    }
    if (silent) form.set("silent", "1");
    if (photo) form.set("photo", photo);
    setBusy(true);
    setStatus(null);
    try {
      const res = await api.admin.postToChannel(form);
      setStatus(
        target === "me"
          ? { tone: "ok", text: "Отправлено вам в чат с ботом. Проверьте, как выглядит пост и работает ли кнопка." }
          : { tone: "ok", text: `Опубликовано в ${check.post.channel}.`, ...(res.link ? { link: res.link } : {}) },
      );
    } catch (e) {
      setStatus({ tone: "error", text: adminErrorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-2">
        <p className="text-sm">
          Пост публикует бот @milavbotbot от имени канала. Один раз добавьте бота в администраторы канала с правом «Публикация
          сообщений». Сначала нажмите «Прислать мне» и посмотрите пост в чате с ботом.
        </p>
      </Card>

      <Card className="flex flex-col gap-block">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Канал</span>
          <span className="text-sm text-ink-soft">@имя канала или его числовой id (-100…).</span>
          <input
            type="text"
            autoComplete="off"
            className={inputClass}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            data-testid="channel-name"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="font-semibold">Картинка</span>
          <input
            ref={fileRef}
            type="file"
            accept={CHANNEL_PHOTO_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
            data-testid="channel-photo-input"
          />
          {photo ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft" data-testid="channel-photo-name">
                {photo.name}, {Math.round(photo.size / 1024)} КБ
              </span>
              <Button variant="ghost" className="min-h-10" onClick={() => fileRef.current?.click()}>
                Заменить
              </Button>
              <Button variant="ghost" className="min-h-10" onClick={() => setPhoto(null)} data-testid="channel-photo-remove">
                Убрать
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="min-h-10 self-start" onClick={() => fileRef.current?.click()} data-testid="channel-photo-pick">
              Выбрать картинку
            </Button>
          )}
          <span className="text-sm text-ink-soft">JPEG или PNG до 5 МБ. С картинкой текст становится подписью: до 1024 знаков.</span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Текст</span>
          <textarea
            className="min-h-48 w-full rounded-control border border-line bg-page p-3 text-ink"
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="channel-text"
          />
          <span className={`text-sm ${length > max ? "text-danger" : "text-ink-soft"}`} data-testid="channel-length">
            {length} из {max} знаков
          </span>
          <span className="text-sm text-ink-soft">
            Разметка: <code className="rounded bg-page px-1">**жирный**</code>, <code className="rounded bg-page px-1">__курсив__</code>,{" "}
            <code className="rounded bg-page px-1">[текст](https://ссылка)</code>. Ссылки и @имена подсвечиваются сами, эмодзи можно.
          </span>
        </label>

        <Toggle
          label="Кнопка под постом"
          hint="Ссылка ?startapp сразу открывает приложение. Без неё откроется чат с ботом."
          checked={withButton}
          testId="channel-button-on"
          onChange={setWithButton}
        />
        {withButton && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Надпись на кнопке</span>
              <input type="text" className={inputClass} value={buttonText} onChange={(e) => setButtonText(e.target.value)} data-testid="channel-button-text" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Ссылка</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                className={inputClass}
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                data-testid="channel-button-url"
              />
            </label>
          </div>
        )}

        <Toggle label="Без звука" hint="Подписчики получат пост без звукового уведомления." checked={silent} testId="channel-silent" onChange={setSilent} />
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Как будет выглядеть</h2>
        <Preview text={text.trim()} photoUrl={photoUrl} button={withButton && buttonText.trim() ? buttonText.trim() : null} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => void send("me")} data-testid="channel-send-me">
          Прислать мне
        </Button>
        <Button disabled={busy} onClick={() => void send("channel")} data-testid="channel-publish">
          Опубликовать в канал
        </Button>
      </div>

      {status && (
        <div
          role={status.tone === "error" ? "alert" : "status"}
          className={`sticky bottom-2 flex flex-col items-start gap-2 rounded-card border bg-surface p-3 shadow ${status.tone === "error" ? "border-danger" : "border-line"}`}
          data-testid="channel-status"
        >
          <p>{status.text}</p>
          {status.link && (
            <Button variant="ghost" className="min-h-10" onClick={() => openLink(status.link!)} data-testid="channel-open-post">
              Открыть пост
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** Примерный вид поста: картинка, текст с разметкой и кнопка, как в Telegram. */
function Preview({ text, photoUrl, button }: { text: string; photoUrl: string | null; button: string | null }) {
  if (!text && !photoUrl) return <p className="text-sm text-ink-soft">Напишите текст или выберите картинку.</p>;
  return (
    <div className="flex flex-col gap-1" data-testid="channel-preview">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {photoUrl && <img src={photoUrl} alt="" className="block max-h-96 w-full bg-page object-contain" />}
        {text && (
          <p className="whitespace-pre-wrap break-words p-3">
            {parsePost(text).map((s, i) =>
              s.bold ? (
                <b key={i}>{s.text}</b>
              ) : s.italic ? (
                <i key={i}>{s.text}</i>
              ) : s.href ? (
                <span key={i} className="text-accent underline">
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        )}
      </div>
      {button && (
        <div className="rounded-control bg-accent-soft p-2 text-center text-sm font-semibold text-accent" data-testid="channel-preview-button">
          {button} ↗
        </div>
      )}
    </div>
  );
}
