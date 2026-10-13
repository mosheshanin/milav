import { useEffect, useState } from "react";
import { getLesson } from "@milav/content";
import { AppProvider } from "./AppContext";
import { Notice } from "./components/ui";
import { HOME, RECORD, browserStorage, hasSavedScreen, restoreScreen, saveScreen, type Screen } from "./lib/screen";
import { Home } from "./screens/Home";
import { Quiz } from "./screens/Quiz";
import { RecordScreen } from "./screens/Record";
import { Study } from "./screens/Study";
import { launchTarget } from "./telegram";

/** Первый экран: сохранённое место, а при первом открытии ещё и особая цель запуска (`startapp=record`). */
function initialScreen(): Screen {
  const storage = browserStorage();
  if (!hasSavedScreen(storage) && launchTarget() === "record") return RECORD;
  return restoreScreen(storage, (id) => !!getLesson(id));
}

export function App() {
  // Место запоминается, поэтому перезагрузка или свёрнутое приложение не уводят на главную.
  const [screen, setScreen] = useState<Screen>(initialScreen);

  useEffect(() => {
    saveScreen(browserStorage(), screen);
  }, [screen]);

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
      {screen.name === "home" && (
        <Home
          onOpen={(lessonId) => setScreen({ name: "study", lessonId })}
          onOpenQuiz={(lessonId) => setScreen({ name: "quiz", lessonId })}
        />
      )}
      {screen.name === "study" && (
        <Study
          lessonId={screen.lessonId}
          onBack={() => setScreen(HOME)}
          onQuiz={() => setScreen({ name: "quiz", lessonId: screen.lessonId })}
        />
      )}
      {screen.name === "quiz" && (
        <Quiz
          lessonId={screen.lessonId}
          onBack={() => setScreen({ name: "study", lessonId: screen.lessonId })}
          onHome={() => setScreen(HOME)}
        />
      )}
      {screen.name === "record" && <RecordScreen onBack={() => setScreen(HOME)} />}
    </AppProvider>
  );
}
