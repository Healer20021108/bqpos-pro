// 瀏覽器端「當日記憶」：資料只在同一裝置／瀏覽器／網址下保存，跨本機日期即失效。

interface DailyEnvelope<T> {
  day: string;
  value: T;
}

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function saveDailyMemory<T>(key: string, value: T): void {
  try {
    const envelope: DailyEnvelope<T> = { day: localDayKey(), value };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* localStorage 不可用時略過，不影響主要功能 */
  }
}

export function loadDailyMemory<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyEnvelope<T>>;
    if (parsed?.day === localDayKey() && 'value' in parsed) return parsed.value as T;
    localStorage.removeItem(key);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 略過 */
    }
  }
  return null;
}

export function clearDailyMemory(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 略過 */
  }
}

/** 網頁跨午夜仍保持開啟時，也會立即執行每日清除。 */
export function scheduleDailyReset(reset: () => void): () => void {
  let timer = 0;

  const schedule = (): void => {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 50);
    timer = window.setTimeout(() => {
      reset();
      schedule();
    }, nextDay.getTime() - now.getTime());
  };

  schedule();
  return () => window.clearTimeout(timer);
}
