// 用 Google Cloud Vision API（DOCUMENT_TEXT_DETECTION）辨識對帳表單照片，
// 自動比對欄位標籤、擷取數值，並提供「人工複核後才套用」的安全機制。
// 邏輯逐項移植自原始 ocrFill.js（reference/dual-pos-original）。
//
// 設計重點：
// 1. 解析完全不依賴特定欄位名稱 —— 把一列文字切成 [標籤][數字]…再比對字典。
// 2. 支援一次多張照片並自動合併；同欄位不同數值會列成「衝突」讓人決定。
// 3. 字典外的標籤不丟棄，放進「未對應」供日後擴充。
// 4. 辨識結果一定要按「套用」才會寫入表單。

import type { PosKind } from './types';

// ── 設定 ──────────────────────────────────────────────────────────────────
const CONFIG = {
  // 金鑰改由環境變數注入（.env 的 VITE_VISION_API_KEY），不再寫死在原始碼。
  apiKey: import.meta.env.VITE_VISION_API_KEY ?? '',
  maxImageDimension: 1600,
  lineClusterTolerance: 0.6,
  confidenceWarningThreshold: 0.85,
};

interface LabelEntry {
  key: string;
  aliases: string[];
}

// ── 欄位標籤字典 ────────────────────────────────────────────────────────────
// 排序原則：較長／較精確的別名排在較短／較籠統的前面，避免被搶先比對。
const LABEL_MAPS: Record<PosKind, LabelEntry[]> = {
  // 百貨POS —— 已用真實照片核對過。
  dept: [
    { key: 'cash_voucher', aliases: ['現金禮券'] },
    { key: 'e_cash_voucher', aliases: ['電子現金券'] },
    { key: 'cash', aliases: ['現金'] },

    { key: 'credit_card_offline', aliases: ['離線信用卡'] },
    { key: 'credit_card', aliases: ['連線信用卡', '信用卡'] },

    { key: 'product_voucher', aliases: ['商品禮券'] },
    { key: 'receivable_amount', aliases: ['應收帳款'] },
    { key: 'product_substitute_voucher', aliases: ['商代用券'] },
    { key: 'bonus_offset', aliases: ['紅利抵扣'] },
    { key: 'cash_substitute_voucher', aliases: ['現代用券'] },
    { key: 'store_own_voucher', aliases: ['專櫃自有券'] },
    { key: 'member_discount_voucher', aliases: ['會員折價券'] },
    { key: 'imall_discount', aliases: ['Imall折抵'] },
    { key: 'balance_voucher', aliases: ['餘額券'] },
    { key: 'sodexo_product', aliases: ['索迪斯商品'] },
    { key: 'sodexo_substitute', aliases: ['索迪斯代用'] },
    { key: 'sodexo_balance', aliases: ['索迪斯餘額'] },
    { key: 'citi_direct_pay', aliases: ['中信直接付'] },
    { key: 'citi_wechat', aliases: ['中信微信'] },
    { key: 'app_discount_voucher', aliases: ['APP折價券'] },
    { key: 'citi_line', aliases: ['中信LINE'] },
    { key: 'line_bonus', aliases: ['LINE紅利'] },

    { key: 'jkopay_offset', aliases: ['街口幣折抵', '街口折抵'] },
    { key: 'jkopay', aliases: ['街口支付'] },

    { key: 'uupon_discount', aliases: ['UUPON折抵'] },
    { key: 'fb_voucher', aliases: ['FB折價券'] },
    { key: 'gift_voucher_balance', aliases: ['禮物券餘額'] },
    { key: 'gift_voucher_alt', aliases: ['禮物券代用'] },
    { key: 'e_gift_voucher', aliases: ['電子禮物券'] },
    { key: 'gift_voucher', aliases: ['禮物券'] },
    { key: 'line_yikatong', aliases: ['LINE一卡通'] },
    { key: 'union_pay_cloud', aliases: ['銀聯雲閃付'] },
    { key: 'union_pay_discount', aliases: ['銀聯折抵'] },
    { key: 'pi_wallet', aliases: ['PI拍錢包', 'PI電子錢包'] },

    { key: 'linepay_electronic', aliases: ['LINE PAY(電子)', 'LINE PAY(電', 'LINEPAY(電'] },
    { key: 'linepay', aliases: ['LINEPay', 'Line Pay'] },

    { key: 'ipass_money', aliases: ['一卡通MONEY'] },
    { key: 'ipass_money_app', aliases: ['iPass Money'] },
    { key: 'ipass_card', aliases: ['一卡通'] },

    { key: 'gmpay_union', aliases: ['GMPay(聯信)'] },
    { key: 'gmpay_citi', aliases: ['GMPAY(中信)'] },
    { key: 'gmpay', aliases: ['GMPay', 'GM Pay'] },

    { key: 'e_product_gift', aliases: ['電子商品禮'] },
    { key: 'e_product_substitute', aliases: ['電子商品代'] },
    { key: 'easycard_pay', aliases: ['悠遊付'] },
    { key: 'ue_opened', aliases: ['外送UE已開'] },

    { key: 'twpay_discount', aliases: ['台灣PAY現折'] },
    { key: 'twpay', aliases: ['台灣Pay', '台灣PAY'] },

    { key: 'easycard_card', aliases: ['悠遊卡'] },
    { key: 'takeout_self_pickup', aliases: ['外帶自取'] },
    { key: 'orange_pay', aliases: ['橘子支付'] },
    { key: 'stimulus_voucher_substitute', aliases: ['振興代用券'] },
    { key: 'stimulus_voucher', aliases: ['振興券'] },
    { key: 'sports_voucher', aliases: ['動滋券'] },
    { key: 'jingcheng_discount', aliases: ['精誠電子抵'] },
    { key: 'foodpanda_pending', aliases: ['外送熊貓未'] },
    { key: 'esun_wallet', aliases: ['玉山Wallet'] },
    { key: 'ubereats_pending', aliases: ['外送UE未開'] },
    { key: 'receivable_5_ec', aliases: ['應收五EC已'] },
    { key: 'receivable_1_live', aliases: ['應收一直播'] },
    { key: 'panda_grocery', aliases: ['熊貓雜貨外'] },
    { key: 'receivable_6', aliases: ['應收六'] },
    { key: 'takeout_pending', aliases: ['外帶未開'] },
    { key: 'local_voucher', aliases: ['地方券'] },
    { key: 'full_pay', aliases: ['全支付'] },
    { key: 'entertainment_voucher', aliases: ['娛樂券'] },
    { key: 'dining_voucher', aliases: ['餐飲券'] },
    { key: 'instant_voucher', aliases: ['即享券'] },
    { key: 'points_payment', aliases: ['點數付款'] },
    { key: 'pleasure_voucher', aliases: ['享樂券'] },
    { key: 'receivable_7', aliases: ['應收七'] },
    { key: 'fula_pay', aliases: ['fula'] },
    { key: 'icash_pay', aliases: ['iCashPay'] },
    { key: 'sui_mai_qing_song', aliases: ['隨買輕鬆取'] },
    { key: 'receivable_3', aliases: ['應收三(補登', '應收三(補登)'] },
    { key: 'full_ying_pay', aliases: ['全盈+PAY', '全盈+pay'] },
    { key: 'oupay', aliases: ['歐付寶'] },
    { key: 'simple_pay', aliases: ['簡單付'] },
  ],
  // 公司POS —— 文字取自配對規則，尚未用真實照片核對 OCR 辨識率。
  company: [
    { key: 'product_voucher', aliases: ['商品禮券'] },
    { key: 'voucher', aliases: ['禮券'] },
    { key: 'cash', aliases: ['現金'] },
    { key: 'credit', aliases: ['信用卡'] },
    { key: 'linepay', aliases: ['Line Pay'] },
    { key: 'pi_wallet', aliases: ['PI電子錢包'] },
    { key: 'easycard_pay', aliases: ['悠遊付'] },
    { key: 'px_pay', aliases: ['PX-Pay'] },
    { key: 'gmpay', aliases: ['GM Pay'] },
    { key: 'jkopay_offset', aliases: ['街口折抵'] },
    { key: 'jkopay', aliases: ['街口支付'] },
    { key: 'easycard_card', aliases: ['悠遊卡'] },
    { key: 'twpay', aliases: ['台灣Pay'] },
    { key: 'foodpanda', aliases: ['Food panda'] },
    { key: 'ubereats', aliases: ['Ubereats'] },
  ],
};

