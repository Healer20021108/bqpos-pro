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

## 核心原則

```text
POS 機採軟規則，只維持找錢安全；預備金採硬規則，POS 補完後必須回到固定標準；外部換錢只補最終真正不足的部分。
```
