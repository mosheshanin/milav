import Ajv, { type ErrorObject } from "ajv";
import schema from "./schema.json";

/**
 * Проверка формата урока по content/schema.json (Ajv).
 * Подключается только в тестах и инструментах (tools/content-*.ts), в бандл приложения и Worker не попадает.
 */
// strictRequired выключен: условные ветки схемы (по разделам) требуют поля, описанные в общем properties.
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
const validateLesson = ajv.compile(schema as Record<string, unknown>);

function describe(e: ErrorObject): string {
  const where = e.instancePath || "(весь файл)";
  switch (e.keyword) {
    case "required":
      return `${where}: нет обязательного поля ${String(e.params.missingProperty)}`;
    case "additionalProperties":
      return `${where}: лишнее поле ${String(e.params.additionalProperty)}`;
    case "pattern":
      return `${where}: значение не подходит под формат ${String(e.params.pattern)}`;
    case "enum":
      return `${where}: допустимы только ${JSON.stringify(e.params.allowedValues)}`;
    case "const":
      return `${where}: должно быть ${JSON.stringify(e.params.allowedValue)}`;
    default:
      return `${where}: ${e.message ?? e.keyword}`;
  }
}

/** Нарушения схемы в виде читаемых строк. Пустой список значит, что файл урока в порядке. */
export function schemaProblems(data: unknown): string[] {
  if (validateLesson(data)) return [];
  return (validateLesson.errors ?? [])
    .filter((e) => e.keyword !== "if") // служебная ошибка условия: настоящая причина стоит рядом
    .map(describe);
}

export { schema };
