/**
 * Читает тело запроса, но не больше `maxBytes`. Если тело больше, чтение прекращается сразу и возвращается null:
 * лишнее не копится в памяти, даже когда клиент не указал Content-Length и шлёт данные потоком.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Разбирает JSON из байтов. Возвращает null, если это не JSON. */
export function parseJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
