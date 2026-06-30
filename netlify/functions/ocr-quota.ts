// 全站 OCR 額度：台北時間每日 50 次、週一到週日 240 次，不區分 IP。
// 兩個計數器由同一段 Lua 原子檢查與遞增，避免並行請求突破上限。

export const OCR_DAILY_LIMIT = 50;
export const OCR_WEEKLY_LIMIT = 240;

interface RedisEvalClient {
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
}

export interface OcrQuotaWindow {
  dayKey: string;
  weekKey: string;
  nextDayEpochSeconds: number;
  nextWeekEpochSeconds: number;
}

export interface OcrQuotaResult {
  allowed: boolean;
  reason: 'ok' | 'daily' | 'weekly';
  dailyUsed: number;
  weeklyUsed: number;
  dailyRemaining: number;
  weeklyRemaining: number;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 將傳入時間切成台北日曆日與「週一開始」的日曆週。 */
export function getOcrQuotaWindow(now = new Date()): OcrQuotaWindow {
  const taipei = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const dayStartUtc = Date.UTC(
    taipei.getUTCFullYear(),
    taipei.getUTCMonth(),
    taipei.getUTCDate(),
  );
  const weekday = taipei.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStartUtc = dayStartUtc - daysSinceMonday * DAY_MS;

  return {
    dayKey: `ocr:day:${dateText(new Date(dayStartUtc))}`,
    weekKey: `ocr:week:${dateText(new Date(weekStartUtc))}`,
    nextDayEpochSeconds: Math.floor((dayStartUtc + DAY_MS - TAIPEI_OFFSET_MS) / 1000),
    nextWeekEpochSeconds: Math.floor((weekStartUtc + 7 * DAY_MS - TAIPEI_OFFSET_MS) / 1000),
  };
}

const RESERVE_SCRIPT = `#!lua flags=allow-key-locking
local daily = tonumber(redis.call('GET', KEYS[1]) or '0')
local weekly = tonumber(redis.call('GET', KEYS[2]) or '0')
local daily_limit = tonumber(ARGV[1])
local weekly_limit = tonumber(ARGV[2])

if daily >= daily_limit then
  return {0, daily, weekly, 'daily'}
end
if weekly >= weekly_limit then
  return {0, daily, weekly, 'weekly'}
end

daily = redis.call('INCR', KEYS[1])
weekly = redis.call('INCR', KEYS[2])
if daily == 1 then redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[3])) end
if weekly == 1 then redis.call('EXPIREAT', KEYS[2], tonumber(ARGV[4])) end
return {1, daily, weekly, 'ok'}
`;

const RELEASE_SCRIPT = `#!lua flags=allow-key-locking
local daily = tonumber(redis.call('GET', KEYS[1]) or '0')
local weekly = tonumber(redis.call('GET', KEYS[2]) or '0')
if daily > 0 then redis.call('DECR', KEYS[1]) end
if weekly > 0 then redis.call('DECR', KEYS[2]) end
return 1
`;

function parseResult(raw: unknown): OcrQuotaResult {
  if (!Array.isArray(raw) || raw.length < 4) throw new Error('OCR 額度服務回應格式錯誤');
  const dailyUsed = Number(raw[1]);
  const weeklyUsed = Number(raw[2]);
  const reason = raw[3];
  if (
    !Number.isSafeInteger(dailyUsed) ||
    !Number.isSafeInteger(weeklyUsed) ||
    !['ok', 'daily', 'weekly'].includes(String(reason))
  ) {
    throw new Error('OCR 額度服務回應內容錯誤');
  }
  return {
    allowed: Number(raw[0]) === 1,
    reason: String(reason) as OcrQuotaResult['reason'],
    dailyUsed,
    weeklyUsed,
    dailyRemaining: Math.max(0, OCR_DAILY_LIMIT - dailyUsed),
    weeklyRemaining: Math.max(0, OCR_WEEKLY_LIMIT - weeklyUsed),
  };
}

export async function reserveOcrQuota(
  redis: RedisEvalClient,
  now = new Date(),
): Promise<{ quota: OcrQuotaResult; window: OcrQuotaWindow }> {
  const window = getOcrQuotaWindow(now);
  const raw = await redis.eval(
    RESERVE_SCRIPT,
    [window.dayKey, window.weekKey],
    [OCR_DAILY_LIMIT, OCR_WEEKLY_LIMIT, window.nextDayEpochSeconds, window.nextWeekEpochSeconds],
  );
  return { quota: parseResult(raw), window };
}

/** Vision 沒有成功完成時退回先前保留的日／週額度。 */
export async function releaseOcrQuota(
  redis: RedisEvalClient,
  window: OcrQuotaWindow,
): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, [window.dayKey, window.weekKey], []);
}
