# CLAUDE.md

## 專案定位

你正在開發一個「換錢決策器」：百貨收銀現場用的單頁網頁工具。
使用者輸入各面額目前總共有多少，工具直接算出各面額要去外部換多少。

完整且唯一的需求來源：

- `PROJECT_SPEC.md`

請先閱讀 `PROJECT_SPEC.md`。本檔只放 agent 操作規則，**不重複規格內容**；
若本檔與 `PROJECT_SPEC.md` 有衝突，一律以 `PROJECT_SPEC.md` 為準。

> 註：本工具已於 2026-06-24 簡化，移除了原本的 POS／預備金兩段式、平日/假日/完整整理模式、
> 精準/好換換錢模式。面額、目標持有量、計算方式等規則細節一律見 `PROJECT_SPEC.md`，
> 不要在本檔重建那些表格。

---

## 實作要求

1. 所有計算邏輯集中在可測試的純函式（`src/modules/<功能>/calculate.ts`）。
2. UI 不直接混入計算規則（`view.ts` 只負責讀輸入、呼叫純函式、渲染）。
3. 空白輸入視為 0；不允許負數與小數（視為無效）。
4. 金額使用新台幣格式。
5. 結果同時要有文字結論與表格。
6. 手機寬度優先，不可難以閱讀。
7. 新增測試時，涵蓋：輸入正規化、目標數量、低於／等於／高於目標的計算、合計。

---

## 架構

模組化：分頁殼層（`src/shell`）＋ 共用層（`src/core`）＋ 功能模組（`src/modules/<功能>`）。
新增功能＝在 `src/modules/` 新增資料夾並於 `registry.ts` 註冊，不動其他模組。細節見 `README.md`。

---

## 輸出語氣

結果文字要像現場指令，不要像工程 debug。

好的例子：

```text
100 元 要換 30 張 = NT$3,000。
```

不好的例子：

```text
diff = 30, target = 50, amount = 3000
```

---

## Claude Code 工作方式

執行任務前：

1. 先閱讀 `PROJECT_SPEC.md`。
2. 若專案已有程式碼，先理解現有架構，不要直接重寫。
3. 優先提出小步驟修改。
4. 修改後回報：
   - 改了哪些檔案
   - 實作了哪些規則
   - 是否還有未完成項目

若需求不清楚，不要自行擴大功能。以 `PROJECT_SPEC.md` 為準。

<!-- SPEC_SYNC_START -->
Spec source: PROJECT_SPEC.md
Spec SHA-256 short hash: 7e3a44140ecf
Synced at: 2026-06-23T20:18:29.104Z
Instruction: If any local instruction conflicts with PROJECT_SPEC.md, follow PROJECT_SPEC.md.
<!-- SPEC_SYNC_END -->
