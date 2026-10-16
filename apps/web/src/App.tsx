import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { AppProvider, useApp } from "./AppContext";
import { Button, Notice } from "./components/ui";
import { getLessonMeta } from "./lib/lessons";
import { ACHIEVEMENTS, ADMIN, HOME, LEADERBOARD, RECORD, REPEAT, REVIEW, WORDS, browserStorage, hasSavedScreen, restoreScreen, saveScreen, type Screen } from "./lib/screen";
import { Achievements } from "./screens/Achievements";
import { Home } from "./screens/Home";
import { Leaderboard } from "./screens/Leaderboard";
import { FormsPractice } from "./screens/FormsPractice";
import { MyWords } from "./screens/MyWords";
import { Repeat } from "./screens/Repeat";
import { Quiz } from "./screens/Quiz";
import { Settings } from "./screens/Settings";
import { Study } from "./screens/Study";
import { launchTarget } from "./telegram";

// Панель и запись шаблонов подгружаются отдельными файлами: ученики их код не скачивают (docs/ADMIN.md).
const Admin = lazy(() => import("./screens/admin/Admin"));
const Review = lazy(() => import("./screens/admin/Review"));
const RecordScreen = lazy(() => import("./screens/Record").then((m) => ({ default: m.RecordScreen })));

/** Экран только для администраторов. Остальным (например, после снятия роли) «Нет доступа»; сервер всё равно проверяет сам. */
function AdminOnly({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const { me } = useApp();
  if (me.staff?.role !== "admin") {
    return (
      <Notice title="Нет доступа">
        <p>Этот раздел открыт только администраторам приложения.</p>
        <p className="mt-2 text-sm">
          Ваш Telegram id: <b data-testid="my-id">{me.user.id}</b>. Его можно назвать владельцу, чтобы он добавил вас в команду.
        </p>
        <Button className="mt-block" onClick={onBack}>
          На главную
        </Button>
      </Notice>
    );
  }
  return <Suspense fallback={<Notice title="Загрузка…" />}>{children}</Suspense>;
}

/** Экран для всей команды (администраторов и проверяющих): проверка слов. */
function StaffOnly({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const { me } = useApp();
  if (!me.staff) {
    return (
      <Notice title="Нет доступа">
        <p>Проверка слов открыта только команде приложения.</p>
        <Button className="mt-block" onClick={onBack}>
          На главную
        </Button>
      </Notice>
    );
  }
  return <Suspense fallback={<Notice title="Загрузка…" />}>{children}</Suspense>;
}

/** Первый экран: сохранённое место, а при первом открытии ещё и особая цель запуска (`startapp=record`). */
function initialScreen(): Screen {
  const storage = browserStorage();
  if (!hasSavedScreen(storage) && launchTarget() === "record") return RECORD;
  return restoreScreen(storage, (id) => !!getLessonMeta(id));
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
          onAchievements={() => setScreen(ACHIEVEMENTS)}
          onLeaderboard={() => setScreen(LEADERBOARD)}
          onSettings={() => setScreen({ name: "settings", from: "home" })}
          onRepeat={() => setScreen(REPEAT)}
          onWords={() => setScreen(WORDS)}
        />
      )}
      {screen.name === "repeat" && <Repeat onBack={() => setScreen(HOME)} onWords={() => setScreen(WORDS)} />}
      {screen.name === "words" && <MyWords onBack={() => setScreen(HOME)} onRepeat={() => setScreen(REPEAT)} />}
      {screen.name === "study" && (
        <Study
          lessonId={screen.lessonId}
          onBack={() => setScreen(HOME)}
          onQuiz={() => setScreen({ name: "quiz", lessonId: screen.lessonId })}
          onPractice={() => setScreen({ name: "practice", lessonId: screen.lessonId })}
        />
      )}
      {screen.name === "practice" && (
        <FormsPractice lessonId={screen.lessonId} onBack={() => setScreen({ name: "study", lessonId: screen.lessonId })} />
      )}
      {screen.name === "quiz" && (
        <Quiz
          lessonId={screen.lessonId}
          onBack={() => setScreen({ name: "study", lessonId: screen.lessonId })}
          onHome={() => setScreen(HOME)}
        />
      )}
      {screen.name === "achievements" && (
        <Achievements
          onBack={() => setScreen(HOME)}
          onLeaderboard={() => setScreen(LEADERBOARD)}
          onSettings={() => setScreen({ name: "settings", from: "achievements" })}
        />
      )}
      {screen.name === "settings" && (
        <Settings
          onBack={() => setScreen(screen.from === "achievements" ? ACHIEVEMENTS : HOME)}
          onAdmin={() => setScreen(ADMIN)}
          onReview={() => setScreen(REVIEW)}
        />
      )}
      {screen.name === "leaderboard" && <Leaderboard onBack={() => setScreen(HOME)} />}
      {screen.name === "admin" && (
        <AdminOnly onBack={() => setScreen(HOME)}>
          <Admin onBack={() => setScreen({ name: "settings", from: "home" })} onRecord={() => setScreen({ name: "record", from: "admin" })} />
        </AdminOnly>
      )}
      {screen.name === "review" && (
        <StaffOnly onBack={() => setScreen(HOME)}>
          <Review onBack={() => setScreen({ name: "settings", from: "home" })} />
        </StaffOnly>
      )}
      {screen.name === "record" && (
        <AdminOnly onBack={() => setScreen(HOME)}>
          <RecordScreen onBack={() => setScreen(screen.from === "admin" ? ADMIN : HOME)} />
        </AdminOnly>
      )}
    </AppProvider>
  );
}
