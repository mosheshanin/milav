import { useState } from "react";
import { AppProvider } from "./AppContext";
import { Notice } from "./components/ui";
import { Home } from "./screens/Home";
import { Quiz } from "./screens/Quiz";
import { Study } from "./screens/Study";

type Screen = { name: "home" } | { name: "study"; lessonId: string } | { name: "quiz"; lessonId: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  return (
    <AppProvider
      fallback={(load) => {
        if (load.state === "loading") return <Notice title="Загрузка…" />;
        if (load.state === "no-auth") {
          return (
            <Notice title="Откройте приложение в Telegram">
              Milav работает как мини-приложение: найдите бота в Telegram и нажмите кнопку меню.
            </Notice>
          );
        }
        if (load.code === "bot_token_missing") {
          return <Notice title="Сервер ещё не настроен">Не задан токен бота. Загляните позже.</Notice>;
        }
        if (load.code === "unauthorized") {
          return <Notice title="Не удалось войти">Закройте приложение и откройте его снова из Telegram.</Notice>;
        }
        return <Notice title="Нет связи с сервером">Проверьте интернет и откройте приложение снова.</Notice>;
      }}
    >
      {screen.name === "home" && <Home onOpen={(lessonId) => setScreen({ name: "study", lessonId })} />}
      {screen.name === "study" && (
        <Study
          lessonId={screen.lessonId}
          onBack={() => setScreen({ name: "home" })}
          onQuiz={() => setScreen({ name: "quiz", lessonId: screen.lessonId })}
        />
      )}
      {screen.name === "quiz" && (
        <Quiz
          lessonId={screen.lessonId}
          onBack={() => setScreen({ name: "study", lessonId: screen.lessonId })}
          onHome={() => setScreen({ name: "home" })}
        />
      )}
    </AppProvider>
  );
}
