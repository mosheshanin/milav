// «Пост в канал»: бот публикует в канал пост с картинками (до 10, альбомом), простой разметкой и кнопкой-ссылкой.
// Сначала «Прислать мне» (пост приходит в чат с ботом), потом «Опубликовать в канал». Черновик текста хранится на устройстве.
// Картинки уменьшаются на телефоне до отправки (lib/shrinkPhoto.ts).
import { useEffect, useRef, useState } from "react";
import {
  CHANNEL_BUTTON_DEFAULT,
  CHANNEL_DEFAULT,
  CHANNEL_PHOTO_MAX_BYTES,
  CHANNEL_PHOTO_TYPES,
  CHANNEL_PHOTOS_MAX,
  CHANNEL_PHOTOS_TOTAL_MAX_BYTES,
  checkChannelPost,
  parsePost,
  postLayout,
  postLength,
  postTextMax,
  type ChannelPostTarget,
  type PostLayout,
} from "@milav/shared";
import { ApiError, api } from "../../api";
import { Toggle } from "../../components/Controls";
import { Button, Card } from "../../components/ui";
import { adminErrorText, channelPostErrorText } from "../../lib/adminText";
import { shrinkPhoto } from "../../lib/shrinkPhoto";
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

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;

/** Подсказка, как уйдёт пост: от неё зависит, где окажется текст и кнопка. */
const LAYOUT_HINTS: Record<PostLayout, string> = {
  text: "Пост уйдёт одним сообщением: текст до 4096 знаков и кнопка под ним.",
  photo: "Одна картинка: текст станет подписью под ней (до 1024 знаков), кнопка — под постом.",
  album: "Альбом: текст станет подписью под альбомом (до 1024 знаков). Кнопку к альбому Telegram не прикрепляет: включите её, и текст с кнопкой придут отдельным сообщением сразу после альбома.",
  "album+text": "Альбом с кнопкой: сначала придут картинки, сразу следом сообщение с текстом (до 4096 знаков) и кнопкой. Telegram не даёт прикрепить кнопку к самому альбому.",
};

interface Photo {
  id: number;
  file: File;
  url: string;
}

let nextPhotoId = 1;

const inputClass = "min-h-12 w-full rounded-control border border-line bg-page px-3 text-ink";