// ── 純邏輯型別 ──────────────────────────────────────────────────────────────
interface CharInfo {
  ch: string;
  cx: number;
  cy: number;
  height: number;
  confidence: number;
}
interface Chunk {
  type: 'num' | 'text';
  chars: CharInfo[];
}
interface Pair {
  labelRaw: string;
  labelNorm: string;
  value: number;
  confidence: number;
}
export interface MatchedRecord {
  value: number;
  confidence: number;
  rawText: string;
}
export interface UnmatchedItem {
  label: string;
  value: number;
  confidence: number;
  rawText: string;
  source?: number;
}
interface ParsedResult {
  matched: Record<string, MatchedRecord>;
  unmatched: UnmatchedItem[];
}
export interface MergedMatched extends MatchedRecord {
  sources: number[];
}
export interface Conflict {
  key: string;
  values: { value: number; source: number }[];
}
export interface MergedResult {
  matched: Record<string, MergedMatched>;
  unmatched: UnmatchedItem[];
  conflicts: Conflict[];
  sourceCount: number;
}

// Vision API 回傳結構（只取用到的欄位）。
interface Vertex {
  x?: number;
  y?: number;
}
interface VisionSymbol {
  text: string;
  confidence?: number;
  boundingBox?: { vertices?: Vertex[] };
}
interface VisionWord {
  symbols?: VisionSymbol[];
}
interface VisionParagraph {
  words?: VisionWord[];
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
}
interface VisionPage {
  blocks?: VisionBlock[];
}
interface FullTextAnnotation {
  pages?: VisionPage[];
}

