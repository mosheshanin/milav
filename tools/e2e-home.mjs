// Общие шаги сквозных тестов для главной.
// Разделы и темы на главной свёрнуты по умолчанию (состояние запоминается в localStorage),
// поэтому перед кликом по уроку нужно развернуть его раздел и тему.

/**
 * Ждёт главную и разворачивает всё, что скрывает урок `lessonId`: сначала раздел, потом тему.
 * Переключатели отмечены атрибутом `data-lessons` со списком id уроков внутри. Уже развёрнутое не трогается.
 */
export async function revealLesson(page, lessonId) {
  const toggle = `[data-lessons~="${lessonId}"]`;
  await page.waitForSelector(toggle);
  for (let i = 0; i < 3; i++) {
    const closed = page.locator(`${toggle}[aria-expanded="false"]`).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }
  await page.waitForSelector(`[data-testid="lesson-${lessonId}"]`);
}
