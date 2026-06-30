// 公司 POS 金額快照：對帳模組每次輸入就存一份，供 KK 清帳唯讀帶入。
// localStorage 不可用或資料損毀時安靜退回空快照，不影響對帳計算。

import { loadDailyMemory, saveDailyMemory } from './daily-memory';

const KEY = 'posCompanySnapshotV1';

export interface CompanySnapshot {
  amounts: Record<string, number>;
  savedAt: string;
}

export function saveCompanySnapshot(amounts: Record<string, number>): void {
  try {
    const clean: Record<string, number> = {};
    for (const [key, value] of Object.entries(amounts)) {
      if (Number.isSafeInteger(value) && value > 0) clean[key] = value;
    }
    saveDailyMemory(KEY, { amounts: clean, savedAt: new Date().toISOString() });
  } catch {
    /* localStorage 不可用時略過 */
  }
}

export function loadCompanySnapshot(): CompanySnapshot {
  try {
    const parsed = loadDailyMemory<Partial<CompanySnapshot>>(KEY);
    if (parsed) {
      if (parsed && typeof parsed === 'object' && parsed.amounts && typeof parsed.amounts === 'object') {
        return {
          amounts: parsed.amounts as Record<string, number>,
          savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
        };
      }
    }
  } catch {
    /* 略過損毀或不可用的儲存 */
  }
  return { amounts: {}, savedAt: '' };
}
