// 雙POS對帳模組的 UI 層：讀輸入 → 呼叫純函式 → 渲染。
// 計算規則都在 calculate.ts / ocr.ts，本檔只負責畫面、事件與 localStorage。
// 結構移植自原始 index.html（reference/dual-pos-original），改為殼層可掛載／卸載的模組。

import { PAYMENT_GROUPS, METHODS, OPTIONAL_PIECES } from './data';
import {
  calculateAdjustments,
  deptToCanonical,
  companyToCanonical,
  syncDeptToCompany,
  toNumbers,
} from './calculate';
import { recognizeAndParse, ocrConfig, type MergedResult } from './ocr';
import type { Adjustment, PosKind, PosState, ReconcileResult } from './types';
import './reconcile.css';

const HISTORY_KEY = 'posHistoryManualV1';

interface HistoryEntry {
  ts: string;
  dept: Record<string, number>;
  company: Record<string, number>;
  adjustments: Adjustment[];
  differences: Record<string, number>;
}

interface State {
  tab: PosKind;
  dept: PosState;
  company: PosState;
  enabled: Record<number, boolean>;
  results: ReconcileResult | null;
  history: HistoryEntry[];
  showHistory: boolean;
}

const TEMPLATE = `
  <div class="rc">
    <div class="navbar">
      <div>
        <div class="title">雙POS對帳</div>
        <div class="sub">手動輸入 · 自動對帳</div>
      </div>
      <div class="nav-actions">
        <button class="icon-btn" data-act="clear" title="清空">⌫</button>
      </div>
    </div>

    <div class="pos-tabs">
      <button class="pos-tab" data-tab="dept" data-active="true"><span class="dot"></span>百貨POS<span data-out="deptCount"></span></button>
      <button class="pos-tab" data-tab="company" data-active="false"><span class="dot"></span>公司POS<span data-out="companyCount"></span></button>
    </div>

    <div class="ocr-section" data-out="ocrSection">
      <input type="file" accept="image/*" multiple hidden data-act="ocrFile" />
      <button class="btn btn-secondary" data-act="ocr">📷 拍照辨識帶入（可一次選多張）</button>
      <div data-out="ocrReviewArea"></div>
    </div>

    <div class="rows" data-out="inputRows"></div>

    <div class="inline-sync">
      <button class="btn btn-secondary" data-act="sync">同步百貨POS金額</button>
      <button class="btn btn-primary" data-act="compute">計算調整建議</button>
    </div>

    <div class="sec-head">
      <div class="h">即時對帳差異<span class="count">兩台POS逐項對齊</span></div>
      <div class="meta" data-out="diffMeta" hidden>差異 <b data-out="diffCount">0</b> 項</div>
    </div>
    <div data-out="diffTable"></div>
    <div data-out="resultsAnchor"></div>
    <div data-out="results"></div>
    <div data-out="history"></div>

    <div class="sec-head">
      <div class="h">產品金額設定<span class="count">用於組合差異金額</span></div>
    </div>
    <div class="card product-card">
      <div class="toggle-list" data-out="chips"></div>
    </div>
  </div>
`;

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export function renderReconcile(container: HTMLElement): () => void {
  container.innerHTML = TEMPLATE;

  const state: State = {
    tab: 'dept',
    dept: {},
    company: {},
    enabled: { 60: true, 65: false, 70: false, 75: false, 80: false, 85: false },
    results: null,
    history: loadHistory(),
    showHistory: false,
  };

  const q = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    container.querySelector<T>(sel)!;

  const els = {
    inputRows: q('[data-out="inputRows"]'),
    ocrSection: q('[data-out="ocrSection"]'),
    ocrReviewArea: q('[data-out="ocrReviewArea"]'),
    chips: q('[data-out="chips"]'),
    diffTable: q('[data-out="diffTable"]'),
    results: q('[data-out="results"]'),
    history: q('[data-out="history"]'),
    diffMeta: q('[data-out="diffMeta"]'),
    diffCount: q('[data-out="diffCount"]'),
    deptCount: q('[data-out="deptCount"]'),
    companyCount: q('[data-out="companyCount"]'),
    fileInput: q<HTMLInputElement>('[data-act="ocrFile"]'),
  };

  // ── 小工具 ────────────────────────────────────────────────────────────
  const val = (pos: PosKind, key: string): string => {
    const v = state[pos][key];
    return v == null ? '' : String(v);
  };
  const num = (v: number): string => (v ? Number(v).toLocaleString() : '—');
  const countFilled = (obj: PosState): number =>
    Object.values(obj).filter((v) => v != null && v !== '' && v !== 0).length;
  // 「有填入」＝有大於 0 的金額。空白或 0 都視為未填入，會被收進摺疊區。
  const hasInput = (pos: PosKind, key: string): boolean => {
    const v = state[pos][key];
    return typeof v === 'number' && v > 0;
  };

  function setVal(pos: PosKind, key: string, value: string): void {
    state[pos][key] = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
    renderDynamic();
  }

  // ── 動作 ──────────────────────────────────────────────────────────────
  function syncDeptToCompanyAction(): void {
    const synced = syncDeptToCompany(toNumbers(state.dept));
    // 只填入有金額的欄位，0／空白留白，避免一整排「0」。
    const next: PosState = {};
    for (const [k, v] of Object.entries(synced)) if (v !== 0) next[k] = v;
    state.company = next;
    state.tab = 'company';
    render();
  }

  function compute(): void {
    const enabled = Object.entries(state.enabled)
      .filter(([, on]) => on)
      .map(([k]) => parseInt(k, 10));
    const r = calculateAdjustments(toNumbers(state.dept), toNumbers(state.company), enabled);
    state.results = r;
    if (r.adjustments.length > 0 || Object.keys(r.differences).length > 0) {
      const entry: HistoryEntry = {
        ts: new Date().toLocaleString('zh-TW', { hour12: false }),
        dept: r.dept,
        company: r.company,
        adjustments: r.adjustments,
        differences: r.differences,
      };
      state.history = [entry, ...state.history].slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
      } catch {
        /* localStorage 不可用時略過，不影響計算 */
      }
    }
    render();
    q('[data-out="resultsAnchor"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearAll(): void {
    if (!confirm('清空所有輸入與歷史記錄？')) return;
    state.dept = {};
    state.company = {};
    state.results = null;
    state.history = [];
    state.enabled = { 60: true, 65: false, 70: false, 75: false, 80: false, 85: false };
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* 略過 */
    }
    render();
  }

  function exportText(): void {
    const r = state.results;
    if (!r) return;
    const lines = [`【對帳結果】${new Date().toLocaleString('zh-TW')}`, '—— 差異 ——'];
    Object.entries(r.differences).forEach(([m, d]) =>
      lines.push(`${m}: ${d > 0 ? '不足' : '多了'} ${Math.abs(d)} 元`),
    );
    lines.push('—— 調整建議 ——');
    r.adjustments.forEach((a) => {
      const combo = a.combination?.length ? `（${a.combination.join('+')}）` : '';
      if (a.kind === 'transfer') lines.push(`${a.from} → ${a.to}：${a.amount}元${combo}`);
      else if (a.kind === 'charge') lines.push(`${a.to} 補結帳 ${a.amount}元${combo}`);
      else if (a.kind === 'remove') lines.push(`${a.from} 多 ${a.amount}元 → ${a.to}${combo}`);
      else lines.push(`${a.from} ${a.amount}元 → ${a.to}`);
    });
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ text, title: 'POS對帳結果' }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert('已複製到剪貼簿'));
    else prompt('請複製以下內容：', text);
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────
  function renderTabs(): void {
    container.querySelectorAll<HTMLElement>('.pos-tab').forEach((btn) => {
      btn.dataset.active = String(btn.dataset.tab === state.tab);
    });
    els.deptCount.textContent = countFilled(state.dept) ? ` · ${countFilled(state.dept)}` : '';
    els.companyCount.textContent = countFilled(state.company) ? ` · ${countFilled(state.company)}` : '';
    // OCR 字典目前主要對齊百貨POS，只在百貨POS分頁顯示拍照辨識。
    els.ocrSection.hidden = state.tab !== 'dept';
  }

  function renderInputs(): void {
    const pos = state.tab;
    const fields = PAYMENT_GROUPS[pos];
    // 常用欄位(active !== false)即使空白也固定在上方，方便手動輸入；
    // 罕用欄位(active === false)只有「有填入金額」時才浮上來，否則收進摺疊區。
    // OCR／同步帶入後會在 render() 重新分組，照片抓到值的罕用欄位就會自動浮上來。
    const topFields = fields.filter((f) => f.active !== false || hasInput(pos, f.key));
    const hiddenFields = fields.filter((f) => f.active === false && !hasInput(pos, f.key));
    const rowHtml = (f: (typeof fields)[number]): string => `
      <div class="row">
        <div class="lbl"><span class="glyph">${f.glyph}</span><span>${f.label}</span></div>
        <input type="number" inputmode="numeric" placeholder="0" data-pos="${pos}" data-key="${f.key}" value="${val(pos, f.key)}" />
      </div>`;
    let html = topFields.map(rowHtml).join('');
    if (hiddenFields.length) {
      html += `
        <details class="pending-group">
          <summary>其他付款方式 · 尚未填入（${hiddenFields.length} 項）</summary>
          <div class="rows-inner">${hiddenFields.map(rowHtml).join('')}</div>
        </details>`;
    }
    els.inputRows.innerHTML = html;
  }

  function renderChips(): void {
    els.chips.innerHTML = OPTIONAL_PIECES.map(
      (n) => `
      <button class="toggle-row" data-n="${n}" data-on="${state.enabled[n]}">
        <span class="toggle-text">${n} 元品項</span>
        <span class="toggle-state">${state.enabled[n] ? '啟用中' : '未啟用'}</span>
        <span class="switch" aria-hidden="true"><span></span></span>
      </button>`,
    ).join('');
  }

  function renderDiff(): void {
    const d = deptToCanonical(toNumbers(state.dept));
    const c = companyToCanonical(toNumbers(state.company));
    const rows = METHODS.map((m) => {
      const dv = d[m] || 0;
      const cv = c[m] || 0;
      return { m, dv, cv, diff: dv - cv, has: dv > 0 || cv > 0 };
    }).filter((r) => r.has);
    if (!rows.length) {
      els.diffTable.innerHTML = '<div class="hint">輸入後，這裡會顯示百貨／公司逐項差異對照。</div>';
      return;
    }
    els.diffTable.innerHTML = `
      <div class="diff-table">
        <div class="diff-head"><span>付款方式</span><span>百貨</span><span>公司</span></div>
        ${rows
          .map(
            (r) => `
          <div class="diff-row" data-mismatch="${r.diff !== 0}">
            <span class="name">${r.m}</span>
            <span class="v ${r.dv ? '' : 'muted'}">${num(r.dv)}</span>
            <span class="v ${r.cv ? '' : 'muted'}">${num(r.cv)}</span>
            ${r.diff !== 0 ? `<span class="diff-chip">${r.diff > 0 ? `公司少 ${r.diff}` : `公司多 ${Math.abs(r.diff)}`}</span>` : ''}
          </div>`,
          )
          .join('')}
      </div>`;
  }

  function adjustmentHtml(a: Adjustment): string {
    let icon = '↔';
    let fromTo = '';
    if (a.kind === 'transfer') {
      icon = '↔';
      fromTo = `<b>${a.from}</b> → <b>${a.to}</b>`;
    } else if (a.kind === 'charge') {
      icon = '卡';
      fromTo = `${a.to} <span style="color:var(--pos-down)">補結帳</span>`;
    } else if (a.kind === 'remove') {
      icon = '×';
      fromTo = `<b>${a.from}</b> 多餘金額 → 轉出或刪除`;
    } else if (a.kind === 'direct-add' || a.kind === 'direct-remove') {
      icon = a.kind === 'direct-add' ? '＋' : '－';
      fromTo = `<b>${a.from}</b> ${a.kind === 'direct-add' ? '需增加' : '需減少'}`;
    } else {
      icon = '!';
      fromTo = `<b>${a.from}</b> → <b>${a.to}</b>（無組合）`;
    }
    return `
      <div class="adj-card" data-kind="${a.kind}">
        <div class="adj-head">
          <span class="icon">${icon}</span>
          <span class="from-to">${fromTo}</span>
          <span class="amount">$${Number(a.amount || 0).toLocaleString()}</span>
        </div>
        ${
          a.combination?.length
            ? `<div class="adj-combo">${a.combination
                .map((p, i) => `${i ? '<span class="plus">+</span>' : ''}<span class="piece">${p}</span>`)
                .join('')}</div>`
            : ''
        }
      </div>`;
  }

  function renderResults(): void {
    const r = state.results;
    els.diffMeta.hidden = !r;
    els.diffCount.textContent = String(r ? Object.keys(r.differences).length : 0);
    if (!r) {
      els.results.innerHTML = '';
      return;
    }
    if (r.adjustments.length === 0 && Object.keys(r.differences).length === 0) {
      els.results.innerHTML = '<div class="match-banner">兩台POS金額完全相符，無需調整。</div>';
      return;
    }
    if (!r.adjustments.length) {
      els.results.innerHTML = '';
      return;
    }
    els.results.innerHTML = `
      <div class="sec-head">
        <div class="h">調整建議<span class="count">公司帳調整方案</span></div>
        <button class="export-btn" data-act="export">匯出</button>
      </div>
      ${r.adjustments.map(adjustmentHtml).join('')}`;
  }

  function renderHistory(): void {
    if (!state.showHistory || !state.history.length) {
      els.history.innerHTML = '';
      return;
    }
    els.history.innerHTML = `
      <div class="sec-head">
        <div class="h">歷史紀錄<span class="count">最近 ${state.history.length} 筆</span></div>
        <button class="icon-btn ghost" data-act="clearHistory">⌫</button>
      </div>
      ${state.history
        .map((h) => {
          // 歷史來自 localStorage，可能被竄改 → 內插前一律跳脫，避免儲存型 HTML 注入。
          const rows = h.adjustments
            .slice(0, 3)
            .map((a) => {
              const from = escapeHtml(a.from);
              const to = escapeHtml(a.to);
              const amt = Number(a.amount) || 0;
              const line =
                a.kind === 'transfer'
                  ? `${from} → ${to} ${amt}元`
                  : a.kind === 'charge'
                    ? `${to} 補 ${amt}元`
                    : a.kind === 'remove'
                      ? `${from} 多 ${amt}元`
                      : `${from} → ${to}`;
              return `<div class="hist-line">• ${line}</div>`;
            })
            .join('');
          return `
        <div class="hist-card">
          <div class="hist-time"><span>${escapeHtml(h.ts)}</span><span>${h.adjustments.length} 項調整</span></div>
          ${rows}
        </div>`;
        })
        .join('')}`;
  }

  function renderDynamic(): void {
    renderTabs();
    renderDiff();
    renderResults();
    renderHistory();
  }

  function render(): void {
    renderTabs();
    renderInputs();
    renderChips();
    renderDiff();
    renderResults();
    renderHistory();
  }

  // ── OCR 複核面板（辨識結果一定要按「套用」才寫入表單）──────────────────
  function renderReviewPanel(
    target: HTMLElement,
    result: MergedResult,
    applyCallback: (fields: Record<string, number>) => void,
  ): void {
    const matchedEntries = Object.entries(result.matched);
    // 多張照片數值不一致的欄位：預設「不勾選」，避免按套用就寫入一個用猜的值。
    const conflictKeys = new Set(result.conflicts.map((c) => c.key));
    const matchedRows = matchedEntries
      .map(([key, r]) => {
        const conflicted = conflictKeys.has(key);
        const warn =
          (conflicted ? ' ❗多張不一致' : '') +
          (r.confidence < ocrConfig.confidenceWarningThreshold ? ' ⚠️' : '');
        return `
        <div class="field-row">
          <input type="checkbox" data-key="${key}" ${conflicted ? '' : 'checked'} />
          <span class="name">${escapeHtml(r.rawText)}${warn}</span>
          <input type="number" data-value-for="${key}" value="${r.value}" />
        </div>`;
      })
      .join('');

    const conflictHtml = result.conflicts.length
      ? `<div class="conflict">⚠️ 以下欄位在不同照片讀到不同數值，請自行確認後手動填入：<br/>${result.conflicts
          .map((c) => `${c.key}：${c.values.map((v) => `第${v.source + 1}張=${v.value.toLocaleString()}`).join(' vs ')}`)
          .join('<br/>')}</div>`
      : '';

    const unmatchedHtml = result.unmatched.length
      ? `<div class="unmatched">未對應欄位（讀到了，但字典裡沒有，僅供參考）：<br/>${result.unmatched
          .map((u) => `${escapeHtml(u.label)}：${u.value.toLocaleString()}`)
          .join('　')}</div>`
      : '';

    target.innerHTML = `
      <div class="ocr-review">
        <div class="title">辨識結果複核（共 ${result.sourceCount} 張照片，抓到 ${matchedEntries.length} 項）</div>
        ${matchedRows || '<div class="unmatched">沒有辨識到任何已知欄位</div>'}
        ${conflictHtml}
        ${unmatchedHtml}
        ${matchedEntries.length ? '<button class="btn btn-primary apply-btn" data-act="ocrApply">套用到表單</button>' : ''}
      </div>`;

    const applyBtn = target.querySelector<HTMLButtonElement>('[data-act="ocrApply"]');
    if (!applyBtn) return;
    applyBtn.addEventListener(
      'click',
      () => {
        const fields: Record<string, number> = {};
        target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
          if (!cb.checked) return;
          const key = cb.dataset.key!;
          const valueInput = target.querySelector<HTMLInputElement>(`input[data-value-for="${key}"]`);
          fields[key] = Number(valueInput?.value) || 0;
        });
        applyCallback(fields);
        target.innerHTML = `<div class="ocr-review" style="color:var(--pos-up);">已套用 ${Object.keys(fields).length} 項欄位 ✓</div>`;
      },
      { signal },
    );
  }

  async function handleOcrFiles(fileList: FileList): Promise<void> {
    const files = Array.from(fileList);
    if (!files.length) return;
    els.ocrReviewArea.innerHTML = `<div class="ocr-review">辨識中，共 ${files.length} 張照片…</div>`;
    try {
      const result = await recognizeAndParse(files, 'dept');
      if (unmounted) return; // 模組已卸載：別再動已分離的 DOM／state
      renderReviewPanel(els.ocrReviewArea, result, (fields) => {
        // OCR 字典對齊百貨POS，固定寫入 'dept'。
        // 經由 setVal 正規化為非負整數（與手動輸入同一條路徑），避免小數值流入計算，
        // 導致 findBestCombination 的 new Array(target+1) 擲出例外。
        Object.entries(fields).forEach(([key, value]) => setVal('dept', key, String(value)));
        render();
      });
    } catch (err) {
      if (unmounted) return;
      const msg = err instanceof Error ? err.message : String(err);
      els.ocrReviewArea.innerHTML = `<div class="ocr-review" style="color:var(--pos-down);">辨識失敗：${escapeHtml(msg)}</div>`;
    }
  }

  // ── 事件綁定（全部掛 signal，卸載時一次移除）────────────────────────────
  const controller = new AbortController();
  const { signal } = controller;
  let unmounted = false;

  // 輸入欄位（事件委派於穩定的 inputRows 容器）。
  els.inputRows.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      const pos = t.dataset.pos as PosKind | undefined;
      const key = t.dataset.key;
      if (pos && key) setVal(pos, key, t.value);
    },
    { signal },
  );

  // 品項開關（委派於 chips 容器）。
  els.chips.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.toggle-row');
      if (!btn) return;
      const n = Number(btn.dataset.n);
      state.enabled[n] = !state.enabled[n];
      render();
    },
    { signal },
  );

  // 其餘按鈕／分頁（委派於整個 container）。
  container.addEventListener(
    'click',
    (e) => {
      const el = e.target as HTMLElement;
      const tab = el.closest<HTMLElement>('.pos-tab');
      if (tab) {
        state.tab = (tab.dataset.tab as PosKind) ?? 'dept';
        render();
        return;
      }
      const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'clear') clearAll();
      else if (act === 'sync') syncDeptToCompanyAction();
      else if (act === 'compute') compute();
      else if (act === 'export') exportText();
      else if (act === 'ocr') els.fileInput.click();
      else if (act === 'clearHistory') {
        state.history = [];
        try {
          localStorage.removeItem(HISTORY_KEY);
        } catch {
          /* 略過 */
        }
        render();
      }
    },
    { signal },
  );

  els.fileInput.addEventListener(
    'change',
    (e) => {
      const input = e.target as HTMLInputElement;
      const files = input.files;
      input.value = ''; // 清空，下次選同一張也能再次觸發 change
      if (files) void handleOcrFiles(files);
    },
    { signal },
  );

  render();

  return () => {
    unmounted = true;
    controller.abort();
    container.innerHTML = '';
  };
}
