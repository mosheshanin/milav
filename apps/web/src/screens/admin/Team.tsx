// «Команда»: владельцы (из настроек сервера, их не изменить), администраторы и проверяющие из базы.
// Добавить человека можно по Telegram id: его видно в «Настройках» у самого человека.
import { useState } from "react";
import { STAFF_ROLES, STAFF_ROLE_TITLES, type StaffMember, type StaffRole } from "@milav/shared";
import { api } from "../../api";
import { useApp } from "../../AppContext";
import { Choice } from "../../components/Controls";
import { Button, Card, Chip } from "../../components/ui";
import { adminErrorText, dateTimeText, parseTelegramId } from "../../lib/adminText";
import { confirmAction } from "../../telegram";
import { LoadView, useLoad } from "./load";

export function Team() {
  const [value, reload] = useLoad(() => api.admin.team());
  return <LoadView value={value} reload={reload}>{(data) => <TeamView members={data.members} reload={reload} />}</LoadView>;
}

// Проверяющий первым: его добавляют чаще, и он выбран по умолчанию.
const roleOptions = [...STAFF_ROLES].reverse().map((r) => ({ value: r, title: STAFF_ROLE_TITLES[r] }));

function TeamView({ members, reload }: { members: StaffMember[]; reload: () => void }) {
  const { me } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [idText, setIdText] = useState("");
  const [role, setRole] = useState<StaffRole>("reviewer");

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      reload();
    } catch (e) {
      setMessage(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const label = (m: StaffMember) => (m.name ? `${m.name} (id ${m.userId})` : `id ${m.userId}`);

  async function setMemberRole(m: StaffMember, next: StaffRole) {
    if (next === "admin" && !(await confirmAction(`Сделать ${label(m)} администратором? Ему откроется вся панель.`))) return;
    await run(() => api.admin.setRole(m.userId, next), `${label(m)}: теперь ${STAFF_ROLE_TITLES[next].toLowerCase()}.`);
  }

  async function remove(m: StaffMember) {
    if (!(await confirmAction(`Убрать ${label(m)} из команды?`))) return;
    await run(() => api.admin.removeFromTeam(m.userId), `${label(m)} убран из команды.`);
  }

  async function add() {
    const userId = parseTelegramId(idText);
    if (!userId) {
      setMessage("Введите Telegram id цифрами: его видно у человека в «Настройках» → «Ваш Telegram id».");
      return;
    }
    if (members.some((m) => m.userId === userId && m.role === role)) {
      setMessage("Этот человек уже в команде с такой ролью.");
      return;
    }
    if (role === "admin" && !(await confirmAction(`Сделать id ${userId} администратором? Ему откроется вся панель.`))) return;
    await run(async () => {
      await api.admin.setRole(userId, role);
      setIdText("");
    }, `Добавлен id ${userId}: ${STAFF_ROLE_TITLES[role].toLowerCase()}.`);
  }

  return (
    <>
      <ul className="flex flex-col gap-2" data-testid="team-list">
        {members.map((m) => {
          const editable = !m.owner && m.userId !== me.user.id;
          return (
            <li key={m.userId}>
              <Card className="flex flex-col gap-2" data-testid={`member-${m.userId}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{m.name ?? "Ещё не открывал приложение"}</span>
                  <Chip tone={m.role === "admin" ? "accent" : "neutral"}>{STAFF_ROLE_TITLES[m.role]}</Chip>
                  {m.owner && <Chip tone="success">Владелец</Chip>}
                  {m.userId === me.user.id && <Chip>Вы</Chip>}
                </div>
                <p className="text-sm text-ink-soft">
                  id {m.userId}
                  {m.addedAt ? ` · добавлен ${dateTimeText(m.addedAt)}` : ""}
                  {m.owner ? " · задан в настройках сервера" : ""}
                </p>
                {editable && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="min-h-10"
                      disabled={busy}
                      data-testid={`member-${m.userId}-role`}
                      onClick={() => void setMemberRole(m, m.role === "admin" ? "reviewer" : "admin")}
                    >
                      {m.role === "admin" ? "Сделать проверяющим" : "Сделать администратором"}
                    </Button>
                    <Button variant="ghost" className="min-h-10 text-danger" disabled={busy} data-testid={`member-${m.userId}-remove`} onClick={() => void remove(m)}>
                      Убрать
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="flex flex-col gap-block">
        <h2 className="text-lg font-bold">Добавить в команду</h2>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Telegram id</span>
          <span className="text-sm text-ink-soft">Человек видит его в приложении: «Настройки» → «Аккаунт».</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="min-h-12 rounded-control border border-line bg-page px-3 text-ink"
            value={idText}
            onChange={(e) => setIdText(e.target.value)}
            data-testid="team-id"
          />
        </label>
        <Choice label="Роль" hint="Проверяющий (носитель языка) получит раздел «Контент», когда он появится. Администратору открыта вся панель." options={roleOptions} value={role} disabled={busy} testId="team-role" onChange={setRole} />
        <Button disabled={busy || idText.trim() === ""} onClick={() => void add()} data-testid="team-add">
          Добавить
        </Button>
      </Card>

      {message && (
        <p role="status" data-testid="team-message">
          {message}
        </p>
      )}
    </>
  );
}
