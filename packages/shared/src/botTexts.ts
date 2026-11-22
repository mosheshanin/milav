// Тексты бота, которые меняются из панели («Сообщения бота», docs/ADMIN.md): ответы на команды, кнопки, всплывающие
// ответы на кнопки, описание бота и меню команд. Исходные тексты живут здесь; в базе (таблица bot_texts) лежат только
// изменённые из панели. «Вернуть исходный» удаляет строку из базы.
//
// Тексты ежедневных напоминаний и подтверждения «Напоминания включены» сюда не входят: их несколько на вид, у каждого
// своя статистика, они в таблице reminder_texts и в разделе панели «Напоминания».

/** Подстановки в текстах бота (в фигурных скобках). */
export const BOT_PLACEHOLDERS = {
  имя: "имя из Telegram",
  время: "время напоминаний ученика, например 20:00",
} as const;
export type BotPlaceholder = keyof typeof BOT_PLACEHOLDERS;

/** Куда уходит текст: от этого зависят предел длины и что можно сделать в панели. */
export type BotTextKind =
  /** Сообщение в чате: можно «Прислать мне». */
  | "message"
  /** Надпись на кнопке под сообщением. */
  | "button"
  /** Всплывающая подсказка вверху чата после нажатия кнопки (answerCallbackQuery). */
  | "popup"
  /** Профиль бота и меню команд: сохраняется в Telegram сразу. */
  | "profile";

export type BotTextGroup = "replies" | "remindersCommand" | "reminderButtons" | "popups" | "confirm" | "profile";

export const BOT_TEXT_GROUPS: readonly { id: BotTextGroup; title: string; hint: string }[] = [
  { id: "replies", title: "Ответы на сообщения", hint: "Что бот отвечает на /start, /help и на любое другое сообщение. Под каждым ответом кнопка, открывающая приложение." },
  { id: "remindersCommand", title: "Команда /reminders", hint: "Ответ на /reminders зависит от того, включены ли у ученика напоминания." },
  { id: "reminderButtons", title: "Кнопки под напоминаниями", hint: "Под каждым ежедневным напоминанием. «Отключить» стоит и под ответом на /reminders." },
  { id: "popups", title: "Ответы на кнопки", hint: "Всплывающая подсказка вверху чата после нажатия кнопки под напоминанием или под /reminders. Не больше 200 знаков." },
  { id: "confirm", title: "Запасное подтверждение", hint: "Уходит, когда ученик включил напоминания, а все тексты вида «Напоминания включены» в разделе «Напоминания» выключены." },
  { id: "profile", title: "Профиль бота и меню команд", hint: "Сохраняется в Telegram сразу. У людей описание обновится, когда они снова откроют чат; меню команд иногда только после перезапуска Telegram." },
];

export interface BotTextDef {
  group: BotTextGroup;
  kind: BotTextKind;
  title: string;
  hint: string;
  default: string;
  placeholders: readonly BotPlaceholder[];
  max: number;
}

/** Предел длины: сообщение Telegram до 4096 знаков, подсказка до 200, описание 512, короткое 120, команда 256. */
const MESSAGE_MAX = 2000;
const BUTTON_MAX = 64;
const POPUP_MAX = 200;