// ── 影像前處理：縮圖 + 轉 base64 ────────────────────────────────────────────
function resizeImageToBase64(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('圖片解碼失敗'));
      img.onload = () => {
        let { width, height } = img;
        const longEdge = Math.max(width, height);
        if (longEdge > maxDim) {
          const scale = maxDim / longEdge;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('無法建立繪圖環境'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.split(',')[1]); // 去掉 "data:image/jpeg;base64," 前綴
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── 呼叫 Google Cloud Vision API ────────────────────────────────────────────
async function callVisionAPI(base64Image: string): Promise<FullTextAnnotation | null> {
  if (!CONFIG.apiKey) {
    throw new Error('尚未設定 Vision API 金鑰（請在 .env 設定 VITE_VISION_API_KEY）');
  }
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${CONFIG.apiKey}`;
  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['zh-Hant', 'en'] },
      },
    ],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vision API 連線失敗：HTTP ${res.status}`);
  const data = await res.json();
  const result = data.responses && data.responses[0];
  if (!result) throw new Error('Vision API 沒有回傳結果');
  if (result.error) throw new Error(`Vision API 錯誤：${result.error.message}`);
  return result.fullTextAnnotation || null; // 沒偵測到文字時為 null，不算錯誤
}

// ── 純邏輯區（不依賴瀏覽器，方便單元測試）───────────────────────────────────
function toHalfWidthDigit(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xfee0);
  return ch;
}

