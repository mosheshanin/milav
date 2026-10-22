// Раздел «Контент» (панель, этап 3: docs/ADMIN.md): проверка слов и букв носителем.
// Список с фильтрами и поиском, карточка слова с озвучкой, отзыв «верно» или исправления по полям с комментарием.
// Отзывы уроки не меняют: администратор копирует выгрузку, Claude переносит правки (`npm run content:reviews`).
// Открытая карточка (itemId) живёт у родителя: так кнопка «назад» сначала закрывает карточку, потом раздел.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Search } from "lucide-react";
import {
  isLetter,
  reviewFields,
  reviewStatusOf,
  reviewValueTitle,
  type ReviewEntry,
  type ReviewField,
  type ReviewItemResponse,
  type ReviewListItem,
  type ReviewListResponse,
  type ReviewVerdict,
} from "@milav/shared";
import { api } from "../../api";
import { Choice } from "../../components/Controls";
import { LetterCard } from "../../components/LetterCard";
import { SpeakerButton } from "../../components/SpeakerButton";
import { WordCard } from "../../components/WordCard";
import { Button, Card, Chip } from "../../components/ui";
import { adminErrorText, dateTimeText } from "../../lib/adminText";
import {
  REVIEW_FILTERS,
  REVIEW_FILTER_TITLES,
  STATUS_CHIP,
  STATUS_TEXT_CLASS,
  fieldGroups,
  filterCounts,
  fixText,
  groupByLesson,
  nextItemId,
  realFixes,
  visibleItems,
  type ReviewFilter,
} from "../../lib/review";
import { confirmAction } from "../../telegram";
import { LoadView, useLoad } from "./load";

export function Content({ admin, itemId, onItem }: { admin: boolean; itemId: string | null; onItem: (id: string | null) => void }) {
  const [value, reload] = useLoad(() => api.review.items());
  const [filter, setFilter] = useState<ReviewFilter>("new");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const listScroll = useRef(0);

  // Карточка открывается сверху, а список возвращается туда, где его оставили.
  useEffect(() => {
    if (itemId) window.scrollTo?.(0, 0);
    else window.scrollTo?.(0, listScroll.current);
  }, [itemId]);

  const open = (id: string) => {
    listScroll.current = window.scrollY ?? 0;
    setNotice(null);
    onItem(id);
  };

  if (itemId) {
    const visible = value.state === "ready" ? visibleItems(value.data.items, filter, query) : [];
    return (
      <ItemReview
        key={itemId}
        id={itemId}
        notice={notice}
        onSaved={(text, goNext) => {
          const next = goNext ? nextItemId(visible, itemId) : null;
          setNotice(text);
          reload();
          if (next) listScroll.current = 0;
          onItem(next ?? null);
        }}
      />
    );
  }

  return (
    <LoadView value={value} reload={reload}>
      {(data) => (
        <ContentList
          data={data}
          admin={admin}
          filter={filter}
          query={query}
          notice={notice}
          onFilter={setFilter}
          onQuery={setQuery}
          onOpen={open}
        />
      )}
    </LoadView>
  );
}