export const BOT_TEXTS = {
  start: {
    group: "replies",
    kind: "message",
    title: "Приветствие на /start",
    hint: "Первое сообщение нового ученика (кнопка «Старт») и ответ на /start.",
    default: [
      "Шалом, {имя}! 👋",
      "",
      "Milav — иврит для русскоязычных. В каждом уроке 10 слов: слушаете, произносите, пишете от руки и печатаете, а потом сдаёте викторину.",
      "",
      "Начните с алфавита: первые уроки в каждой теме бесплатные. Нажмите кнопку ниже 👇",
    ].join("\n"),
    placeholders: ["имя"],
    max: MESSAGE_MAX,
  },
  help: {
    group: "replies",
    kind: "message",
    title: "Ответ на /help",
    hint: "Как заниматься.",
    default: [
      "Как заниматься в Milav:",
      "",
      "1. Откройте приложение кнопкой ниже или кнопкой меню слева от поля ввода.",
      "2. Выберите урок. Каждое слово проходит 4 этапа: «Слушай», «Говори», «Пиши», «Печатай».",
      "3. Когда все слова пройдены, откроется викторина. Сдали — урок засчитан, растёт статус.",
      "",
      "Для этапа «Говори» нужен микрофон: приложение попросит доступ.",
      "Цель дня, тема оформления и другие настройки — в приложении, шестерёнка вверху главной.",
      "Напоминания заниматься: команда /reminders.",
    ].join("\n"),
    placeholders: ["имя"],
    max: MESSAGE_MAX,
  },
  fallback: {
    group: "replies",
    kind: "message",
    title: "Ответ на любое другое сообщение",
    hint: "Бот не ведёт переписку: на всё, кроме команд, отвечает этим текстом.",
    default: "Я пока не отвечаю на сообщения, все занятия в приложении. Нажмите кнопку ниже 👇",
    placeholders: ["имя"],
    max: MESSAGE_MAX,
  },
  "button.open": {
    group: "replies",
    kind: "button",
    title: "Кнопка под ответами",
    hint: "Открывает приложение.",
    default: "📚 Открыть Milav",
    placeholders: [],
    max: BUTTON_MAX,
  },
  "remcmd.on": {
    group: "remindersCommand",
    kind: "message",
    title: "Напоминания включены",
    hint: "Под ним кнопка «Отключить».",
    default:
      "Напоминания включены: каждый день в {время} (по времени вашего телефона), если в этот день вы ещё не занимались. В шаббат не пишу. Время меняется в приложении: «Настройки» → «Напоминания».",
    placeholders: ["имя", "время"],
    max: MESSAGE_MAX,
  },
  "remcmd.off": {
    group: "remindersCommand",
    kind: "message",
    title: "Напоминания выключены",
    hint: "Под ним кнопка «Включить в …». {время}: время, которое ученик выбирал раньше, или время по умолчанию из настроек ниже.",
    default: "Напоминания выключены. Включить? Буду писать в {время}, только если в этот день вы ещё не занимались, и не в шаббат.",
    placeholders: ["имя", "время"],
    max: MESSAGE_MAX,
  },
  "remcmd.unavailable": {
    group: "remindersCommand",
    kind: "message",
    title: "Напоминания недоступны",
    hint: "Когда напоминания выключены в настройках (или включены только для команды, а пишет ученик).",
    default: "Напоминания пока недоступны. Скоро включим!",
    placeholders: ["имя"],
    max: MESSAGE_MAX,
  },
  "button.enable": {
    group: "remindersCommand",
    kind: "button",
    title: "Кнопка «Включить»",
    hint: "Под ответом «Напоминания выключены».",
    default: "Включить в {время}",
    placeholders: ["время"],
    max: BUTTON_MAX,
  },
  "button.continue": {
    group: "reminderButtons",
    kind: "button",
    title: "Кнопка «Продолжить»",
    hint: "Открывает приложение. Стоит и под подтверждением «Напоминания включены».",
    default: "📚 Продолжить",
    placeholders: [],
    max: BUTTON_MAX,
  },
  "button.skip": {
    group: "reminderButtons",
    kind: "button",
    title: "Кнопка «Завтра не напоминать»",
    hint: "",
    default: "Завтра не напоминать",
    placeholders: [],
    max: BUTTON_MAX,
  },
  "button.disable": {
    group: "reminderButtons",
    kind: "button",
    title: "Кнопка «Отключить»",
    hint: "Под напоминанием и под ответом «Напоминания включены» на /reminders.",
    default: "Отключить",
    placeholders: [],
    max: BUTTON_MAX,
  },
  "popup.off": {
    group: "popups",
    kind: "popup",
    title: "Нажали «Отключить»",
    hint: "",
    default: "Напоминания отключены. Включить снова: /reminders или «Настройки» в приложении.",
    placeholders: [],
    max: POPUP_MAX,
  },
  "popup.skip": {
    group: "popups",
    kind: "popup",
    title: "Нажали «Завтра не напоминать»",
    hint: "",
    default: "Хорошо, завтра не напомню. Послезавтра снова буду рядом 🙂",
    placeholders: [],
    max: POPUP_MAX,
  },
  "popup.alreadyOff": {
    group: "popups",
    kind: "popup",
    title: "«Завтра не напоминать», а напоминания уже выключены",
    hint: "",
    default: "Напоминания и так выключены.",
    placeholders: [],
    max: POPUP_MAX,
  },
  "popup.on": {
    group: "popups",
    kind: "popup",
    title: "Нажали «Включить»",
    hint: "",
    default: "Готово! Напомню в {время}, если в этот день вы ещё не занимались. В шаббат не пишу.",
    placeholders: ["время"],
    max: POPUP_MAX,
  },
  "popup.alreadyOn": {
    group: "popups",
    kind: "popup",
    title: "«Включить», а напоминания уже включены",
    hint: "",
    default: "Напоминания уже включены: каждый день в {время}.",
    placeholders: ["время"],
    max: POPUP_MAX,
  },
  "popup.unavailable": {
    group: "popups",
    kind: "popup",
    title: "«Включить», а напоминания недоступны",
    hint: "",
    default: "Напоминания пока недоступны.",
    placeholders: [],
    max: POPUP_MAX,
  },
  "confirm.fallback": {
    group: "confirm",
    kind: "message",
    title: "Напоминания включены (запасной)",
    hint: "Под ним кнопка «Продолжить».",
    default: "Готово! Буду напоминать в {время}, если в этот день вы ещё не занимались. В шаббат не пишу.",
    placeholders: ["имя", "время"],
    max: MESSAGE_MAX,
  },
  "profile.description": {
    group: "profile",
    kind: "profile",
    title: "Описание бота",
    hint: "Видно в пустом чате до нажатия «Старт» («Что умеет этот бот?»).",
    default: "Milav — иврит для русскоязычных. Слова с озвучкой, произношение, письмо от руки и викторины. Нажмите «Старт», чтобы начать.",
    placeholders: [],
    max: 512,
  },
  "profile.short": {
    group: "profile",
    kind: "profile",
    title: "Короткое описание",
    hint: "В профиле бота и в карточке, когда ссылкой на бота делятся.",
    default: "Иврит для русскоязычных: слова, произношение, письмо и викторины.",
    placeholders: [],
    max: 120,
  },
  "command.start": {
    group: "profile",
    kind: "profile",
    title: "Меню: /start",
    hint: "Подпись команды в меню «/».",
    default: "Открыть приложение",
    placeholders: [],
    max: 256,
  },
  "command.help": {
    group: "profile",
    kind: "profile",
    title: "Меню: /help",
    hint: "",
    default: "Как заниматься",
    placeholders: [],
    max: 256,
  },
  "command.reminders": {
    group: "profile",
    kind: "profile",
    title: "Меню: /reminders",
    hint: "",
    default: "Напоминания: включить или отключить",
    placeholders: [],
    max: 256,
  },
} as const satisfies Record<string, BotTextDef>;

