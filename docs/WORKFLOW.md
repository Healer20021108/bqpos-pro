# Claude Code 與 Codex 銜接工作流

## 1. 單一需求來源

本專案以 `PROJECT_SPEC.md` 作為唯一需求來源。

- Claude Code 讀 `CLAUDE.md`，但 `CLAUDE.md` 必須指向 `PROJECT_SPEC.md`。
- Codex 讀 `AGENTS.md`，但 `AGENTS.md` 必須指向 `PROJECT_SPEC.md`。
- 不要在兩份 agent 檔案各自維護不同規格。

## 2. 建議資料夾結構

```text
pos-cash-calculator/
  PROJECT_SPEC.md
  CLAUDE.md
  AGENTS.md
  AGENT.md
  README.md
  docs/
    WORKFLOW.md
  scripts/
    sync-agent-docs.mjs
  src/
  tests/
```

## 3. 最簡單銜接方式

每次交給 Claude Code 或 Codex 的提示詞都加上：

```text
請先閱讀 PROJECT_SPEC.md，並遵守 CLAUDE.md / AGENTS.md。
不要擴大需求範圍。修改前先檢查目前架構，修改後回報改了哪些檔案與驗證結果。
```

## 4. Git 交接方式

建議使用 Git 作為 Claude Code 與 Codex 的交接機制。

流程：

```text
1. 人類修改 PROJECT_SPEC.md。
2. 執行同步腳本，更新 CLAUDE.md 與 AGENTS.md 中的規格摘要。
3. git add .
4. git commit -m "docs: update cash calculator spec"
5. 交給 Claude Code 或 Codex 執行單一任務。
6. agent 修改完成後，跑測試。
7. git diff 檢查。
8. git commit。
9. 下一個 agent 從最新 commit 繼續。
```

## 5. 不建議的做法

不要讓 Claude Code 改一份規格，Codex 改另一份規格。

錯誤方式：

```text
CLAUDE.md 寫一套規則
AGENTS.md 寫另一套規則
README.md 又寫第三套規則
```

正確方式：

```text
PROJECT_SPEC.md 是唯一規格
CLAUDE.md 與 AGENTS.md 只放 agent 操作規則與指向 PROJECT_SPEC.md
```

## 6. 自動同步策略

若你希望「改一份，自動更新」，建議使用 `scripts/sync-agent-docs.mjs`。

它的用途不是把整份規格複製到所有檔案，而是把 `PROJECT_SPEC.md` 的版本摘要同步到 `CLAUDE.md` 與 `AGENTS.md`，提醒 agent 以同一份規格為準。

執行：

```bash
node scripts/sync-agent-docs.mjs
```

也可以加到 package.json：

```json
{
  "scripts": {
    "sync:agents": "node scripts/sync-agent-docs.mjs"
  }
}
```
