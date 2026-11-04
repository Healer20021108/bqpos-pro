# 百貨收銀工具

百貨收銀現場用的手機網頁工具，有五個分頁：換錢、對帳、清帳、盤點。

**線上網址**：https://healer20021108.github.io/bqpos-pro/

> 需求與計算規則一律以 [`PROJECT_SPEC.md`](PROJECT_SPEC.md) 為準；本檔只說明怎麼使用與開發，不重複規則細節。

---

## 功能

| 分頁 | 用途 | 規格 |
|---|---|---|
| 換錢決策 | 輸入各面額目前數量，算出要去外部換多少（湊整千、付千元鈔） | `PROJECT_SPEC.md` 第 1–8、10 節 |
| 雙POS對帳 | 先填公司POS → 同步排出百貨POS對帳順序 → 比對差異、給調整建議 | `PROJECT_SPEC.md` 第 11 節 |
| 環球清帳 | 帶入百貨POS金額，產生環球結帳單（唯讀，照抄用） | 尚未規格化（見第 12 節） |
| KK清帳 | 帶入公司POS金額，整理成 KK 單欄清帳表 | 尚未規格化 |
| 盤點模組 | 依品項填盤點數量，匯出 Excel 盤點表 | 尚未規格化 |

## 使用須知

- **手機優先**。可用瀏覽器的「加入主畫面」，用起來像 App。
- **資料只存在自己的瀏覽器**（當日記憶），不會上傳；換日自動清空。換手機、換瀏覽器或換網址都看不到之前的資料。
- 不需要登入，也沒有後端或資料庫。

---

## 開發

技術：**Vite + TypeScript**，純前端。測試用 **vitest**。

### 快速啟動（含手機測試）

**macOS 直接雙擊專案根目錄的 `start.command`**。它會自動安裝套件（第一次）、啟動開發伺服器，並在終端機印出：

- **Local**：電腦用網址（預設 http://localhost:5173 ）
- **Network**：手機用網址（手機要跟電腦連同一個 Wi-Fi）
- **QR Code**：手機相機掃碼即可開啟

要停止：在該終端機視窗按 `Ctrl + C`。
第一次若被 macOS 攔下「未識別的開發者」，到「系統設定 → 隱私權與安全性」按「仍要打開」，之後就不會再問。

### 指令

```bash
npm install          # 安裝套件（第一次）
npm start            # 啟動開發伺服器（開放區網＋QR Code，手機可測）；同 npm run dev
npm test             # 跑全部測試
npm run build        # 型別檢查＋打包到 dist/
npm run preview      # 本機預覽打包結果
npm run sync:agents  # 改完 PROJECT_SPEC.md 後執行，同步規格雜湊到 CLAUDE.md／AGENTS.md
```

### 架構

一個分頁殼層＋共用層＋多個獨立功能模組。每個模組都拆成三個檔案：

- `calculate.ts`：只放計算，純函式，可測試
- `view.ts`：畫面與事件
- `index.ts`：模組入口

```text
index.html                 Vite 入口
src/
  main.ts                  啟動殼層
  shell/                   分頁列、hash 路由（#/exchange…）、掛載／卸載
  core/                    跨模組共用
    rules.ts               面額與目標持有量
    format.ts              新台幣格式
    types.ts               共用型別（FeatureModule 介面）
    daily-memory.ts        當日記憶（localStorage，跨日清空）
    dept-snapshot.ts       百貨POS金額快照（對帳 → 環球清帳）
    company-snapshot.ts    公司POS金額快照（對帳 → KK清帳）
    animate.ts             共用動畫
  modules/
    registry.ts            模組註冊表（分頁順序）
    exchange/              換錢決策
    reconcile/             雙POS對帳（data.ts：欄位表與款別對應）
    universal/             環球清帳
    kk/                    KK清帳
    inventory/             盤點模組（items.ts：品項；template.xlsx：Excel 範本）
  styles/base.css          全域樣式
tests/                     依模組分資料夾，對應 src/modules 與 src/core
```

### 新增一個功能模組

1. 在 `src/modules/<名稱>/` 建立 `index.ts`，預設匯出一個實作 `FeatureModule` 介面的物件（`id`／`title`／`mount(container)`）。
2. 在 `src/modules/registry.ts` 匯入並加進 `modules` 陣列。
3. 分頁會自動出現，不影響其他模組。
4. 計算邏輯放在 `calculate.ts`，並在 `tests/<名稱>/` 補測試；需求寫進 `PROJECT_SPEC.md`。

---

## 部署

使用 **GitHub Pages**，由 `.github/workflows/deploy.yml` 自動部署：

- `main` 分支一有新 commit，GitHub Actions 會自動「安裝套件 → 跑測試 → 打包 → 發布」。
- 測試或打包失敗就不會發布，線上維持上一版。
- 也可以到 GitHub 的 **Actions** 分頁手動按「Run workflow」重新部署。
- Repo 設定：Settings → Pages → Source 選「GitHub Actions」（已設定）。

`vite.config.ts` 設定了 `base: './'`，在 `/bqpos-pro/` 這種子路徑下也能正常載入；`dist/` 也可以手動上傳到任何靜態主機。

---

## 文件與 AI 協作

| 檔案 | 用途 |
|---|---|
| `PROJECT_SPEC.md` | **唯一需求來源**，其他文件與它衝突時一律以它為準 |
| `CLAUDE.md` | Claude Code 操作規則（只放規則，不重複規格） |
| `AGENTS.md` | Codex 操作規則（同上） |
| `docs/WORKFLOW.md` | Claude Code 與 Codex 的交接流程 |
| `scripts/sync-agent-docs.mjs` | 把規格的版本雜湊同步到 `CLAUDE.md`／`AGENTS.md`（`npm run sync:agents`） |
