import { useCallback, useEffect, useState } from "react";
import { cleanDisplayName, type BoardRow, type LeaderboardResponse } from "@milav/shared";
import { ApiError, api } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { Button, Card, Chip } from "../components/ui";
import { saveErrorText } from "../lib/apiErrors";
import { useBackButton } from "../lib/useBackButton";

type Board = "week" | "all";
type Load = { state: "loading" } | { state: "error"; disabled: boolean } | { state: "ready"; data: LeaderboardResponse };

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «2026-10-17» → «17 октября» (без часовых поясов: дата уже по Иерусалиму). */
function dayText(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** Таблица лидеров: недели и всё время. Участие добровольное, имя берётся из Telegram. */
export function Leaderboard({ onBack }: { onBack: () => void }) {
  const { me, applyPlay } = useApp();
  const [board, setBoard] = useState<Board>("week");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useBackButton(onBack);

  const fetchBoard = useCallback(async (which: Board) => {
    try {
      setLoad({ state: "ready", data: await api.leaderboard(which) });
    } catch (e) {
      setLoad({ state: "error", disabled: e instanceof ApiError && e.code === "feature_disabled" });
    }
  }, []);

  useEffect(() => {
    setLoad({ state: "loading" });
    void fetchBoard(board);
  }, [board, fetchBoard]);

  async function setParticipation(on: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.settings({ leaderboard: on });
      applyPlay(res.play);
      await fetchBoard(board);
    } catch (e) {
      setMessage(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const data = load.state === "ready" ? load.data : null;
  const myName = cleanDisplayName(me.user.firstName);

  return (
    <>
      <Header title="Таблица лидеров" onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section" data-testid="leaderboard">
        <div className="flex gap-2" role="tablist">
          {(["week", "all"] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={board === b}
              data-testid={`board-${b}`}
              onClick={() => setBoard(b)}
              className={`min-h-10 flex-1 rounded-full px-4 font-semibold ${board === b ? "bg-accent text-white" : "bg-line text-ink-soft"}`}
            >
              {b === "week" ? "Неделя" : "Всё время"}
            </button>
          ))}
        </div>

        {load.state === "loading" && <p className="text-ink-soft">Загрузка…</p>}
        {load.state === "error" && (
          <p className="text-danger">
            {load.disabled ? "Таблица лидеров пока не открыта." : "Не удалось загрузить таблицу. Проверьте интернет и откройте экран ещё раз."}
          </p>
        )}

        {data && (
          <>
            {data.board === "week" && data.weekEndsOn && (
              <p className="text-sm text-ink-soft" data-testid="board-ends">
                Неделя заканчивается в субботу, {dayText(data.weekEndsOn)}, в 24:00 по Иерусалиму. Очки недели считаются с воскресенья.
              </p>
            )}
            {data.top.length === 0 ? (
              <Card>
                <p className="text-ink-soft" data-testid="board-empty">
                  Пока никого нет. Станьте первым: выучите слово, и очки появятся в таблице.
                </p>
              </Card>
            ) : (
              <ol className="flex flex-col gap-1" data-testid="board-top">
                {data.top.map((row) => (
                  <Row key={`${row.rank}-${row.name}-${row.points}`} row={row} />
                ))}
              </ol>
            )}

            {data.participating && data.me && !data.top.some((r) => r.me) && (
              <section className="flex flex-col gap-1" data-testid="board-me">
                <h2 className="mt-2 font-semibold text-ink-soft">Ваше место</h2>
                <ol className="flex flex-col gap-1">
                  {data.me.around.length > 0 ? (
                    data.me.around.map((row) => <Row key={`${row.rank}-${row.name}-${row.points}`} row={row} />)
                  ) : (
                    <Row row={{ rank: data.me.rank ?? 0, name: myName, points: data.me.points, me: true }} />
                  )}
                </ol>
              </section>
            )}
            {data.participating && data.me && data.me.rank === null && (
              <p className="text-sm text-ink-soft" data-testid="board-pending">
                Ваши очки ({data.me.points}) появятся в таблице при следующем обновлении.
              </p>
            )}

            <p className="text-sm text-ink-soft">
              Таблица обновляется примерно раз в {board === "week" ? "10" : "30"} минут. Участников с очками: {data.total}.
            </p>

            {!data.participating ? (
              <Card className="flex flex-col gap-3" data-testid="board-join">
                <h2 className="font-semibold">Хотите участвовать?</h2>
                <p className="text-sm text-ink-soft">
                  Другие участники увидят ваше имя из Telegram («{myName}», без фамилии и имени пользователя) и ваши очки.
                  Выйти можно в любой момент, и вы сразу исчезнете из таблицы.
                </p>
                <Button block disabled={busy} onClick={() => void setParticipation(true)} data-testid="board-join-button">
                  Участвовать
                </Button>
              </Card>
            ) : (
              <Button variant="ghost" block disabled={busy} onClick={() => void setParticipation(false)} data-testid="board-leave-button">
                Выйти из таблицы
              </Button>
            )}
            {message && <p className="text-danger">{message}</p>}
          </>
        )}
      </main>
    </>
  );
}

function Row({ row }: { row: BoardRow }) {
  return (
    <li
      data-testid={row.me ? "board-row-me" : "board-row"}
      className={`flex items-center gap-3 rounded-control px-3 py-2 ${row.me ? "bg-accent-soft font-semibold" : "bg-surface"}`}
    >
      <span className="w-8 text-right text-ink-soft">{row.rank}</span>
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
      {row.me && <Chip tone="accent">Вы</Chip>}
      <span className="font-semibold">{row.points}</span>
    </li>
  );
}
