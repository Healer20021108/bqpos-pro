// 雙POS對帳 OCR 純解析邏輯測試（不呼叫 Vision API，不需瀏覽器）。執行：npm test
import { test, expect } from 'vitest';

import {
  normalize,
  splitLineIntoChunks,
  pairChunks,
  parseLines,
  clusterIntoLines,
  mergeParsedResults,
  LABEL_MAPS,
  flattenToChars,
  estimateSkewAngle,
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

test('mergeParsedResults：3+ 張連拍衝突，完整列出每張各自讀到的值（不只兩兩比對）', () => {
  const r = mergeParsedResults([
    { matched: { cash: { value: 100, confidence: 0.9, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 200, confidence: 0.92, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 200, confidence: 0.88, rawText: '現金' } }, unmatched: [] },
  ]);
  expect(r.conflicts).toHaveLength(1); // 一個欄位、一筆衝突
  // 完整列出三張各自的讀值與來源，而不是重複的兩兩比對
  expect(r.conflicts[0].values).toEqual([
    { value: 100, source: 0 },
    { value: 200, source: 1 },
    { value: 200, source: 2 },
  ]);
  expect(r.matched.cash.sources).toEqual([0, 1, 2]); // 來源涵蓋全部三張
});

test('mergeParsedResults：3 張全部一致 → 互相驗證、無衝突', () => {
  const r = mergeParsedResults([
    { matched: { cash: { value: 500, confidence: 0.8, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 500, confidence: 0.95, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 500, confidence: 0.9, rawText: '現金' } }, unmatched: [] },
  ]);
  expect(r.conflicts).toHaveLength(0);
  expect(r.matched.cash.value).toBe(500);
  expect(r.matched.cash.confidence).toBe(0.95); // 取最高信心
  expect(r.matched.cash.sources).toEqual([0, 1, 2]);
});

test('mergeParsedResults：衝突時 matched 取「信心最高」那張的值（供自動帶入用最可信的猜測）', () => {
  const r = mergeParsedResults([
    { matched: { cash: { value: 100, confidence: 0.7, rawText: '現金' } }, unmatched: [] },
    { matched: { cash: { value: 250, confidence: 0.93, rawText: '現金' } }, unmatched: [] }, // 最高信心
    { matched: { cash: { value: 100, confidence: 0.6, rawText: '現金' } }, unmatched: [] },
  ]);
  expect(r.conflicts).toHaveLength(1); // 仍記為衝突 → UI 會標 ⚠️
  expect(r.matched.cash.value).toBe(250); // 自動帶入採用第 2 張（信心最高）
  expect(r.matched.cash.confidence).toBe(0.93);
});

test('parseLines：百貨 LinePay 連線(LINEPay)與電子(LINE PAY(電子))不會互搶，各自歸位', () => {
  // 字典順序仿真實 dept：較精確的「電子」別名排在「LINEPay」之前，靠 includes 比對。
  const labelMap = [
    { key: 'linepay_electronic', aliases: ['LINE PAY(電子)', 'LINE PAY(電', 'LINEPAY(電'] },
    { key: 'linepay', aliases: ['LINEPay', 'Line Pay'] },
  ];
  const { matched } = parseLines([mkLine('LINE PAY(電子)1200'), mkLine('LINEPay3000')], labelMap);
  expect(matched.linepay_electronic.value).toBe(1200); // 電子 → 電子
  expect(matched.linepay.value).toBe(3000); // 連線 → 連線（不會被電子搶走）
});

test('新版百貨POS螢幕：連線信用卡(中信)／(聯合)各自歸位，不互相覆蓋', () => {
  const { matched } = parseLines(
    [mkLine('連線信用卡(中信)12434'), mkLine('連線信用卡(聯合)3000')],
    LABEL_MAPS.dept,
  );
  expect(matched.credit_card_citi.value).toBe(12434);
  expect(matched.credit_card_union.value).toBe(3000);
  expect(matched.credit_card).toBeUndefined();
});

test('新版百貨POS螢幕：全形括號也能辨識，且完整標籤（電支／熊貓未開）仍對得上', () => {
  const { matched, unmatched } = parseLines(
    [
      mkLine('連線信用卡（中信）12434'),
      mkLine('LINE PAY(電支)7014'),
      mkLine('外送熊貓未開553'),
      mkLine('外送UE未開2217'),
      mkLine('GMPAY(中信)499'),
      mkLine('PI拍錢包95'),
      mkLine('Imall折抵93'),
    ],
    LABEL_MAPS.dept,
  );
  expect(unmatched).toEqual([]);
  expect(matched.credit_card_citi.value).toBe(12434);
  expect(matched.linepay_electronic.value).toBe(7014);
  expect(matched.foodpanda_pending.value).toBe(553);
  expect(matched.ubereats_pending.value).toBe(2217);
  expect(matched.gmpay_citi.value).toBe(499);
  expect(matched.pi_wallet.value).toBe(95);
  expect(matched.imall_discount.value).toBe(93);
});

// 合成「拍歪的螢幕」：每個字給 Vision 風格的四頂點，整張照片順時針歪 deg 度。
function tiltedAnnotation(rows: { text: string; y: number }[], deg: number) {
  const rad = (deg * Math.PI) / 180;
  const rot = (x: number, y: number) => ({ x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) });
  const symbols: { text: string; boundingBox: { vertices: { x: number; y: number }[] } }[] = [];
  rows.forEach(({ text, y }) => {
    // 標籤靠左、金額靠右（數字從 x=600 起），同一水平列。
    const split = text.search(/\d/);
    [...text].forEach((ch, i) => {
      const x = i < split ? 100 + i * 30 : 600 + (i - split) * 20;
      const h = 30;
      symbols.push({
        text: ch,
        boundingBox: {
          vertices: [rot(x, y), rot(x + 20, y), rot(x + 20, y + h), rot(x, y + h)],
        },
      });
    });
  });
  return { pages: [{ blocks: [{ paragraphs: [{ words: symbols.map((s) => ({ symbols: [s] })) }] }] }] };
}

test('estimateSkewAngle：沒歪或角度離譜時不轉正', () => {
  expect(estimateSkewAngle([])).toBe(0);
  expect(estimateSkewAngle([0.001, 0.002, 0.001])).toBe(0); // < 0.5°
  expect(estimateSkewAngle([1, 1, 1])).toBe(0); // 約 57°，不可信
  expect(estimateSkewAngle([0.07, 0.07, 0.5])).toBeCloseTo(0.07); // 少數雜訊字不影響中位數
});

test('拍歪的螢幕（約 6°）：金額與同列標籤轉正後仍配對，不會被分到相鄰列', () => {
  const rows = [
    { text: 'PI拍錢包95', y: 100 },
    { text: 'Imall折抵93', y: 190 },
    { text: '悠遊卡1651', y: 280 },
  ];
  const annotation = tiltedAnnotation(rows, 6) as Parameters<typeof flattenToChars>[0];
  const { matched, unmatched } = parseLines(clusterIntoLines(flattenToChars(annotation)), LABEL_MAPS.dept);
  expect(unmatched).toEqual([]);
  expect(matched.pi_wallet.value).toBe(95);
  expect(matched.imall_discount.value).toBe(93);
  expect(matched.easycard_card.value).toBe(1651);
});
