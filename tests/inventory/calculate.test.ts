import { describe, expect, test } from 'vitest';
import {
  computeInventory,
  normalizeCount,
  normalizeGrams,
  rocDateLabel,
  toExcelCells,
  type InventoryResult,
  type ItemResult,
} from '../../src/modules/inventory/calculate';

function byCode(result: InventoryResult, code: string): ItemResult {
  const row = result.items.find((r) => r.item.code === code);
  if (!row) throw new Error(`找不到品項 ${code}`);
  return row;
}

describe('輸入正規化', () => {
  test.each([
    ['', 0],
    [null, 0],
    [undefined, 0],
    [-1, 0],
    [1.5, 0],
    ['abc', 0],
    ['12', 12],
    [8, 8],
  ])('count 正規化 %p → %d', (input, expected) => {
    expect(normalizeCount(input)).toBe(expected);
  });

  test('grams 允許小數但擋負數與非數字', () => {
    expect(normalizeGrams('1441')).toBe(1441);
    expect(normalizeGrams('636.5')).toBe(636.5);
    expect(normalizeGrams(-3)).toBe(0);
    expect(normalizeGrams('abc')).toBe(0);
    expect(normalizeGrams('')).toBe(0);
  });
});

describe('計數品項（G=1）', () => {
  test('A：整包×200 + 小捆×25 + 個', () => {
    const a = byCode(computeInventory({ 'A:pack': '2', 'A:bundle': '4', 'A:piece': '20' }), 'A');
    expect(a.smallestTotal).toBe(520);
    expect(a.displayQty).toBe(520);
    expect(a.excelH).toBe(520);
    expect(a.hasInput).toBe(true);
    expect(a.pendingTare).toBe(false);
  });

  test('C：8 整包 + 2 小捆 + 20 個 = 870', () => {
    expect(byCode(computeInventory({ 'C:pack': '8', 'C:bundle': '2', 'C:piece': '20' }), 'C').excelH).toBe(870);
  });

  test('P：箱×(8包×25個) + 包×25 + 個 = 228', () => {
    expect(
      byCode(computeInventory({ 'P:box': '1', 'P:pack': '1', 'P:piece': '3' }), 'P').excelH,
    ).toBe(228);
  });
});

describe('換算品項（G≠1）', () => {
  test.each([
    ['B', { 'B:pack': '1', 'B:bundle': '1', 'B:piece': '1' }, 126],
    ['H', { 'H:bottle': '1', 'H:openGram': '336' }, 1600],
    ['J', { 'J:pack': '1', 'J:openGram': '336' }, 1200],
    ['L', { 'L:pack': '2', 'L:piece': '3' }, 51],
    ['M', { 'M:pack': '1', 'M:openGram': '336' }, 654],
  ])('%s：依各自欄位換算成最小單位', (code, raw, expected) => {
    expect(byCode(computeInventory(raw), code).smallestTotal).toBe(expected);
  });

  test('F：28 個散包 → 0.7 包，H 寫成 28/40', () => {
    const f = byCode(computeInventory({ 'F:piece': '28' }), 'F');
    expect(f.smallestTotal).toBe(28);
    expect(f.displayQty).toBeCloseTo(0.7, 5);
    expect(f.excelH).toEqual({ formula: '28/40' });
  });

  test('G：開封瓶毛重 1441 克 扣皮 136 → 1305/1400', () => {
    const g = byCode(computeInventory({ 'G:openGram': '1441' }), 'G');
    expect(g.smallestTotal).toBe(1305);
    expect(g.excelH).toEqual({ formula: '1305/1400' });
    expect(g.pendingTare).toBe(false);
  });

  test('E：整數瓶且無開封時 H 寫成整數', () => {
    const e = byCode(computeInventory({ 'E:bottle': '3' }), 'E');
    expect(e.smallestTotal).toBe(2808);
    expect(e.excelH).toBe(3);
  });

  test('K：1 包 + 28 個（每個 10 克）= 880 克', () => {
    expect(byCode(computeInventory({ 'K:pack': '1', 'K:piece': '28' }), 'K').smallestTotal).toBe(880);
  });

  test('I：整包加上咖啡機剩餘克數', () => {
    const i = byCode(computeInventory({ 'I:pack': '2', 'I:machineGram': '350' }), 'I');
    expect(i.smallestTotal).toBe(2350);
    expect(i.displayQty).toBe(2.35);
    expect(i.excelH).toEqual({ formula: '2350/1000' });
  });
});

describe('容器皮重換算', () => {
  test('D：塑膠罐裝扣 81 克、塑膠分裝扣 30 克', () => {
    const d = byCode(
      computeInventory({ 'D:plasticJarGram': '1081', 'D:plasticPortionGram': '530' }),
      'D',
    );
    expect(d.smallestTotal).toBe(1500);
    expect(d.displayQty).toBe(1.5);
    expect(d.excelH).toEqual({ formula: '1500/1000' });
    expect(d.pendingTare).toBe(false);
  });

  test('N：整瓶 500 克，開封毛重扣 44 克', () => {
    const n = byCode(computeInventory({ 'N:bottle': '2', 'N:openGram': '344' }), 'N');
    expect(n.smallestTotal).toBe(1300);
    expect(n.excelH).toEqual({ formula: '1300/500' });
    expect(n.pendingTare).toBe(false);
  });

  test('O：玻璃罐裝扣 458 克、塑膠罐裝扣 40 克', () => {
    const o = byCode(
      computeInventory({ 'O:glassJarGram': '1458', 'O:plasticJarGram': '540' }),
      'O',
    );
    expect(o.smallestTotal).toBe(1500);
    expect(o.displayQty).toBe(1.5);
    expect(o.excelH).toEqual({ formula: '1500/1000' });
    expect(o.pendingTare).toBe(false);
  });
});

describe('空白與 Excel 對應', () => {
  test('沒填的品項 hasInput 為 false、excelH 為 null', () => {
    const row = byCode(computeInventory({}), 'A');
    expect(row.hasInput).toBe(false);
    expect(row.excelH).toBeNull();
  });

  test('toExcelCells 只放有輸入的 H 欄，並帶當天民國日期', () => {
    const result = computeInventory({ 'A:pack': '2', 'A:bundle': '4', 'A:piece': '20' });
    const cells = toExcelCells(result, new Date(2026, 6, 2));
    expect(cells.H4).toBe(520);
    expect(cells.H6).toBeUndefined();
    expect(cells.J2).toBe('日期:115.07.02');
  });

  test('rocDateLabel 轉民國年月日', () => {
    expect(rocDateLabel(new Date(2026, 6, 2))).toBe('日期:115.07.02');
    expect(rocDateLabel(new Date(2026, 5, 30))).toBe('日期:115.06.30');
  });
});