export type BotTextKey = keyof typeof BOT_TEXTS;
export const BOT_TEXT_KEYS = Object.keys(BOT_TEXTS) as BotTextKey[];
export type BotTexts = Record<BotTextKey, string>;

export function isBotTextKey(value: unknown): value is BotTextKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BOT_TEXTS, value);
}

/** Исходные тексты (пока в панели ничего не меняли). */
export function defaultBotTexts(): BotTexts {
  const out = {} as BotTexts;
  for (const key of BOT_TEXT_KEYS) out[key] = BOT_TEXTS[key].default;
  return out;
}

/** Команды меню «/» в том порядке, в каком их видит ученик. */
export const BOT_MENU_COMMANDS = [
  { command: "start", key: "command.start" },
  { command: "help", key: "command.help" },
  { command: "reminders", key: "command.reminders" },
] as const satisfies readonly { command: string; key: BotTextKey }[];

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

export type BotTextError = "empty" | "too_long" | "bad_braces" | "unknown_placeholder" | "multiline";

/** Проверка текста перед сохранением (сервер и панель). Возвращает очищенный текст или ошибку. */
export function checkBotText(key: BotTextKey, text: unknown): { ok: true; text: string } | { ok: false; error: BotTextError; name?: string } {
  if (typeof text !== "string") return { ok: false, error: "empty" };
  const def: BotTextDef = BOT_TEXTS[key];
  const clean = text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return { ok: false, error: "empty" };
  // На кнопке, во всплывающей подсказке, в описании и в меню перенос строки не нужен (в меню и на кнопке его не видно).
  if (def.kind !== "message" && def.kind !== "popup" && key !== "profile.description" && clean.includes("\n")) return { ok: false, error: "multiline" };
  if ([...clean].length > def.max) return { ok: false, error: "too_long" };
  const outside = clean.replace(PLACEHOLDER_RE, "");
  if (outside.includes("{") || outside.includes("}")) return { ok: false, error: "bad_braces" };
  const allowed = def.placeholders as readonly string[];
  const unknown = [...clean.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!).find((name) => !allowed.includes(name));
  if (unknown !== undefined) return { ok: false, error: "unknown_placeholder", name: unknown };
  return { ok: true, text: clean };
}

export type BotVars = Partial<Record<BotPlaceholder, string>>;

/** Подставляет значения. Подстановка без значения превращается в пустую строку (имени может не быть). */
export function renderBotText(text: string, vars: BotVars): string {
  return text.replace(PLACEHOLDER_RE, (_, name: string) => vars[name as BotPlaceholder] ?? "");
}

/** Примеры для предпросмотра в панели. */
export const BOT_SAMPLE_VARS: Required<BotVars> = { имя: "Анна", время: "20:00" };

// ---- Ответы API панели ----

export interface BotTextItem {
  key: BotTextKey;
  text: string;
  /** true: действует исходный текст (из панели не меняли). */
  isDefault: boolean;
  updatedAt: number | null;
  updatedBy: number | null;
}

export interface AdminBotResponse {
  items: BotTextItem[];
}

/** Результат сохранения текста профиля в Telegram. */
export type BotProfileSync = "ok" | "error" | "no-token";

export interface AdminBotSaveResponse {
  item: BotTextItem;
  changed: boolean;
  /** Только у текстов профиля и меню. */
  telegram?: BotProfileSync;
}
