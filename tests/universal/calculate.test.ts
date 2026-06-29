import { describe, test, expect } from 'vitest';
import { buildSettlement, type SettlementRow } from '../../src/modules/universal/calculate';

const amt = (rows: SettlementRow[], label: string): number =>
  rows.find((r) => r.label === label)?.amount ?? -1;

describe('環球清帳：百貨POS金額 → 結帳單對應', () => {
  test('同名直接對應；悠遊Pay＝悠遊付、悠遊卡各自獨立', () => {
    const s = buildSettlement({ cash: 1000, easycard_pay: 300, easycard_card: 200 });
    expect(amt(s.left, '現金')).toBe(1000);
    expect(amt(s.left, '悠遊Pay')).toBe(300); // ＝ easycard_pay 悠遊付
    expect(amt(s.left, '悠遊卡')).toBe(200); // ＝ easycard_card
    expect(s.appended).toEqual([]);
  });

  test('LINE Pay ＝ LINEPay ＋ LINE PAY(電) 加總；LINE Money 留空', () => {
    const s = buildSettlement({ linepay: 500, linepay_electronic: 120 });
    expect(amt(s.left, 'LINE Pay')).toBe(620);
    expect(amt(s.left, 'LINE Money')).toBe(0);
    expect(s.appended).toEqual([]);
  });

  test('GM Pay ＝ GMPay ＋ GMPay(聯信) ＋ GMPAY(中信) 三家加總', () => {
    const s = buildSettlement({ gmpay: 100, gmpay_union: 30, gmpay_citi: 70 });
    expect(amt(s.left, 'GM Pay')).toBe(200);
    expect(s.appended).toEqual([]);
  });

  test('台灣Pay／台灣Pay折抵、銀聯支付對應', () => {
    const s = buildSettlement({ twpay: 800, twpay_discount: 50, union_pay_cloud: 400 });
    expect(amt(s.left, '台灣Pay')).toBe(800);
    expect(amt(s.left, '台灣Pay折抵')).toBe(50);
    expect(amt(s.left, '銀聯支付')).toBe(400); // ＝ 銀聯雲閃付
  });

  test('微信支付留空；中信微信(citi_wechat)被排除、不自動補列', () => {
    const s = buildSettlement({ citi_wechat: 999 });
    expect(amt(s.left, '微信支付')).toBe(0);
    expect(s.appended).toEqual([]);
    expect(s.total).toBe(0);
  });

  test('外送UE 只帶外送UE未開；外送UE已開因無對應 → 自動補列', () => {
    const s = buildSettlement({ ubereats_pending: 600, ue_opened: 250 });
    expect(amt(s.right, '外送UE')).toBe(600);
    const ue = s.appended.find((r) => r.label.includes('外送UE已開'));
    expect(ue?.amount).toBe(250);
  });

  test('無對應、有金額者依百貨POS順序補在外帶自取下方', () => {
    // foodpanda（外送熊貓未）較前、全支付較後（依 PAYMENT_GROUPS.dept 順序）
    const s = buildSettlement({ full_pay: 700, foodpanda_pending: 400 });
    expect(s.appended.map((r) => [r.label, r.amount])).toEqual([
      ['外送熊貓未', 400],
      ['全支付', 700],
    ]);
    expect(s.appended.every((r) => r.appended)).toBe(true);
  });

  test('金額為 0 的無對應欄位不補列（只補有金額者）', () => {
    const s = buildSettlement({ full_pay: 0, ue_opened: 0, foodpanda_pending: 430 });
    expect(s.appended.map((r) => r.label)).toEqual(['外送熊貓未']);
    expect(s.appended.every((r) => r.amount > 0)).toBe(true);
  });

  test('右欄有價證券對應 + 實收總計＝左＋右＋補列', () => {
    const s = buildSettlement({
      cash: 1000, // 左
      product_voucher: 300, // 右 商品禮券
      jingcheng_discount: 50, // 右 精誠商品抵用券
      foodpanda_pending: 200, // 補列
    });
    expect(amt(s.right, '商品禮券')).toBe(300);
    expect(amt(s.right, '精誠商品抵用券')).toBe(50);
    expect(s.total).toBe(1000 + 300 + 50 + 200);
  });

  test('空快照 → 全為 0、無補列、總計 0', () => {
    const s = buildSettlement({});
    expect(s.total).toBe(0);
    expect(s.appended).toEqual([]);
    expect(s.left.every((r) => r.amount === 0)).toBe(true);
    expect(s.right.every((r) => r.amount === 0)).toBe(true);
  });
});
