import { createHmac } from "node:crypto";

export interface TestUser {
  id: number;
  first_name: string;
  username?: string;
}

/**
 * Собирает initData по алгоритму из документации Telegram. Подпись считается через node:crypto,
 * то есть независимо от реализации в Worker (там Web Crypto).
 */
export function signInitData(
  botToken: string,
  user: TestUser,
  authDate: number = Math.floor(Date.now() / 1000),
): string {
  const params: Record<string, string> = {
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify(user),
  };
  const dataCheckString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
}
