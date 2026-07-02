// 盤點品項與「盤點單位」欄位定義：這是整個模組唯一的規則來源。
// 對照 KK板橋門市盤點表範本（3月份盤點表工作表）：
//   G 欄 = 換算最小單位值、H 欄 = 手輸盤點單位、I 欄 = 單位、J 欄 = H*G、K 欄 = 最小單位。
// 前端依每個品項的 fields 開對應輸入格，程式把各格折算成「最小單位」加總，
// 再算出 H（= 最小單位總量 ÷ G）寫回範本對應列。

/** 秤重欄位的容器皮重；保留 null 型別供未來尚未量測的容器使用。 */
export type Tare = number | null;

export interface InventoryField {
  /** 同一品項內唯一鍵，供輸入與記憶用，例如 'pack'、'openGram'。 */
  key: string;
  /** 顯示用單位名，例如 整包／小捆／個／瓶／開封／分裝。 */
  label: string;
  /**
   * count：整數計數（幾整包、幾瓶、幾個），貢獻 = 值 × factor。
   * grams：秤重克數（開封瓶／分裝的毛重），貢獻 = max(0, 值 − 皮重)。
   */
  kind: 'count' | 'grams';
  /** count：一個此單位等於多少「最小單位」；grams 固定 1。 */
  factor: number;
  /** 前端欄位下方的自訂換算提示；未提供時依 factor 與最小單位自動產生。 */
  hint?: string;
  /** 僅 grams：要扣掉的皮重（克）；null = 皮重待測（暫不扣重並標記提醒）。 */
  tare?: Tare;
}

export interface InventoryItem {
  /** 代號 A–P。 */
  code: string;
  /** 商品名稱（對應範本 E 欄）。 */
  name: string;
  /** 範本商品編號（D 欄），僅供對照顯示。 */
  productCode: string;
  /** 範本資料列（H/J 寫入位置）。 */
  excelRow: number;
  /** 換算最小單位值（G 欄）。 */
  g: number;
  /** 盤點單位（I 欄，H 的單位）：瓶／包／個。 */
  displayUnit: string;
  /** 入庫最小單位（K 欄）：個／克。 */
  smallestUnit: string;
  fields: InventoryField[];
}

// 便利建構子：讓下面的清單讀起來接近使用者給的規格文字。
const count = (key: string, label: string, factor: number, hint?: string): InventoryField => ({
  key,
  label,
  kind: 'count',
  factor,
  hint,
});
const grams = (key: string, label: string, tare: Tare, hint?: string): InventoryField => ({
  key,
  label,
  kind: 'grams',
  factor: 1,
  tare,
  hint,
});

