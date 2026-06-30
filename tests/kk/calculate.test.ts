import { describe, expect, test } from 'vitest';
import { buildKkSettlement, type KkRowKind } from '../../src/modules/kk/calculate';

const amount = (rows: ReturnType<typeof buildKkSettlement>['rows'], kind: KkRowKind): number =>
  rows.find((row) => row.kind === kind)?.amount ?? -1;

describe('KK清帳：公司POS金額 → 單欄清帳表', () => {
  test('同名款別直接對應', () => {
    const result = buildKkSettlement({
      cash: 1000,
      credit: 2000,
      easycard_card: 300,
      foodpanda: 400,
      ubereats: 500,
    });

    expect(amount(result.rows, 'cash')).toBe(1000);
    expect(amount(result.rows, 'credit')).toBe(2000);
    expect(amount(result.rows, 'easycard')).toBe(300);
    expect(amount(result.rows, 'panda')).toBe(400);
    expect(amount(result.rows, 'uber')).toBe(500);
  });

  test('LINE Pay＋iPASS MONEY 合併加總', () => {
    const result = buildKkSettlement({ linepay: 600, ipass_card: 250 });
    expect(amount(result.rows, 'lineIpAss')).toBe(850);
  });

  test('百貨禮券合併禮券與商品禮券', () => {
    const result = buildKkSettlement({ voucher: 100, product_voucher: 350 });
    expect(amount(result.rows, 'voucher')).toBe(450);
  });

  test('街口／悠遊付等依指定公式計算', () => {
    const result = buildKkSettlement({
      cash: 1000,
      credit: 2000,
      linepay: 300,
      ipass_card: 100,
      easycard_card: 200,
      voucher: 150,
      product_voucher: 50,
      foodpanda: 400,
      ubereats: 500,
      jkopay: 600,
      easycard_pay: 700,
      gmpay: 800,
    });

    expect(result.total).toBe(6800);
    expect(result.other).toBe(2100);
    expect(amount(result.rows, 'other')).toBe(600 + 700 + 800);
  });

  test('忽略非公司POS欄位及無效金額', () => {
    const result = buildKkSettlement({ cash: 100, unknown: 999, credit: -20, linepay: Number.NaN });
    expect(result.total).toBe(100);
    expect(result.other).toBe(0);
  });

  test('空快照全部為 0', () => {
    const result = buildKkSettlement({});
    expect(result.total).toBe(0);
    expect(result.other).toBe(0);
    expect(result.rows.every((row) => row.amount === 0)).toBe(true);
  });
});
