# POS／預備金換錢決策器

本資料夾提供 Claude Code 與 Codex 協作開發用文件。

## 文件用途

- `PROJECT_SPEC.md`：唯一需求規格來源。
- `CLAUDE.md`：Claude Code 專用操作指引。
- `AGENTS.md`：Codex 專用操作指引。
- `AGENT.md`：相容提醒檔，正式請使用 `AGENTS.md`。
- `docs/WORKFLOW.md`：Claude Code 與 Codex 銜接流程。
- `scripts/sync-agent-docs.mjs`：同步規格版本摘要到 agent 指引檔。

## 使用方式

```bash
npm run sync:agents
```

或：

```bash
node scripts/sync-agent-docs.mjs
```

## 應用程式

手機優先的單頁網頁工具，採 **Vite + TypeScript**，純前端、不需後端／登入／資料庫。
採模組化架構：一個分頁殼層 + 多個獨立功能模組，方便持續新增功能。

**換錢模組（目前行為）**：只填「各幣值目前總共有多少」，即直接算出「各幣值要換多少」。
目標持有量＝平日建議量＋預備金硬標準（500→16、100→50、50→26、10→130、5→76、1→230，合計約 NT$16,210）；
要換的數量＝目標−目前，已達標準就不用換、超過則顯示多出。
（註：此為簡化後需求，與 `PROJECT_SPEC.md` 原本的兩段式規則不同；以實際程式與此說明為準。）

### 快速啟動（最簡單，含手機測試）

**macOS 直接雙擊專案根目錄的 `start.command`**。它會自動安裝相依（首次）、啟動開發伺服器，並在終端機印出：

- **Local**：電腦用網址（預設 http://localhost:5173 ）
- **Network**：手機用網址（手機需與電腦連同一個 Wi-Fi）
- **QR Code**：手機相機掃碼即可開啟

要停止：在該終端機視窗按 `Ctrl + C`。
（首次若被 macOS 攔「未識別的開發者」，到「系統設定 → 隱私權與安全性」按「仍要打開」，之後不再詢問。）

### 指令

```bash
npm install      # 安裝相依（第一次）
npm start        # 啟動開發伺服器（開放區網 + QR，手機可測）；= npm run dev
npm run build    # 產生靜態檔到 dist/（部署用）
npm run preview  # 本機預覽 build 後的結果
npm test         # 跑核心演算法測試（vitest）
```

不雙擊 `start.command` 也可以，直接 `npm start`，用瀏覽器開它顯示的網址即可。

### 架構

```text
index.html                       Vite 入口
src/
  main.ts                        啟動殼層
  shell/                         分頁殼層：分頁列 + hash 路由 + 掛載／卸載
  core/                          跨模組共用：型別、面額規則、金額格式
  modules/
    registry.ts                  模組註冊表（新增功能在此掛上）
    exchange/                    換錢決策模組（第一個模組）
      calculate.ts               核心演算法（純函式，可測試）
      view.ts                    UI 渲染與現場指令文字
      index.ts                   模組進入點（實作 FeatureModule 介面）
  styles/base.css                全域樣式與共用元件
tests/exchange/calculate.test.ts 核心演算法測試
```

### 新增一個功能模組

1. 在 `src/modules/<名稱>/` 建立 `index.ts`，預設匯出一個物件，實作 `FeatureModule` 介面（`id` / `title` / `mount(container)`）。
2. 在 `src/modules/registry.ts` 匯入並加進 `modules` 陣列。
3. 分頁會自動出現，且不影響其他模組。

### 部署

`npm run build` 後把 `dist/` 內容上傳到任何靜態主機（GitHub Pages／Netlify／Cloudflare Pages 等，皆自動附 HTTPS）。
`vite.config.ts` 已設 `base: './'`，子路徑部署（如 GitHub Pages 的 `/repo/`）也能正常運作。

### 測試涵蓋

輸入正規化（空白／負數／小數視為無效）、目標數量正確、低於／等於／高於目標的換錢與多出計算，以及只列出不足幣值的合計。

## 核心原則

```text
POS 機採軟規則，只維持找錢安全；預備金採硬規則，POS 補完後必須回到固定標準；外部換錢只補最終真正不足的部分。
```