function ContentList({
  data,
  admin,
  filter,
  query,
  notice,
  onFilter,
  onQuery,
  onOpen,
}: {
  data: ReviewListResponse;
  admin: boolean;
  filter: ReviewFilter;
  query: string;
  notice: string | null;
  onFilter: (f: ReviewFilter) => void;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
}) {
  const counts = useMemo(() => filterCounts(data.items), [data]);
  const visible = useMemo(() => visibleItems(data.items, filter, query), [data, filter, query]);
  const groups = useMemo(() => groupByLesson(data.lessons, visible), [data, visible]);

  return (
    <div className="flex flex-col gap-section" data-testid="review-list">
      {notice && (
        <p className="text-success" role="status" data-testid="review-notice">
          {notice}
        </p>
      )}
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">
          Откройте слово, послушайте озвучку и проверьте иврит, огласовки, транскрипцию, перевод и фразу. Если всё верно, нажмите «Всё верно»,
          иначе исправьте нужные поля или напишите комментарий. Уроки меняются не сразу: правки переносит Claude.
        </p>
        <p className="text-sm" data-testid="review-progress">
          Проверено: <b>{counts.done}</b> из {counts.all}. Ждут переноса в уроки: <b>{data.pending}</b>.
        </p>
      </Card>
      {admin && <ExportCard pending={data.pending} />}

      <Choice
        label="Показать"
        options={REVIEW_FILTERS.map((f) => ({ value: f, title: `${REVIEW_FILTER_TITLES[f]} · ${counts[f]}` }))}
        value={filter}
        testId="review-filter"
        onChange={onFilter}
      />
      <label className="flex items-center gap-2 rounded-control border border-line bg-page px-3">
        <Search className="size-icon shrink-0 text-ink-soft" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Поиск: иврит, перевод, транскрипция"
          aria-label="Поиск слова"
          data-testid="review-search"
          className="min-h-12 min-w-0 flex-1 bg-transparent text-ink outline-none"
        />
      </label>

      {groups.length === 0 && <p className="text-center text-ink-soft">Ничего не найдено.</p>}
      {groups.map(({ lesson, items }) => (
        <section key={lesson.id} className="flex flex-col gap-2">
          <h2 className="font-bold">{lesson.title}</h2>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onOpen={() => onOpen(item.id)} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ItemRow({ item, onOpen }: { item: ReviewListItem; onOpen: () => void }) {
  const chip = STATUS_CHIP[item.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`review-item-${item.id}`}
      data-status={item.status}
      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 text-left active:bg-page"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{item.ru}</span>
        <span className="block truncate text-sm text-ink-soft">{item.translit}</span>
        <span className={`block truncate text-sm font-semibold ${STATUS_TEXT_CLASS[item.status]}`}>
          {chip.title}
          {item.mine ? ` · ваш отзыв: ${item.mine === "ok" ? "верно" : "замечания"}` : ""}
          {!item.hasImage ? " · без картинки" : ""}
        </span>
      </span>
      <span dir="rtl" lang="he" className="max-w-[45%] shrink-0 truncate font-hebrew text-2xl font-semibold">
        {item.he}
      </span>
      <ChevronRight className="size-icon shrink-0 text-ink-soft" aria-hidden />
    </button>
  );
}

/**
 * Выгрузка для переноса в уроки (только администраторы). Сначала загружается, потом копируется отдельным нажатием:
 * на телефоне буфер обмена доступен только прямо в обработчике нажатия, а не после ожидания ответа сервера.
 */
function ExportCard({ pending }: { pending: number }) {
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "copied" | "manual">("idle");
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setState("loading");
    setError(null);
    try {
      const data = await api.review.export();
      setText(JSON.stringify(data));
      setState("idle");
    } catch (e) {
      setError(adminErrorText(e));
      setState("idle");
    }
  }

  function copy() {
    if (!text) return;
    const done = () => setState("copied");
    const manual = () => setState("manual");
    try {
      navigator.clipboard ? navigator.clipboard.writeText(text).then(done, manual) : manual();
    } catch {
      manual();
    }
  }

  return (
    <Card className="flex flex-col gap-2" data-testid="review-export">
      <div className="font-semibold">Перенос правок в уроки</div>
      <p className="text-sm text-ink-soft">
        Скопируйте выгрузку и вставьте её в чат Claude с просьбой «перенеси правки проверяющего». Claude обновит уроки, переозвучит исправленные
        слова и выложит приложение; после этого слова станут «Проверено».
      </p>
      {pending === 0 ? (
        <p className="text-sm">Сейчас переносить нечего.</p>
      ) : text === null ? (
        <Button variant="secondary" disabled={state === "loading"} onClick={() => void prepare()} data-testid="review-export-prepare">
          {state === "loading" ? "Готовлю…" : `Подготовить выгрузку (${pending})`}
        </Button>
      ) : (
        <>
          <Button variant="secondary" onClick={copy} data-testid="review-export-copy">
            {state === "copied" ? <Check className="size-icon" aria-hidden /> : <Copy className="size-icon" aria-hidden />}
            {state === "copied" ? "Скопировано" : "Скопировать для Claude"}
          </Button>
          {state === "manual" && (
            <>
              <p className="text-sm text-ink-soft">Скопировать не получилось: выделите текст ниже и скопируйте вручную.</p>
              <textarea readOnly value={text} className="min-h-28 w-full rounded-control border border-line bg-page p-3 text-xs text-ink" onFocus={(e) => e.target.select()} />
            </>
          )}
        </>
      )}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

function ItemReview({ id, notice, onSaved }: { id: string; notice: string | null; onSaved: (text: string, goNext: boolean) => void }) {
  const [value, reload] = useLoad(() => api.review.item(id));
  return (
    <>
      {notice && (
        <p className="mb-block text-success" role="status" data-testid="review-notice">
          {notice} Следующее слово:
        </p>
      )}
      <LoadView value={value} reload={reload}>
        {(data) => <ReviewForm data={data} reload={reload} onSaved={onSaved} />}
      </LoadView>
    </>
  );
}

function ReviewForm({ data, reload, onSaved }: { data: ReviewItemResponse; reload: () => void; onSaved: (text: string, goNext: boolean) => void }) {
  const item = data.item;
  const fields = useMemo(() => reviewFields(item), [item]);
  const mine = data.reviews.find((r) => r.mine && r.current);
  const [edits, setEdits] = useState<Record<string, string>>(() => ({ ...(mine?.fixes ?? {}) }));
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fixes = realFixes(fields, edits);
  const fixCount = Object.keys(fixes).length;
  const status = reviewStatusOf(
    item.reviewed,
    data.reviews.filter((r) => r.current).map((r) => r.verdict),
  );
  const chip = STATUS_CHIP[status];

  async function save(verdict: ReviewVerdict) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.review.save(item.id, { verdict, fixes: verdict === "fix" ? fixes : {}, comment, version: data.version });
      onSaved(verdict === "ok" ? `«${item.he}»: отмечено «верно».` : `«${item.he}»: замечания сохранены.`, true);
    } catch (e) {
      setMessage(adminErrorText(e));
      setBusy(false);
    }
  }

  async function withdraw() {
    if (busy || !(await confirmAction("Отозвать ваш отзыв на это слово?"))) return;
    setBusy(true);
    try {
      await api.review.remove(item.id);
      onSaved(`«${item.he}»: отзыв отозван.`, false);
    } catch (e) {
      setMessage(adminErrorText(e));
      setBusy(false);
    }
  }

  const main = isLetter(item) ? { he: item.name.niqqud, audio: item.audio } : { he: item.niqqud ?? item.he, audio: item.audio };

  return (
    <div className="flex flex-col gap-section" data-testid="review-card" data-item={item.id}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-soft">{data.lessonTitle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Chip tone={chip.tone}>{chip.title}</Chip>
            {item.reviewed && (
              <span className="text-sm text-ink-soft">
                в уроке: {item.reviewed.by}, {item.reviewed.at}
              </span>
            )}
          </div>
        </div>
        <SpeakerButton item={main} label={isLetter(item) ? "Послушать название буквы" : "Послушать слово"} testId="review-listen" />
      </div>

      {isLetter(item) ? (
        <>
          <LetterCard letter={item} />
          <div className="flex items-center gap-3">
            <SpeakerButton item={{ he: item.example.niqqud, audio: item.example.audio }} label="Послушать слово-пример" testId="review-listen-example" />
            <span className="text-sm text-ink-soft">Слово-пример</span>
          </div>
        </>
      ) : (
        <WordCard word={item} bothPhrases />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Поля</h2>
        <p className="text-sm text-ink-soft">Нажмите «Исправить» у поля с ошибкой и введите верное значение.</p>
        {fieldGroups(fields).map(({ group, fields: list }) => (
          <FieldGroup key={group} group={group} fields={list} edits={edits} onEdits={setEdits} />
        ))}
      </section>

      <label className="flex flex-col gap-1">
        <span className="font-semibold">Комментарий</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          placeholder="Необязательно: что не так или почему"
          data-testid="review-comment"
          className="min-h-20 w-full rounded-control border border-line bg-page p-3 text-ink"
        />
      </label>

      {message && (
        <p className="text-danger" role="alert">
          {message}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="success" block disabled={busy || fixCount > 0} onClick={() => void save("ok")} data-testid="review-ok">
          <Check className="size-icon" aria-hidden />
          Всё верно
        </Button>
        <Button block disabled={busy || (fixCount === 0 && comment.trim() === "")} onClick={() => void save("fix")} data-testid="review-fix">
          {fixCount > 0 ? `Отправить исправления (${fixCount})` : "Отправить замечание"}
        </Button>
        {fixCount > 0 && <p className="text-sm text-ink-soft">Есть исправления, поэтому «Всё верно» недоступно.</p>}
        {mine && (
          <Button variant="ghost" block disabled={busy} onClick={() => void withdraw()} data-testid="review-withdraw">
            Отозвать мой отзыв
          </Button>
        )}
      </div>

      {data.reviews.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="review-history">
          <h2 className="text-lg font-bold">Отзывы</h2>
          {data.reviews.map((r) => (
            <ReviewCard key={r.reviewer} review={r} fields={fields} />
          ))}
          <Button variant="ghost" onClick={reload}>
            Обновить
          </Button>
        </section>
      )}
    </div>
  );
}

/** Группа полей. Длинные группы (формы глагола по временам) свёрнуты, пока в них нет исправлений. */
function FieldGroup({
  group,
  fields,
  edits,
  onEdits,
}: {
  group: string;
  fields: ReviewField[];
  edits: Record<string, string>;
  onEdits: (next: Record<string, string>) => void;
}) {
  const rows = (
    <div className="divide-y divide-line">
      {fields.map((f) => (
        <FieldRow
          key={f.path}
          field={f}
          edit={edits[f.path]}
          onEdit={(value) => {
            const next = { ...edits };
            if (value === undefined) delete next[f.path];
            else next[f.path] = value;
            onEdits(next);
          }}
        />
      ))}
    </div>
  );
  if (fields.length <= 8) {
    return (
      <Card className="py-1" data-testid={`review-group-${group}`}>
        <div className="pt-2 text-sm font-semibold text-ink-soft">{group}</div>
        {rows}
      </Card>
    );
  }
  const edited = fields.some((f) => f.path in edits);
  return (
    <Card className="py-1" data-testid={`review-group-${group}`}>
      <details open={edited}>
        <summary className="cursor-pointer py-2 font-semibold">
          {group} <span className="text-sm font-normal text-ink-soft">(полей: {fields.length})</span>
        </summary>
        {rows}
      </details>
    </Card>
  );
}

function FieldRow({ field, edit, onEdit }: { field: ReviewField; edit: string | undefined; onEdit: (value: string | undefined) => void }) {
  const editing = edit !== undefined;
  const he = field.kind === "he";
  const changed = editing && edit.trim() !== "" && edit.trim() !== field.value;
  return (
    <div className="flex flex-col gap-2 py-2" data-testid={`review-field-${field.path}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-soft">{field.label}</div>
          <div
            dir={he ? "rtl" : undefined}
            lang={he ? "he" : undefined}
            className={`${he ? "text-right font-hebrew text-xl" : ""} ${changed ? "text-ink-soft line-through" : ""} break-words`}
          >
            {reviewValueTitle(field, field.value)}
          </div>
        </div>
        <button
          type="button"
          className="min-h-10 shrink-0 rounded-control px-3 text-sm font-semibold text-accent active:bg-page"
          onClick={() => onEdit(editing ? undefined : field.value)}
          data-testid={`review-edit-${field.path}`}
        >
          {editing ? "Отменить" : "Исправить"}
        </button>
      </div>
      {editing &&
        (field.kind === "gender" ? (
          <Choice
            label="Верный род"
            options={[
              { value: "m", title: "Мужской" },
              { value: "f", title: "Женский" },
            ]}
            value={edit}
            testId={`review-input-${field.path}`}
            onChange={(v) => onEdit(v)}
          />
        ) : (
          <input
            type="text"
            value={edit}
            onChange={(e) => onEdit(e.target.value)}
            maxLength={200}
            dir={he ? "rtl" : "auto"}
            lang={he ? "he" : undefined}
            aria-label={`Верное значение: ${field.label}`}
            data-testid={`review-input-${field.path}`}
            className={`min-h-12 w-full rounded-control border px-3 text-ink ${changed ? "border-accent bg-accent-soft" : "border-line bg-page"} ${
              he ? "font-hebrew text-xl" : ""
            }`}
          />
        ))}
    </div>
  );
}

function ReviewCard({ review, fields }: { review: ReviewEntry; fields: ReviewField[] }) {
  const who = review.mine ? "Вы" : (review.reviewerName ?? `id ${review.reviewer}`);
  return (
    <Card className={`flex flex-col gap-1 ${review.current ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{who}</span>
        <Chip tone={review.verdict === "ok" ? "success" : "danger"}>{review.verdict === "ok" ? "Верно" : "Замечания"}</Chip>
        <span className="text-sm text-ink-soft">{dateTimeText(review.at)}</span>
      </div>
      {!review.current && <p className="text-sm text-ink-soft">Слово с тех пор изменили (правки перенесены или урок обновлён).</p>}
      {Object.entries(review.fixes).length > 0 && (
        <ul className="flex flex-col gap-0.5 text-sm">
          {Object.entries(review.fixes).map(([path, value]) => (
            <li key={path} className="break-words">
              {fixText(fields, path, value)}
            </li>
          ))}
        </ul>
      )}
      {review.comment && <p className="whitespace-pre-wrap text-sm">«{review.comment}»</p>}
    </Card>
  );
}
