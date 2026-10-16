// «Проверка слов» для проверяющего (docs/ADMIN.md, этап 3): раздел «Контент» без остальной панели.
// Подгружается отдельным файлом только для команды (App.tsx, lazy). Доступ проверяет сервер (/api/review/*).
import { useState } from "react";
import { Header } from "../../components/Header";
import { useApp } from "../../AppContext";
import { useBackButton } from "../../lib/useBackButton";
import { Content } from "./Content";

export default function Review({ onBack }: { onBack: () => void }) {
  const { me } = useApp();
  const [itemId, setItemId] = useState<string | null>(null);
  const back = itemId ? () => setItemId(null) : onBack;
  useBackButton(back);
  return (
    <>
      <Header title="Проверка слов" onBack={back} />
      <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section" data-testid="review-screen">
        <Content admin={me.staff?.role === "admin"} itemId={itemId} onItem={setItemId} />
      </main>
    </>
  );
}