// 把 Vision 巢狀結構攤平成字元陣列，拆到「每個字」這層，避免中文切詞顆粒度不一致。
export function flattenToChars(annotation: FullTextAnnotation): CharInfo[] {
  const chars: CharInfo[] = [];
  const pages = annotation.pages || [];
  pages.forEach((page) => {
    (page.blocks || []).forEach((block) => {
      (block.paragraphs || []).forEach((paragraph) => {
        (paragraph.words || []).forEach((word) => {
          (word.symbols || []).forEach((symbol) => {
            const verts = symbol.boundingBox && symbol.boundingBox.vertices;
            if (!verts || verts.length < 4) return;
            const x0 = verts[0].x ?? 0;
            const x1 = verts[1].x ?? 0;
            const x2 = verts[2].x ?? 0;
            const x3 = verts[3].x ?? 0;
            const y0 = verts[0].y ?? 0;
            const y1 = verts[1].y ?? 0;
            const y2 = verts[2].y ?? 0;
            const y3 = verts[3].y ?? 0;
            const cx = (x0 + x1 + x2 + x3) / 4;
            const cy = (y0 + y1 + y2 + y3) / 4;
            const height = Math.abs(y3 - y0) || Math.abs(y2 - y1) || 12;
            chars.push({
              ch: toHalfWidthDigit(symbol.text),
              cx,
              cy,
              height,
              confidence: symbol.confidence != null ? symbol.confidence : 1,
            });
          });
        });
      });
    });
  });
  return chars;
}

// 依垂直座標把字元群聚成「視覺列」，正確處理兩欄式 POS 螢幕。
export function clusterIntoLines(chars: CharInfo[]): CharInfo[][] {
  if (!chars.length) return [];
  const sorted = [...chars].sort((a, b) => a.cy - b.cy);
  const heights = sorted.map((c) => c.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 12;
  const tolerance = medianHeight * CONFIG.lineClusterTolerance;

  const lines: CharInfo[][] = [];
  let current: CharInfo[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const avgY = current.reduce((s, c) => s + c.cy, 0) / current.length;
    if (Math.abs(sorted[i].cy - avgY) <= tolerance) {
      current.push(sorted[i]);
    } else {
      lines.push(current);
      current = [sorted[i]];
    }
  }
  lines.push(current);
  return lines.map((line) => line.sort((a, b) => a.cx - b.cx)); // 列內左到右
}

// 正規化字串：忽略大小寫、空白、全/半形冒號與逗號。
export function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s：:，,]/g, '').trim();
}

// 負號不算數字字元（避免「PX-Pay」被切斷）；負數在 pairChunks 另行救回。
function isNumericChar(ch: string): boolean {
  return /[0-9.,]/.test(ch);
}