export function ChannelPost() {
  const [channel, setChannel] = useState(CHANNEL_DEFAULT);
  const [text, setText] = useState(loadDraft);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [withButton, setWithButton] = useState(true);
  const [buttonText, setButtonText] = useState<string>(CHANNEL_BUTTON_DEFAULT.text);
  const [buttonUrl, setButtonUrl] = useState<string>(CHANNEL_BUTTON_DEFAULT.url);
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string; link?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => saveDraft(text), [text]);
  // Адреса предпросмотра освобождаются, когда экран закрывают.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const hasButton = withButton && (buttonText.trim() !== "" || buttonUrl.trim() !== "");
  const layout = postLayout(photos.length, hasButton);
  const max = postTextMax(layout);
  const length = postLength(text.trim());
  const totalBytes = photos.reduce((sum, p) => sum + p.file.size, 0);

  async function addPhotos(list: FileList | null) {
    setStatus(null);
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    const room = CHANNEL_PHOTOS_MAX - photos.length;
    if (room <= 0) {
      setStatus({ tone: "error", text: channelPostErrorText("too_many_photos", CHANNEL_PHOTOS_MAX) });
      return;
    }
    setPreparing(true);
    const added: Photo[] = [];
    let skipped: string | null = files.length > room ? channelPostErrorText("too_many_photos", CHANNEL_PHOTOS_MAX) : null;
    for (const original of files.slice(0, room)) {
      const file = await shrinkPhoto(original);
      if (!(CHANNEL_PHOTO_TYPES as readonly string[]).includes(file.type)) {
        skipped = channelPostErrorText("photo_type");
        continue;
      }
      if (file.size > CHANNEL_PHOTO_MAX_BYTES) {
        skipped = channelPostErrorText("photo_too_big");
        continue;
      }
      added.push({ id: nextPhotoId++, file, url: URL.createObjectURL(file) });
    }
    setPreparing(false);
    setPhotos((prev) => [...prev, ...added]);
    if (skipped) setStatus({ tone: "error", text: skipped });
  }

  function removePhoto(id: number) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function movePhoto(index: number, delta: -1 | 1) {
    setPhotos((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
  }

  async function send(target: ChannelPostTarget) {
    if (busy || preparing) return;
    const check = checkChannelPost({
      text,
      channel,
      buttonText: withButton ? buttonText : "",
      buttonUrl: withButton ? buttonUrl : "",
      photos: photos.length,
    });
    if (!check.ok) {
      setStatus({ tone: "error", text: channelPostErrorText(check.error, check.max) });
      return;
    }
    if (totalBytes > CHANNEL_PHOTOS_TOTAL_MAX_BYTES) {
      setStatus({ tone: "error", text: channelPostErrorText("photos_total") });
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
    for (const p of photos) form.append("photo", p.file);
    setBusy(true);
    setStatus(null);
    try {
      const res = await api.admin.postToChannel(form);
      const where = target === "me" ? "Отправлено вам в чат с ботом." : `Опубликовано в ${check.post.channel}.`;
      if (res.followUpError) {
        setStatus({
          tone: "error",
          text: `${where} Альбом ушёл, но сообщение с текстом и кнопкой — нет: ${adminErrorText(new ApiError(502, res.followUpError))}`,
          ...(res.link ? { link: res.link } : {}),
        });
      } else {
        setStatus(
          target === "me"
            ? { tone: "ok", text: `${where} Проверьте, как выглядит пост и работает ли кнопка.` }
            : { tone: "ok", text: where, ...(res.link ? { link: res.link } : {}) },
        );
      }
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
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">Картинки</span>
            <span className="text-sm text-ink-soft" data-testid="channel-photo-count">
              {photos.length} из {CHANNEL_PHOTOS_MAX}
              {photos.length > 0 ? `, ${mb(totalBytes)}` : ""}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = "";
            }}
            data-testid="channel-photo-input"
          />
          {photos.length > 0 && (
            <ol className="grid grid-cols-3 gap-2" data-testid="channel-photos">
              {photos.map((p, i) => (
                <li key={p.id} className="flex flex-col gap-1" data-testid="channel-photo">
                  <div className="relative">
                    <img src={p.url} alt={`Картинка ${i + 1}`} className="aspect-square w-full rounded-control border border-line bg-page object-cover" />
                    <span className="absolute left-1 top-1 rounded-full bg-surface px-2 text-sm font-semibold">{i + 1}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="min-h-9 flex-1 rounded-control border border-line bg-surface text-ink disabled:opacity-40"
                      disabled={i === 0}
                      aria-label={`Картинку ${i + 1} левее`}
                      onClick={() => movePhoto(i, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="min-h-9 flex-1 rounded-control border border-line bg-surface text-ink disabled:opacity-40"
                      disabled={i === photos.length - 1}
                      aria-label={`Картинку ${i + 1} правее`}
                      onClick={() => movePhoto(i, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="min-h-9 flex-1 rounded-control border border-line bg-surface text-danger"
                      aria-label={`Убрать картинку ${i + 1}`}
                      onClick={() => removePhoto(p.id)}
                      data-testid="channel-photo-remove"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {preparing ? (
            <p className="text-sm text-ink-soft" role="status">
              Готовлю картинки…
            </p>
          ) : (
            photos.length < CHANNEL_PHOTOS_MAX && (
              <Button variant="ghost" className="min-h-10 self-start" onClick={() => fileRef.current?.click()} data-testid="channel-photo-pick">
                {photos.length === 0 ? "Выбрать картинки" : "Добавить ещё"}
              </Button>
            )
          )}
          <span className="text-sm text-ink-soft">
            До 10 картинок: две и больше уйдут альбомом. Картинки уменьшаются до размера, который хранит Telegram, перед отправкой.
          </span>
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
        <p className="text-sm text-ink-soft" data-testid="channel-layout-hint">
          {LAYOUT_HINTS[layout]}
        </p>
        <Preview text={text.trim()} photos={photos.map((p) => p.url)} layout={layout} button={hasButton && buttonText.trim() ? buttonText.trim() : null} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={busy || preparing} onClick={() => void send("me")} data-testid="channel-send-me">
          Прислать мне
        </Button>
        <Button disabled={busy || preparing} onClick={() => void send("channel")} data-testid="channel-publish">
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

function PostText({ text }: { text: string }) {
  return (
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
  );
}

function ButtonBar({ text }: { text: string }) {
  return (
    <div className="rounded-control bg-accent-soft p-2 text-center text-sm font-semibold text-accent" data-testid="channel-preview-button">
      {text} ↗
    </div>
  );
}

/** Примерный вид поста, как в Telegram: картинка или альбом, текст с разметкой, кнопка (у альбома — отдельным сообщением). */
function Preview({ text, photos, layout, button }: { text: string; photos: string[]; layout: PostLayout; button: string | null }) {
  if (!text && photos.length === 0) return <p className="text-sm text-ink-soft">Напишите текст или выберите картинки.</p>;
  const separate = layout === "album+text";
  return (
    <div className="flex flex-col gap-1" data-testid="channel-preview">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {photos.length === 1 && <img src={photos[0]} alt="" className="block max-h-96 w-full bg-page object-contain" />}
        {photos.length > 1 && (
          <div className="grid grid-cols-2 gap-0.5 bg-line" data-testid="channel-preview-album">
            {photos.map((url, i) => (
              <img
                key={url}
                src={url}
                alt=""
                className={`block aspect-square w-full bg-page object-cover ${photos.length % 2 === 1 && i === 0 ? "col-span-2 aspect-video" : ""}`}
              />
            ))}
          </div>
        )}
        {text && !separate && <PostText text={text} />}
      </div>
      {separate ? (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-surface" data-testid="channel-preview-followup">
            <PostText text={text} />
          </div>
          {button && <ButtonBar text={button} />}
        </>
      ) : (
        button && <ButtonBar text={button} />
      )}
    </div>
  );
}
