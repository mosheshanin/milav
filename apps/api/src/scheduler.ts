// Таймер напоминаний: один Durable Object с будильником (alarm) раз в 10 минут вызывает runDueReminders.
//
// Почему не cron: на бесплатном тарифе расписаний 5 на весь аккаунт Cloudflare, а в аккаунте есть и другие проекты.
// Будильник Durable Object бесплатен (SQLite-хранилище, лимиты docs/DEPLOY.md), каждый setAlarm это одна запись строки.
// Заводит таймер ensure(): его вызывает Worker при включении напоминаний и когда приложение открывает владелец.
import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./env";
import { runDueReminders } from "./reminders";
import { describeError, logError, logEvent } from "./telemetry";

/** Шаг таймера. Время напоминаний кратно 5 минутам, так что опоздание не больше 10 минут. */
export const TICK_MS = 10 * 60_000;

/** Следующее срабатывание: ближайшая граница 10 минут (в 20:00, 20:10, ...), строго позже `nowMs`. */
export const nextTick = (nowMs: number) => (Math.floor(nowMs / TICK_MS) + 1) * TICK_MS;

export class ReminderScheduler extends DurableObject<Bindings> {
  /** Заводит будильник, если его нет, и запоминает адрес приложения для кнопки «Продолжить». */
  async ensure(origin: string): Promise<void> {
    if ((await this.ctx.storage.get<string>("origin")) !== origin) await this.ctx.storage.put("origin", origin);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextTick(Date.now()));
  }

  async alarm(): Promise<void> {
    try {
      const origin = (await this.ctx.storage.get<string>("origin")) ?? "";
      const summary = await runDueReminders(this.env, Date.now(), `${origin}/`);
      if (summary.due > 0) logEvent("reminder_run", { ...summary });
    } catch (err) {
      logError("reminder_run_error", describeError(err));
    } finally {
      // Следующий запуск заводится всегда, даже после ошибки: иначе напоминания остановились бы навсегда.
      await this.ctx.storage.setAlarm(nextTick(Date.now()));
    }
  }
}