export function splitLineIntoChunks(line: CharInfo[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;
  line.forEach((c) => {
    const type: Chunk['type'] = isNumericChar(c.ch) ? 'num' : 'text';
    if (current && current.type === type) {
      current.chars.push(c);
    } else {
      current = { type, chars: [c] };
      chunks.push(current);
    }
  });
  return chunks;
}

// 把 [文字, 數字, 文字, 數字…] 整理成 (標籤, 數值) 候選配對，先不查字典。
export function pairChunks(chunks: Chunk[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < chunks.length - 1; i++) {
    if (chunks[i].type === 'text' && chunks[i + 1].type === 'num') {
      let labelRaw = chunks[i].chars.map((c) => c.ch).join('').trim();
      const numChars = chunks[i + 1].chars;
      let numStr = numChars.map((c) => c.ch).join('');
      // 文字段結尾若為負號，代表它其實是數字的一部分（如「退貨金額：-776」）。
      if (labelRaw.endsWith('-')) {
        labelRaw = labelRaw.slice(0, -1).trim();
        numStr = `-${numStr}`;
      }
      const labelNorm = normalize(labelRaw);
      if (labelNorm.length < 1) continue;
      const value = Number(numStr.replace(/,/g, ''));
      if (Number.isNaN(value)) continue;
      const confidence = numChars.reduce((s, c) => s + c.confidence, 0) / numChars.length;
      pairs.push({ labelRaw, labelNorm, value, confidence });
    }
  }
  return pairs;
}

// 拿候選配對比對字典，分流到 matched / unmatched。
export function parseLines(lines: CharInfo[][], labelMap: LabelEntry[]): ParsedResult {
  const matched: Record<string, MatchedRecord> = {};
  const unmatched: UnmatchedItem[] = [];
  lines.forEach((line) => {
    const pairs = pairChunks(splitLineIntoChunks(line));
    pairs.forEach((pair) => {
      // 只用「OCR讀到的文字 包含 字典別名」這個方向比對。
      const known = labelMap.find((entry) =>
        entry.aliases.some((alias) => pair.labelNorm.includes(normalize(alias))),
      );
      const record: MatchedRecord = { value: pair.value, confidence: pair.confidence, rawText: pair.labelRaw };
      if (known) {
        if (!matched[known.key] || matched[known.key].confidence < record.confidence) {
          matched[known.key] = record;
        }
      } else {
        unmatched.push({ label: pair.labelRaw, ...record });
      }
    });
  });
  return { matched, unmatched };
}

// 合併多張照片的辨識結果，並偵測同欄位的數值衝突。
// 先把每個欄位在「各張照片」讀到的值全部收集起來，再判斷：
//   全部相同 → 互相驗證，記為 matched（sources 列出所有來源照片）。
//   有不同值 → 列為衝突，values 完整列出每張照片各自讀到的值（支援連拍 3、4 張）。
// matched 仍保留第一張的值，但 UI 會以 conflicts 把衝突欄位預設「不勾選」，避免誤套。
export function mergeParsedResults(perFileResults: ParsedResult[]): MergedResult {
  const merged: MergedResult = {
    matched: {},
    unmatched: [],
    conflicts: [],
    sourceCount: perFileResults.length,
  };
  type Reading = { value: number; source: number; confidence: number; rawText: string };
  const byKey: Record<string, Reading[]> = {};
  perFileResults.forEach(({ matched, unmatched }, i) => {
    Object.entries(matched).forEach(([key, record]) => {
      (byKey[key] ??= []).push({ value: record.value, source: i, confidence: record.confidence, rawText: record.rawText });
    });
    unmatched.forEach((u) => merged.unmatched.push({ ...u, source: i }));
  });
  Object.entries(byKey).forEach(([key, readings]) => {
    const first = readings[0];
    merged.matched[key] = {
      value: first.value,
      confidence: Math.max(...readings.map((r) => r.confidence)),
      rawText: first.rawText,
      sources: readings.map((r) => r.source),
    };
    const distinct = new Set(readings.map((r) => r.value));
    if (distinct.size > 1) {
      merged.conflicts.push({ key, values: readings.map((r) => ({ value: r.value, source: r.source })) });
    }
  });
  return merged;
}

// ── 對外主函式：辨識並解析（支援單張或多張，自動合併+衝突偵測）──────────────
export async function recognizeAndParse(
  files: File[] | File,
  pos: PosKind = 'dept',
): Promise<MergedResult> {
  const labelMap = LABEL_MAPS[pos];
  if (!labelMap) throw new Error(`未知的 pos: ${pos}`);
  const fileArray = Array.isArray(files) ? files : [files];
  const perFileResults: ParsedResult[] = [];
  for (let i = 0; i < fileArray.length; i++) {
    const base64 = await resizeImageToBase64(fileArray[i], CONFIG.maxImageDimension);
    const annotation = await callVisionAPI(base64);
    if (!annotation) {
      perFileResults.push({ matched: {}, unmatched: [] });
      continue;
    }
    perFileResults.push(parseLines(clusterIntoLines(flattenToChars(annotation)), labelMap));
  }
  return mergeParsedResults(perFileResults);
}

export const ocrConfig = CONFIG;
