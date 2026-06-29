// 雙POS對帳計算核心（純函式，無 DOM、無副作用，可單獨測試）。
// 邏輯逐項移植自原始 index.html（reference/dual-pos-original）。

import type { Adjustment, PosNumbers, ReconcileResult } from './types';
import { PAYMENT_GROUPS, METHODS, NO_FORMULA_METHODS, NORMAL_PIECES, LAST_RESORT_PIECES } from './data';

// 各 POS「真正存在的欄位 key」集合，用來把「未配對項目」的加總限制在宣告過的欄位，
// 避免外部傳進來的雜散 key（測試、整合、未預期的 OCR key）被算進未配對差異。
const DEPT_KEYS: ReadonlySet<string> = new Set(PAYMENT_GROUPS.dept.map((f) => f.key));
const COMPANY_KEYS: ReadonlySet<string> = new Set(PAYMENT_GROUPS.company.map((f) => f.key));

/**
 * 把輸入狀態（可能含空字串）正規化為純數字快照。
 * 一律夾成「非負整數」：空白/缺值→0、小數無條件捨去、負數歸 0、非數字→0。
 * 這是計算層的最後防線：不論值從手動輸入或 OCR 哪條路來，進到對帳邏輯前都保證合法，
 * 避免小數讓 findBestCombination 的 new Array(target+1) 出錯，或負數扭曲差異。
 */
