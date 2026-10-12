// Минимальная замена D1 на настоящем SQLite (node:sqlite) для тестов: SQL выполняется как в D1,
// схема берётся из боевой миграции.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

type Params = (string | number | null)[];

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly params: Params = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : p)) as Params);
  }

  private isSelect(): boolean {
    return this.sql.trimStart().toUpperCase().startsWith("SELECT");
  }

  /** Синхронное выполнение, нужно для batch. */
  execute() {
    const stmt = this.db.prepare(this.sql);
    if (this.isSelect()) {
      const rows = stmt.all(...this.params) as unknown[];
      return { success: true, results: rows, meta: { changes: 0 } };
    }
    const info = stmt.run(...this.params);
    return {
      success: true,
      results: [] as unknown[],
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.params) as T[];
    return { success: true, results: rows, meta: { changes: 0 } };
  }

  async run() {
    return this.execute();
  }
}

export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync(new URL("../../../../migrations/0001_init.sql", import.meta.url), "utf8"));

  const d1 = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return d1 as unknown as D1Database;
}
