// 雙POS對帳模組的共用型別。

/** 兩台 POS：百貨（dept）與公司（company）。 */
export type PosKind = 'dept' | 'company';

/** 單一付款方式欄位的定義（顯示用）。 */
export interface PaymentField {
  /** 欄位鍵，對齊 OCR 字典的 key，套用辨識結果時不需轉換。 */
  key: string;
  /** 畫面顯示名稱。 */
  label: string;
  /** 左側單字圖示。 */
  glyph: string;
  /**
   * 是否已納入對帳配對。false 代表公司POS還沒有對應項目，
   * UI 會收進「尚未配對」摺疊區，但欄位仍存在、仍可輸入／OCR 寫入。
   */
  active?: boolean;
}

/** POS 各欄位目前的輸入狀態：數字或空字串（空＝尚未輸入）。 */
export type FieldValue = number | '';

/** 一台 POS 的輸入狀態，key 為欄位鍵。 */
export type PosState = Record<string, FieldValue>;

/** 一台 POS 的數值快照（空字串已正規化為 0），給純計算使用。 */
export type PosNumbers = Record<string, number>;

/** 一筆調整建議。 */
export interface Adjustment {
  kind: 'transfer' | 'charge' | 'remove' | 'warn' | 'direct-add' | 'direct-remove';
  /** 來源付款方式（或提示文字，如「補結帳」）。 */
  from: string;
  /** 目標付款方式（或提示文字）。 */
  to: string;
  /** 調整金額（絕對值）。 */
  amount: number;
  /** 湊出金額用的品項組合，例如 [57, 42]。 */
  combination: number[];
  /** 此方式不走組合（如外送平台），僅標示直接增減。 */
  noFormula?: boolean;
}

/** 對帳計算的完整結果。 */
export interface ReconcileResult {
  adjustments: Adjustment[];
  /** 各 canonical 付款方式的差異（百貨 − 公司），只含非零項。 */
  differences: Record<string, number>;
  /** 百貨POS 換算到 canonical 分類後的數值。 */
  dept: Record<string, number>;
  /** 公司POS 換算到 canonical 分類後的數值。 */
  company: Record<string, number>;
}