export function toNumbers(state: Record<string, number | ''>): PosNumbers {
  const out: PosNumbers = {};
  for (const [k, v] of Object.entries(state)) {
    if (v === '' || v == null) {
      out[k] = 0;
      continue;
    }
    const n = Math.floor(Number(v));
    out[k] = Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return out;
}

/**
 * 用最少張數，從 amounts 裡湊出 target（完全背包 / DP）。
 * 湊不出來回傳 null；target 為 0 回傳 []。
 */
export function findBestCombination(target: number, amounts: number[]): number[] | null {
  if (target <= 0) return target === 0 ? [] : null;
  // 非整數金額無法用整數面額湊出，且會讓 new Array(target+1) 擲出 RangeError → 視為無解。
  if (!Number.isInteger(target)) return null;
  const dp = new Array<number>(target + 1).fill(Infinity);
  const parent = new Array<number>(target + 1).fill(-1);
  dp[0] = 0;
  for (let i = 1; i <= target; i++) {
    for (const amt of amounts) {
      if (amt <= i && dp[i - amt] + 1 < dp[i]) {
        dp[i] = dp[i - amt] + 1;
        parent[i] = amt;
      }
    }
  }
  if (dp[target] === Infinity) return null;
  const combo: number[] = [];
  let cur = target;
  while (cur > 0) {
    const a = parent[cur];
    combo.push(a);
    cur -= a;
  }
  return combo.sort((a, b) => b - a);
}

/**
 * 依序嘗試：常用品項 → 加可選 → 再加最後手段，回傳第一個湊得出來的組合。
 */
export function findCombination(
  target: number,
  normal: number[],
  optional: number[],
  lastResort: number[],
): number[] | null {
  if (target === 0) return [];
  if (target < 0) return null;
  let r = findBestCombination(target, normal);
  if (r) return r;
  if (optional.length) {
    r = findBestCombination(target, [...normal, ...optional]);
    if (r) return r;
  }
  return findBestCombination(target, [...normal, ...optional, ...lastResort]);
}

/**
 * 可選／自訂品項金額只接受正整數，並去重。
 * 這是 UI 之外的計算層防線，避免小數、負數、0 或重複值影響找組合。
 */
export function normalizeProductPieces(pieces: number[]): number[] {
  return Array.from(
    new Set(
      pieces
        .map((n) => Number(n))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  );
}

/**
 * 「未配對項目」金額：把一側 POS 所有「沒有對應欄位」的付款方式加總成一條比對軸。
 * 算法＝該側全部輸入總額 − 已配對各分類加總（每個欄位最多進一個分類、不重複），
 * 因此日後新增配對會自動從未配對扣掉、新增未配對欄位也會自動納入，不需手動維護清單。
 */
function sumUnpaired(
  src: PosNumbers,
  declaredKeys: ReadonlySet<string>,
  pairedBuckets: Record<string, number>,
): number {
  let total = 0;
  for (const k of declaredKeys) total += src[k] ?? 0; // 只算宣告過的欄位，忽略雜散 key
  const paired = Object.values(pairedBuckets).reduce((a, b) => a + (b || 0), 0);
  return total - paired;
}

// 依配對規則：百貨POS多個欄位加總，對應到 canonical 分類。
// 禮券家族（商品禮券＋現金禮券＋精誠電子抵）依方案A合併成單一「禮券類」比對軸。
export function deptToCanonical(dept: PosNumbers): Record<string, number> {
  const v = (k: string): number => dept[k] ?? 0;
  const out: Record<string, number> = {
    '現金': v('cash'),
    '信用卡': v('credit_card') + v('credit_card_offline'),
    '禮券類': v('product_voucher') + v('cash_voucher') + v('jingcheng_discount'),
    '街口支付': v('jkopay'),
    '街口折抵': v('jkopay_offset'),
    'PI電子錢包': v('pi_wallet'),
    'Line Pay': v('linepay') + v('linepay_electronic'),
    '悠遊付': v('easycard_pay'),
    '台灣Pay': v('twpay'),
    '悠遊卡': v('easycard_card'),
    'Food panda': v('foodpanda_pending'),
    'Ubereats': v('ubereats_pending'),
    'PX-Pay': v('full_pay'),
    'GM Pay': v('gmpay') + v('gmpay_union') + v('gmpay_citi'),
    '一卡通': v('ipass_money_app'), // iPass Money（與「一卡通」「一卡通MONEY」是畫面不同位置，僅這格配對）
    '環球點數折抵': v('imall_discount'), // Imall折抵
    'iCash Pay': v('icash_pay'), // iCashPay
    '橘子支付': v('orange_pay'),
    '即享券': v('instant_voucher'),
  };
  out['未配對項目'] = sumUnpaired(dept, DEPT_KEYS, out);
  return out;
}

// 公司POS的欄位本身就是 canonical 分類，只是把 key 換成跟 METHODS 一致的中文名稱。
// 禮券類＝公司「商品禮券＋禮券」，對應百貨的禮券家族（方案A）。
export function companyToCanonical(c: PosNumbers): Record<string, number> {
  const v = (k: string): number => c[k] ?? 0;
  const out: Record<string, number> = {
    '現金': v('cash'),
    '禮券類': v('product_voucher') + v('voucher'),
    '信用卡': v('credit'),
    'Line Pay': v('linepay'),
    'PI電子錢包': v('pi_wallet'),
    '悠遊付': v('easycard_pay'),
    'PX-Pay': v('px_pay'),
    'GM Pay': v('gmpay'),
    '街口支付': v('jkopay'),
    '悠遊卡': v('easycard_card'),
    '台灣Pay': v('twpay'),
    '街口折抵': v('jkopay_offset'),
    'Food panda': v('foodpanda'),
    'Ubereats': v('ubereats'),
    '一卡通': v('ipass_card'),
    '環球點數折抵': v('global_points_offset'),
    'iCash Pay': v('icash_pay'),
    '橘子支付': v('orange_pay'),
    '即享券': v('instant_voucher'),
  };
  out['未配對項目'] = sumUnpaired(c, COMPANY_KEYS, out);
  return out;
}

/**
 * 計算公司帳要怎麼調整，才能跟百貨POS對齊。
 * @param dept 百貨POS 數值快照
 * @param company 公司POS 數值快照
 * @param enabledOptional 目前啟用的可選品項金額（如 [60, 65]）
 */
export function calculateAdjustments(
  dept: PosNumbers,
  company: PosNumbers,
  enabledOptional: number[],
): ReconcileResult {
  const d = deptToCanonical(dept);
  const c = companyToCanonical(company);
  const normal = NORMAL_PIECES;
  const optional = normalizeProductPieces(enabledOptional);
  const lastResort = LAST_RESORT_PIECES;

  const diffs: Record<string, number> = {};
  METHODS.forEach((m) => {
    const diff = (d[m] || 0) - (c[m] || 0);
    if (diff !== 0) diffs[m] = diff;
  });

  const directAdjustments: Adjustment[] = [];
  const formulaDiffs: Record<string, number> = {};
  Object.entries(diffs).forEach(([m, val]) => {
    if (NO_FORMULA_METHODS.has(m)) {
      directAdjustments.push({
        kind: val > 0 ? 'direct-add' : 'direct-remove',
        from: m,
        to: m,
        amount: Math.abs(val),
        combination: [],
        noFormula: true,
      });
    } else {
      formulaDiffs[m] = val;
    }
  });

  const needIncrease: Record<string, number> = {};
  const needDecrease: Record<string, number> = {};
  Object.entries(formulaDiffs).forEach(([m, val]) => {
    if (val > 0) needIncrease[m] = val;
    else needDecrease[m] = Math.abs(val);
  });

  const adjustments: Adjustment[] = [];
  const procInc = new Set<string>();
  const procDec = new Set<string>();

  // 先處理「金額剛好相等」的一對一轉移。
  Object.entries(needIncrease).forEach(([toM, amt]) => {
    for (const [fromM, decAmt] of Object.entries(needDecrease)) {
      if (procDec.has(fromM) || needDecrease[fromM] === 0) continue;
      if (decAmt === amt) {
        const combo = findCombination(amt, normal, optional, lastResort);
        if (combo) {
          adjustments.push({ kind: 'transfer', from: fromM, to: toM, amount: amt, combination: combo });
          procInc.add(toM);
          procDec.add(fromM);
          needDecrease[fromM] = 0;
          break;
        }
      }
    }
  });

  // 其餘需增加的，從最接近的「需減少」來源逐步補足。
  Object.entries(needIncrease).forEach(([toM, amt]) => {
    if (procInc.has(toM)) return;
    let remaining = amt;
    while (remaining > 0) {
      let bestSrc: string | null = null;
      let best = Infinity;
      Object.entries(needDecrease).forEach(([fromM, decAmt]) => {
        if (decAmt > 0 && !procDec.has(fromM)) {
          const dist = Math.abs(decAmt - remaining);
          if (dist < best) {
            best = dist;
            bestSrc = fromM;
          }
        }
      });
      if (!bestSrc) break;
      const avail = needDecrease[bestSrc];
      const take = Math.min(avail, remaining);
      const combo = findCombination(take, normal, optional, lastResort);
      if (!combo) break;
      adjustments.push({ kind: 'transfer', from: bestSrc, to: toM, amount: take, combination: combo });
      needDecrease[bestSrc] -= take;
      if (needDecrease[bestSrc] === 0) procDec.add(bestSrc);
      remaining -= take;
    }
    if (remaining > 0) {
      const remCombo = findCombination(remaining, normal, optional, lastResort);
      if (remCombo) adjustments.push({ kind: 'charge', from: '補結帳', to: toM, amount: remaining, combination: remCombo });
      else adjustments.push({ kind: 'warn', from: '無法配對', to: toM, amount: remaining, combination: [] });
    }
    procInc.add(toM);
  });

  // 剩下還需要減少卻沒被配對掉的，列為「需轉出或刪除」。
  Object.entries(needDecrease).forEach(([m, amt]) => {
    if (amt > 0) {
      const combo = findCombination(amt, normal, optional, lastResort);
      if (combo) adjustments.push({ kind: 'remove', from: m, to: '需轉出或刪除', amount: amt, combination: combo });
      else adjustments.push({ kind: 'warn', from: m, to: '需轉出或刪除', amount: amt, combination: [] });
    }
  });

  return { adjustments: [...directAdjustments, ...adjustments], differences: diffs, dept: d, company: c };
}

/**
 * 套用 16 條配對規則，把百貨POS數值加總、產生公司POS各欄位的預期值。
 * （UI 的「同步百貨POS金額」用這個一鍵帶入公司POS。）
 */
export function syncDeptToCompany(dept: PosNumbers): PosNumbers {
  const v = (k: string): number => dept[k] ?? 0;
  const result: PosNumbers = {
    cash: v('cash'),
    voucher: v('jingcheng_discount'),
    credit: v('credit_card') + v('credit_card_offline'),
    product_voucher: v('product_voucher') + v('cash_voucher'),
    linepay: v('linepay') + v('linepay_electronic'),
    pi_wallet: v('pi_wallet'),
    easycard_pay: v('easycard_pay'),
    px_pay: v('full_pay'),
    gmpay: v('gmpay') + v('gmpay_union') + v('gmpay_citi'),
    jkopay: v('jkopay'),
    easycard_card: v('easycard_card'),
    twpay: v('twpay'),
    jkopay_offset: v('jkopay_offset'),
    foodpanda: v('foodpanda_pending'),
    ubereats: v('ubereats_pending'),
    icash_pay: v('icash_pay'),
    global_points_offset: v('imall_discount'),
    ipass_card: v('ipass_money_app'),
    orange_pay: v('orange_pay'),
    instant_voucher: v('instant_voucher'),
    // 餘額券／台灣Pay折抵／加價購：公司POS專有、無百貨對應，不帶入（維持空白）。
  };
  return result;
}
