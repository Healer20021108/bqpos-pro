// 百貨POS金額快照：對帳模組（reconcile）每次輸入就存一份，環球清帳模組（universal）讀取帶入。
// 純資料橋接，不含任何計算邏輯；localStorage 不可用時安靜略過，不影響任一模組運作。

import { loadDailyMemory, saveDailyMemory } from './daily-memory';

const KEY = 'posDeptSnapshotV1';

export interface DeptSnapshot {
  /** 百貨POS各欄位金額（只保留大於 0 者，key 對齊 PAYMENT_GROUPS.dept）。 */
  amounts: Record<string, number>;
  /** 存檔時間（ISO 字串），用來在環球清帳顯示「帶入於 …」。 */
  savedAt: string;
}

/** 對帳模組呼叫：寫入目前百貨POS金額快照（只留正整數金額）。 */
export function saveDeptSnapshot(amounts: Record<string, number>): void {
  try {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(amounts)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[k] = v;
    }
    saveDailyMemory(KEY, { amounts: clean, savedAt: new Date().toISOString() });
  } catch {
    /* localStorage 不可用時略過 */
  }
}

/** 環球清帳模組呼叫：讀取最後一次百貨POS金額快照；沒有則回傳空快照。 */
export function loadDeptSnapshot(): DeptSnapshot {
  try {
    const parsed = loadDailyMemory<Partial<DeptSnapshot>>(KEY);
    if (parsed) {
      if (parsed && typeof parsed === 'object' && parsed.amounts && typeof parsed.amounts === 'object') {
        return { amounts: parsed.amounts as Record<string, number>, savedAt: parsed.savedAt ?? '' };
      }
    }
  } catch {
    /* 略過損毀或不可用的儲存 */
  }
  return { amounts: {}, savedAt: '' };
}
