import { describe, expect, test } from 'vitest';
import {
  OCR_DAILY_LIMIT,
  OCR_WEEKLY_LIMIT,
  getOcrQuotaWindow,
  reserveOcrQuota,
} from '../../netlify/functions/ocr-quota';

describe('OCR 全站日／週額度', () => {
  test('以台北午夜切換日期', () => {
    const before = getOcrQuotaWindow(new Date('2026-06-28T15:59:59Z'));
    const after = getOcrQuotaWindow(new Date('2026-06-28T16:00:00Z'));
    expect(before.dayKey).toBe('ocr:day:2026-06-28');
    expect(after.dayKey).toBe('ocr:day:2026-06-29');
  });

  test('每週一台北午夜切換週額度', () => {
    const sunday = getOcrQuotaWindow(new Date('2026-06-28T15:59:59Z'));
    const monday = getOcrQuotaWindow(new Date('2026-06-28T16:00:00Z'));
    expect(sunday.weekKey).toBe('ocr:week:2026-06-22');
    expect(monday.weekKey).toBe('ocr:week:2026-06-29');
  });

  test('允許時回傳正確剩餘額度', async () => {
    const redis = { eval: async () => [1, 12, 100, 'ok'] };
    const { quota } = await reserveOcrQuota(redis, new Date('2026-06-30T00:00:00Z'));
    expect(quota).toEqual({
      allowed: true,
      reason: 'ok',
      dailyUsed: 12,
      weeklyUsed: 100,
      dailyRemaining: OCR_DAILY_LIMIT - 12,
      weeklyRemaining: OCR_WEEKLY_LIMIT - 100,
    });
  });

  test('每日或每週到頂時阻擋', async () => {
    const daily = await reserveOcrQuota(
      { eval: async () => [0, 50, 120, 'daily'] },
      new Date('2026-06-30T00:00:00Z'),
    );
    const weekly = await reserveOcrQuota(
      { eval: async () => [0, 30, 240, 'weekly'] },
      new Date('2026-06-30T00:00:00Z'),
    );
    expect(daily.quota.allowed).toBe(false);
    expect(daily.quota.dailyRemaining).toBe(0);
    expect(weekly.quota.allowed).toBe(false);
    expect(weekly.quota.weeklyRemaining).toBe(0);
  });
});
