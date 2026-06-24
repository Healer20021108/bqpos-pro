// 雙POS對帳計算核心測試。執行：npm test
import { test, expect } from 'vitest';

import {
  toNumbers,
  findBestCombination,
  findCombination,
  deptToCanonical,
  companyToCanonical,
  syncDeptToCompany,
  calculateAdjustments,
} from '../../src/modules/reconcile/calculate';

test('toNumbers：空字串／缺值正規化為 0，數字原樣保留', () => {
  expect(toNumbers({ a: '', b: 3, c: 0 })).toEqual({ a: 0, b: 3, c: 0 });
});

test('findBestCombination：0→[]、負數→null、湊得出取最少張、湊不出→null', () => {
  expect(findBestCombination(0, [42, 47, 57])).toEqual([]);
  expect(findBestCombination(-5, [42, 47, 57])).toBeNull();
  expect(findBestCombination(99, [42, 47, 57])).toEqual([57, 42]); // 57+42，兩張最少
  expect(findBestCombination(2, [42, 47, 57])).toBeNull();
});

test('findBestCombination：非整數金額視為無解，不會擲出 RangeError', () => {
  expect(() => findBestCombination(12.5, [42, 47, 57, 1, 3, 5])).not.toThrow();
  expect(findBestCombination(12.5, [42, 47, 57, 1, 3, 5])).toBeNull();
});

test('findCombination：常用湊不出時，逐步加入可選與最後手段', () => {
  expect(findCombination(5, [42, 47, 57], [], [1, 3, 5])).toEqual([5]);
  expect(findCombination(60, [42, 47, 57], [60], [1, 3, 5])).toEqual([60]);
  expect(findCombination(0, [42], [], [])).toEqual([]);
});

test('deptToCanonical：依配對規則加總多個百貨欄位', () => {
  const d = deptToCanonical(
    toNumbers({ credit_card: 100, credit_card_offline: 30, gmpay: 5, gmpay_union: 2, gmpay_citi: 1, linepay: 8, linepay_electronic: 2 }),
  );
  expect(d['信用卡']).toBe(130); // 連線 + 離線
  expect(d['GM Pay']).toBe(8); // gmpay + 聯信 + 中信
  expect(d['Line Pay']).toBe(10); // linepay + 電子
});

test('companyToCanonical：公司欄位直接換成中文分類名', () => {
  const c = companyToCanonical(toNumbers({ cash: 50, voucher: 20, credit: 70 }));
  expect(c['現金']).toBe(50);
  expect(c['禮券類']).toBe(20); // 商品禮券(0) + 禮券(20)
  expect(c['信用卡']).toBe(70);
});

test('禮券類（方案A）：百貨商品禮券+現金禮券+精誠電子抵 ⇄ 公司商品禮券+禮券，合併成一條', () => {
  const d = deptToCanonical(toNumbers({ product_voucher: 100, cash_voucher: 30, jingcheng_discount: 20 }));
  expect(d['禮券類']).toBe(150);
  expect(d['商品禮券']).toBeUndefined(); // 不再各自獨立
  expect(d['禮券']).toBeUndefined();
  const c = companyToCanonical(toNumbers({ product_voucher: 80, voucher: 70 }));
  expect(c['禮券類']).toBe(150);
});

test('未配對項目：兩邊未配對欄位各自加總成一條比對軸', () => {
  // 百貨未配對：應收帳款 500 + 振興券 200 = 700（現金已配對，不算）
  const d = deptToCanonical(toNumbers({ cash: 10, receivable_amount: 500, stimulus_voucher: 200 }));
  expect(d['現金']).toBe(10);
  expect(d['未配對項目']).toBe(700);
  // 公司未配對：餘額券 300 + 加價購 100 = 400
  const c = companyToCanonical(toNumbers({ cash: 10, balance_voucher: 300, add_purchase: 100 }));
  expect(c['未配對項目']).toBe(400);
});

