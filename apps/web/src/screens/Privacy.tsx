import { PRIVACY_UPDATED, privacySections } from "@milav/shared";
import { Header } from "../components/Header";
import { Card } from "../components/ui";
import { useBackButton } from "../lib/useBackButton";

/** Политика конфиденциальности: тот же текст, что на странице milav.app/privacy (packages/shared/src/privacy.ts). */
export function Privacy({ onBack }: { onBack: () => void }) {
  useBackButton(onBack);
  return (
    <>
      <Header title="Политика конфиденциальности" onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section" data-testid="privacy">
        <p className="text-sm text-ink-soft">Обновлено {PRIVACY_UPDATED}</p>
        {privacySections().map((s) => (
          <Card key={s.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{s.title}</h2>
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.items && (
              <ul className="flex list-disc flex-col gap-2 pl-5">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </main>
    </>
  );
}
