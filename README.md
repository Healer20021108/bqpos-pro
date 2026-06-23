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

### 指令

```bash
npm install      # 安裝相依（第一次）
npm run dev      # 開發伺服器（會自動處理 TypeScript，並解決 file:// 打不開的問題）
npm run build    # 產生靜態檔到 dist/（部署用）
npm run preview  # 本機預覽 build 後的結果
npm test         # 跑核心演算法測試（vitest）
```

開發時執行 `npm run dev`，用瀏覽器開啟它顯示的網址（預設 http://localhost:5173 ）。

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

平日、假日、完整整理、預備金不足、好換模式進位，以及「外部換錢不可等於 POS 缺口＋預備金缺口」的計算順序驗證。

## 核心原則

```text
POS 機採軟規則，只維持找錢安全；預備金採硬規則，POS 補完後必須回到固定標準；外部換錢只補最終真正不足的部分。
```
