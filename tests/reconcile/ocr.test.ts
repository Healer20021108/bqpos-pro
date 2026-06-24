// 雙POS對帳 OCR 純解析邏輯測試（不呼叫 Vision API，不需瀏覽器）。執行：npm test
import { test, expect } from 'vitest';

import {
  normalize,
  splitLineIntoChunks,
  pairChunks,
  parseLines,
  clusterIntoLines,
  mergeParsedResults,
} from '../../src/modules/reconcile/ocr';

interface Ch {
  ch: string;
  cx: number;
  cy: number;
  height: number;
  confidence: number;
}

// 把字串攤成一列字元（cx 遞增、同一 cy）。
function mkLine(text: string, cy = 0): Ch[] {
  return [...text].map((ch, i) => ({ ch, cx: i * 10, cy, height: 12, confidence: 1 }));
}

test('normalize：去空白與全/半形冒號逗號、轉小寫', () => {
  expect(normalize('街口 折抵：')).toBe('街口折抵');
  expect(normalize('Line Pay，')).toBe('linepay');
});

test('splitLineIntoChunks + pairChunks：文字後接數字 → (標籤, 數值)，逗號千分位可解析', () => {
  const pairs = pairChunks(splitLineIntoChunks(mkLine('現金1,234')));
  expect(pairs).toHaveLength(1);
  expect(pairs[0].labelRaw).toBe('現金');
  expect(pairs[0].value).toBe(1234);
});

test('pairChunks：文字段結尾的負號歸給數字（退貨 -776）', () => {
  const pairs = pairChunks(splitLineIntoChunks(mkLine('退貨-776')));
  expect(pairs[0].labelRaw).toBe('退貨');
  expect(pairs[0].value).toBe(-776);
});

test('parseLines：命中字典進 matched，未命中進 unmatched', () => {
  const labelMap = [{ key: 'cash', aliases: ['現金'] }];
  const { matched, unmatched } = parseLines([mkLine('現金500'), mkLine('未知99')], labelMap);
  expect(matched.cash.value).toBe(500);
  expect(unmatched).toHaveLength(1);
  expect(unmatched[0].label).toBe('未知');
});

test('clusterIntoLines：依垂直座標分成不同視覺列', () => {
  const chars = [...mkLine('現金500', 10), ...mkLine('信用卡800', 100)];
  const lines = clusterIntoLines(chars);
  expect(lines).toHaveLength(2);
});

test('mergeParsedResults：同欄位同值互相驗證、不同值列為衝突', () => {
  const same = mergeParsedResults([
    { matched: { cash: { value: 100, confidence: 0.9, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 100, confidence: 0.95, rawText: '現金' } }, unmatched: [] },
  ]);
  expect(same.matched.cash.value).toBe(100);
  expect(same.matched.cash.sources).toEqual([0, 1]);
  expect(same.conflicts).toHaveLength(0);

  const clash = mergeParsedResults([
    { matched: { cash: { value: 100, confidence: 0.9, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 200, confidence: 0.9, rawText: '現金' } }, unmatched: [] },
  ]);
  expect(clash.conflicts).toHaveLength(1);
  expect(clash.conflicts[0].key).toBe('cash');
});
