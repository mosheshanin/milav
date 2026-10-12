import { useEffect, useState } from "react";
import { getTelegram } from "./telegram";

type ApiState = "loading" | "ok" | "error";

export function App() {
  const [api, setApi] = useState<ApiState>("loading");
  const user = getTelegram()?.initDataUnsafe.user;

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? setApi("ok") : setApi("error")))
      .catch(() => setApi("error"));
  }, []);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-section p-block text-center">
      <img src="/logo.png" alt="Milav" className="h-16" />
      <h1 className="text-2xl font-bold">
        {user ? `Привет, ${user.first_name}!` : "Привет!"}
      </h1>
      <p className="text-ink-soft">Учим иврит: слушай, говори, пиши, печатай.</p>
      <p
        className={
          api === "ok"
            ? "rounded-control bg-success-soft px-block py-2 text-sm text-success"
            : "rounded-control bg-line px-block py-2 text-sm text-ink-soft"
        }
      >
        {api === "loading" && "Проверяем связь с сервером…"}
        {api === "ok" && "Сервер на связи"}
        {api === "error" && "Сервер недоступен"}
      </p>
    </main>
  );
}