export const INVENTORY_ITEMS: readonly InventoryItem[] = [
  {
    code: 'A',
    name: 'KK付費2杯袋',
    productCode: 'C01021',
    excelRow: 4,
    g: 1,
    displayUnit: '個',
    smallestUnit: '個',
    fields: [count('pack', '整包', 200), count('bundle', '小捆', 25), count('piece', '個', 1)],
  },
  {
    code: 'B',
    name: 'KK付費6入袋',
    productCode: 'C01023',
    excelRow: 6,
    g: 1,
    displayUnit: '個',
    smallestUnit: '個',
    fields: [count('pack', '整包', 100), count('bundle', '小捆', 25), count('piece', '個', 1)],
  },
  {
    code: 'C',
    name: 'KK付費12入袋',
    productCode: 'C01024',
    excelRow: 7,
    g: 1,
    displayUnit: '個',
    smallestUnit: '個',
    fields: [count('pack', '整包', 100), count('bundle', '小捆', 25), count('piece', '個', 1)],
  },
  {
    code: 'D',
    name: '焦糖海鹽淋醬',
    productCode: 'E05093',
    excelRow: 9,
    g: 1000,
    displayUnit: '瓶',
    smallestUnit: '克',
    fields: [
      grams('plasticJarGram', '塑膠罐裝', 81),
      grams('plasticPortionGram', '塑膠分裝', 30),
    ],
  },
  {
    code: 'E',
    name: '牛奶',
    productCode: 'F01002',
    excelRow: 10,
    g: 936,
    displayUnit: '瓶',
    smallestUnit: '克',
    fields: [count('bottle', '瓶', 936, '1瓶=936ML'), grams('openGram', '開封', 64)],
  },
  {
    code: 'F',
    name: '夏威夷果茶包',
    productCode: 'F01006',
    excelRow: 11,
    g: 40,
    displayUnit: '包',
    smallestUnit: '個',
    fields: [count('pack', '包', 40), count('piece', '個', 1)],
  },
  {
    code: 'G',
    name: '冰沙綜合莓醬',
    productCode: 'F01008',
    excelRow: 12,
    g: 1400,
    displayUnit: '瓶',
    smallestUnit: '克',
    fields: [count('bottle', '瓶', 1400, '1瓶=1400ML'), grams('openGram', '開封瓶', 136)],
  },
  {
    code: 'H',
    name: '冰沙草莓醬',
    productCode: 'F01009',
    excelRow: 13,
    g: 1400,
    displayUnit: '瓶',
    smallestUnit: '克',
    fields: [count('bottle', '瓶', 1400, '1瓶=1400ML'), grams('openGram', '開封瓶', 136)],
  },
  {
    code: 'I',
    name: '義式烘焙咖啡豆',
    productCode: 'F01018',
    excelRow: 14,
    g: 1000,
    displayUnit: '包',
    smallestUnit: '克',
    fields: [
      count('pack', '包', 1000),
      grams('machineGram', '咖啡機剩餘克數', 0, '直接填咖啡機內的剩餘克數'),
    ],
  },
  {
    code: 'J',
    name: "Hershey's 可可歐蕾",
    productCode: 'F01045',
    excelRow: 15,
    g: 1000,
    displayUnit: '包',
    smallestUnit: '克',
    fields: [count('pack', '整包', 1000), grams('openGram', '分裝', 136)],
  },
  {
    code: 'K',
    name: '萊姆蜜香紅茶',
    productCode: 'F01025',
    excelRow: 16,
    g: 600,
    displayUnit: '包',
    smallestUnit: '克',
    // 備註 60個/包：1包=600克、1個=10克。
    fields: [count('pack', '包', 600), count('piece', '個', 10)],
  },
  {
    code: 'L',
    name: '藍伯爵茶包',
    productCode: 'F01032',
    excelRow: 17,
    g: 1,
    displayUnit: '個',
    smallestUnit: '個',
    fields: [count('pack', '包', 24), count('piece', '個', 1)],
  },
  {
    code: 'M',
    name: 'OREO碎(飲料用)',
    productCode: 'F02011',
    excelRow: 18,
    g: 454,
    displayUnit: '包',
    smallestUnit: '克',
    fields: [count('pack', '包', 454), grams('openGram', '分裝', 136)],
  },
  {
    code: 'N',
    name: '果糖瓶裝(日正)',
    productCode: 'F02035',
    excelRow: 19,
    g: 500,
    displayUnit: '瓶',
    smallestUnit: '克',
    fields: [count('bottle', '瓶', 500), grams('openGram', '開封', 44)],
  },
  {
    code: 'O',
    name: '焦糖果露700ML',
    productCode: 'F02043',
    excelRow: 20,
    g: 1000,
    displayUnit: '瓶',
    smallestUnit: '克',
    fields: [
      grams('glassJarGram', '玻璃罐裝', 458),
      grams('plasticJarGram', '塑膠罐裝', 40),
    ],
  },
  {
    code: 'P',
    name: '3入紙盒(美正)',
    productCode: 'G01078',
    excelRow: 21,
    g: 1,
    displayUnit: '個',
    smallestUnit: '個',
    fields: [
      count('box', '箱', 200, '1箱=8包（200個）'),
      count('pack', '包', 25),
      count('piece', '個', 1),
    ],
  },
];

/** 產生某欄位的輸入 key，例如 A 品項的 pack 欄 → "A:pack"。 */
export function fieldKey(item: InventoryItem, field: InventoryField): string {
  return `${item.code}:${field.key}`;
}