test('新配對：iPass Money／Imall折抵／iCashPay／橘子支付／即享券 兩邊對齊', () => {
  const d = deptToCanonical(
    toNumbers({ ipass_money_app: 11, imall_discount: 22, icash_pay: 33, orange_pay: 44, instant_voucher: 55 }),
  );
  expect(d['一卡通']).toBe(11);
  expect(d['環球點數折抵']).toBe(22);
  expect(d['iCash Pay']).toBe(33);
  expect(d['橘子支付']).toBe(44);
  expect(d['即享券']).toBe(55);

  const c = companyToCanonical(
    toNumbers({ ipass_card: 11, global_points_offset: 22, icash_pay: 33, orange_pay: 44, instant_voucher: 55 }),
  );
  expect(c['一卡通']).toBe(11);
  expect(c['環球點數折抵']).toBe(22);
  expect(c['iCash Pay']).toBe(33);
  expect(c['橘子支付']).toBe(44);
  expect(c['即享券']).toBe(55);

  // 配對成功 → 無差異、無調整
  const r = calculateAdjustments(
    toNumbers({ orange_pay: 44 }),
    toNumbers({ orange_pay: 44 }),
    [],
  );
  expect(r.differences).toEqual({});
});

test('新配對端到端：5 項一起對齊 → 無差異、無調整、兩邊未配對項目皆為 0（防外洩／重複計算）', () => {
  const dept = { ipass_money_app: 11, imall_discount: 22, icash_pay: 33, orange_pay: 44, instant_voucher: 55 };
  const company = { ipass_card: 11, global_points_offset: 22, icash_pay: 33, orange_pay: 44, instant_voucher: 55 };
  const r = calculateAdjustments(toNumbers(dept), toNumbers(company), []);
  expect(r.differences).toEqual({});
  expect(r.adjustments).toEqual([]);
  expect(r.dept['未配對項目']).toBe(0); // 沒漏進未配對
  expect(r.company['未配對項目']).toBe(0);
});

test('syncDeptToCompany：新配對欄位也一併帶入公司POS', () => {
  const synced = syncDeptToCompany(
    toNumbers({ ipass_money_app: 11, imall_discount: 22, icash_pay: 33, orange_pay: 44, instant_voucher: 55 }),
  );
  expect(synced.ipass_card).toBe(11);
  expect(synced.global_points_offset).toBe(22);
  expect(synced.icash_pay).toBe(33);
  expect(synced.orange_pay).toBe(44);
  expect(synced.instant_voucher).toBe(55);
});

test('syncDeptToCompany：把百貨數值依規則加總成公司各欄位', () => {
  const synced = syncDeptToCompany(toNumbers({ credit_card: 100, credit_card_offline: 30, cash: 500 }));
  expect(synced.cash).toBe(500);
  expect(synced.credit).toBe(130);
});

test('對帳：兩邊完全相符 → 沒有差異、沒有調整', () => {
  const r = calculateAdjustments(toNumbers({ cash: 100 }), toNumbers({ cash: 100 }), []);
  expect(r.differences).toEqual({});
  expect(r.adjustments).toEqual([]);
});

test('對帳：金額相等的一增一減 → 直接轉移，並附湊數組合', () => {
  // 百貨現金多 99、公司悠遊卡多 99 → 從「悠遊卡」轉到「現金」99 元。
  const r = calculateAdjustments(toNumbers({ cash: 99 }), toNumbers({ easycard_card: 99 }), []);
  expect(r.differences).toEqual({ 現金: 99, 悠遊卡: -99 });
  expect(r.adjustments).toEqual([
    { kind: 'transfer', from: '悠遊卡', to: '現金', amount: 99, combination: [57, 42] },
  ]);
});

test('對帳：只缺不補（沒有可轉出來源）→ 補結帳', () => {
  const r = calculateAdjustments(toNumbers({ cash: 84 }), toNumbers({}), []);
  expect(r.differences).toEqual({ 現金: 84 });
  expect(r.adjustments).toEqual([
    { kind: 'charge', from: '補結帳', to: '現金', amount: 84, combination: [42, 42] },
  ]);
});

test('對帳：外送平台只標直接增減，不算組合', () => {
  const r = calculateAdjustments(toNumbers({ foodpanda_pending: 500 }), toNumbers({ foodpanda: 300 }), []);
  expect(r.differences).toEqual({ 'Food panda': 200 });
  expect(r.adjustments).toEqual([
    { kind: 'direct-add', from: 'Food panda', to: 'Food panda', amount: 200, combination: [], noFormula: true },
  ]);
});

test('對帳：未配對項目走直接增減、不算組合（內容混雜無法用面額湊）', () => {
  const r = calculateAdjustments(
    toNumbers({ receivable_amount: 700 }), // 百貨未配對 700
    toNumbers({ balance_voucher: 300 }), // 公司未配對 300
    [],
  );
  expect(r.differences).toEqual({ 未配對項目: 400 });
  expect(r.adjustments).toEqual([
    { kind: 'direct-add', from: '未配對項目', to: '未配對項目', amount: 400, combination: [], noFormula: true },
  ]);
});
