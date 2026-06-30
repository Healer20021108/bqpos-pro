import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearDailyMemory,
  loadDailyMemory,
  localDayKey,
  saveDailyMemory,
} from '../../src/core/daily-memory';

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe('當日記憶', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  test('同一天可寫入並讀回', () => {
    saveDailyMemory('draft', { cash: 100 });
    expect(loadDailyMemory('draft')).toEqual({ cash: 100 });
  });

  test('跨日資料會回傳空值並從儲存中移除', () => {
    localStorage.setItem('draft', JSON.stringify({ day: '2000-01-01', value: { cash: 100 } }));
    expect(loadDailyMemory('draft')).toBeNull();
    expect(localStorage.getItem('draft')).toBeNull();
  });

  test('舊格式或損毀資料會被淘汰', () => {
    localStorage.setItem('legacy', JSON.stringify({ amounts: { cash: 100 } }));
    localStorage.setItem('broken', '{');
    expect(loadDailyMemory('legacy')).toBeNull();
    expect(loadDailyMemory('broken')).toBeNull();
    expect(localStorage.getItem('legacy')).toBeNull();
    expect(localStorage.getItem('broken')).toBeNull();
  });

  test('可手動清除，日期鍵使用本機日期', () => {
    saveDailyMemory('draft', 123);
    clearDailyMemory('draft');
    expect(loadDailyMemory('draft')).toBeNull();
    expect(localDayKey(new Date(2026, 5, 30, 23, 59))).toBe('2026-06-30');
  });
});
