// 雙POS對帳模組的 UI 層：讀輸入 → 呼叫純函式 → 渲染。
// 計算規則都在 calculate.ts / ocr.ts，本檔只負責畫面、事件與 localStorage。
// 結構移植自原始 index.html（reference/dual-pos-original），改為殼層可掛載／卸載的模組。

import { PAYMENT_GROUPS, METHODS, OPTIONAL_PIECES } from './data';
import {
  calculateAdjustments,
  deptToCanonical,
  companyToCanonical,
  normalizeProductPieces,
  syncDeptToCompany,
  toNumbers,
} from './calculate';
import { recognizeAndParse, ocrConfig, type MergedResult } from './ocr';
import { paginate } from './pagination';
import { saveDeptSnapshot } from '../../core/dept-snapshot';
import type { Adjustment, PosKind, PosState, ReconcileResult } from './types';
import './reconcile.css';

const HISTORY_KEY = 'posHistoryManualV1';
// OCR 抓到的「銷售總金額」存進 state.total（總帳），而非當成付款欄位寫進 state[pos]，
// 否則會被算進「付款合計」造成重複。用這個保留 key 在 ocrWarn 裡標記總帳的 ⚠️。
const TOTAL_OCR_KEY = 'sales_total';

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
  customPiece: number | '';
  results: ReconcileResult | null;
  history: HistoryEntry[];
  showHistory: boolean;
  ocrWarn: Set<string>; // 由「信心不足／多張不一致」的 OCR 帶入的百貨POS欄位，列旁顯示 ⚠️
  total: Record<PosKind, number | ''>; // 各POS的「總帳」（手動或 OCR 銷售總金額），用來核對付款合計
}

const TEMPLATE = `
  <div class="rc">
    <div class="navbar">
      <div class="navbar-top">
        <div>
          <div class="title">雙POS對帳</div>
          <div class="sub">手動輸入 · 自動對帳</div>
        </div>
        <div class="nav-actions">
          <button class="icon-btn" data-act="clear" title="清空">⌫</button>
        </div>
      </div>
      <div class="total-bar" data-out="totalBar"></div>
    </div>

    <div class="pos-tabs">
      <button class="pos-tab" data-tab="dept" data-active="true"><span class="dot"></span>百貨POS<span data-out="deptCount"></span></button>
      <button class="pos-tab" data-tab="company" data-active="false"><span class="dot"></span>公司POS<span data-out="companyCount"></span></button>
    </div>

    <div class="ocr-section" data-out="ocrSection">
      <input type="file" accept="image/*" multiple hidden data-act="ocrFile" />
      <button class="btn btn-secondary" data-act="ocrAdd">📷 拍照辨識（可一次選多張）</button>
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
    customPiece: '',
    results: null,
    history: loadHistory(),
    showHistory: false,
    ocrWarn: new Set<string>(),
    total: { dept: '', company: '' },
  };

  const q = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    container.querySelector<T>(sel)!;

  const els = {
    inputRows: q('[data-out="inputRows"]'),
    totalBar: q('[data-out="totalBar"]'),
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
  // 該POS所有付款方式的合計（總帳另存 state.total，不在此計入）。
  const sumAll = (pos: PosKind): number =>
    Object.values(state[pos]).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0);
  // 「有填入」＝有大於 0 的金額。空白或 0 不套用醒目樣式。
  const hasInput = (pos: PosKind, key: string): boolean => {
    const v = state[pos][key];
    return typeof v === 'number' && v > 0;
  };

  function setVal(pos: PosKind, key: string, value: string): void {
    state[pos][key] = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
    // 百貨POS（手填或 OCR 都走這裡）一有變動就存一份金額快照，供「環球清帳」帶入。
    if (pos === 'dept') saveDeptSnapshot(toNumbers(state.dept));
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
    const enabled = getEnabledProductPieces();
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
    saveDeptSnapshot({}); // 連同環球清帳的帶入來源一起清空
    state.results = null;
    state.history = [];
    state.enabled = { 60: true, 65: false, 70: false, 75: false, 80: false, 85: false };
    state.customPiece = '';
    state.ocrWarn.clear(); // 連同 ⚠️ 標記一起清掉
    state.total = { dept: '', company: '' }; // 清掉總帳
    ocrRun++; // 作廢任何進行中的辨識
    els.ocrReviewArea.innerHTML = ''; // 清掉辨識結果摘要
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
    // 手動與 OCR 帶入都寫進同一份 state，因此大於 0 的欄位會套用相同醒目樣式。
    const rowHtml = (f: (typeof fields)[number]): string => {
      const filled = hasInput(pos, f.key);
      // ⚠️ 只標在百貨POS：表示這格是 OCR 以「低信心／多張不一致」帶入的，請人工再確認一次。
      const warn = pos === 'dept' && state.ocrWarn.has(f.key) ? ' <span class="warn" title="辨識信心不足，請確認">⚠️</span>' : '';
      return `
        <div class="payment-row" data-key="${f.key}" data-filled="${filled}">
          <span class="payment-label"><span class="glyph">${f.glyph}</span><span>${f.label}${warn}</span></span>
          <div class="payment-value">
            <input type="number" inputmode="numeric" placeholder="0" aria-label="${f.label}金額" data-pos="${pos}" data-key="${f.key}" value="${val(pos, f.key)}" />
            <button class="row-del" data-act="rowDel" data-pos="${pos}" data-key="${f.key}" title="清除這格">刪除</button>
          </div>
        </div>`;
    };

    if (pos === 'company') {
      // 公司 POS 不分頁；有金額的欄位優先，兩組內仍維持 PAYMENT_GROUPS 的現場順序。
      const ordered = [...fields].sort(
        (a, b) => Number(hasInput(pos, b.key)) - Number(hasInput(pos, a.key)),
      );
      els.inputRows.innerHTML = `
        <section class="company-payment-list" aria-label="公司 POS 付款方式">
          ${ordered.map(rowHtml).join('')}
        </section>`;
      return;
    }

    // 百貨 POS 欄位較多，維持每頁 11 個付款方式的橫向分頁。
    const pages = paginate(fields, 11);
    const pagesHtml = pages.map((page, index) => `
      <section class="payment-page" aria-label="第 ${index + 1} 頁，共 ${pages.length} 頁">
        <div class="payment-page-number">第 ${index + 1} / ${pages.length} 頁</div>
        <div class="payment-page-rows">${page.map(rowHtml).join('')}</div>
      </section>`).join('');
    els.inputRows.innerHTML = `
      <div class="page-scroll-hint" aria-hidden="true">← 左右滑動換頁 →</div>
      <div class="payment-pages" role="region" aria-label="百貨 POS 付款方式，共 ${pages.length} 頁" tabindex="0">
        ${pagesHtml}
      </div>`;
  }

  function reorderCompanyRows(): void {
    if (state.tab !== 'company') return;
    const list = els.inputRows.querySelector<HTMLElement>('.company-payment-list');
    if (!list) return;
    const rows = new Map(
      Array.from(list.querySelectorAll<HTMLElement>('.payment-row')).map((row) => [row.dataset.key, row]),
    );
    const ordered = [...PAYMENT_GROUPS.company].sort(
      (a, b) => Number(hasInput('company', b.key)) - Number(hasInput('company', a.key)),
    );
    for (const field of ordered) {
      const row = rows.get(field.key);
      if (row) list.append(row);
    }
  }

  function getEnabledProductPieces(): number[] {
    const fixed = Object.entries(state.enabled)
      .filter(([, on]) => on)
      .map(([k]) => Number(k));
    return normalizeProductPieces(state.customPiece === '' ? fixed : [...fixed, state.customPiece]);
  }

  function customPieceStatus(): string {
    return state.customPiece === '' ? '空白不啟用' : `${state.customPiece} 元啟用中`;
  }

  function updateCustomPiece(raw: string, input: HTMLInputElement): void {
    const value = raw.trim();
    if (value === '') {
      state.customPiece = '';
      input.value = '';
    } else if (/^\d+$/.test(value)) {
      const n = Number(value);
      state.customPiece = Number.isSafeInteger(n) && n > 0 ? n : '';
      input.value = state.customPiece === '' ? '' : String(state.customPiece);
    } else {
      state.customPiece = '';
      input.value = '';
    }

    const row = input.closest<HTMLElement>('.custom-piece-row');
    if (row) row.dataset.active = String(state.customPiece !== '');
    const status = row?.querySelector<HTMLElement>('[data-out="customPieceStatus"]');
    if (status) status.textContent = customPieceStatus();
  }

  function renderChips(): void {
    const fixedRows = OPTIONAL_PIECES.map(
      (n) => `
      <button class="toggle-row" data-n="${n}" data-on="${state.enabled[n]}">
        <span class="toggle-text">${n} 元品項</span>
        <span class="toggle-state">${state.enabled[n] ? '啟用中' : '未啟用'}</span>
        <span class="switch" aria-hidden="true"><span></span></span>
      </button>`,
    ).join('');
    els.chips.innerHTML = `${fixedRows}
      <label class="custom-piece-row" data-active="${state.customPiece !== ''}">
        <span class="custom-piece-label">自訂金額</span>
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          placeholder="輸入金額"
          aria-label="自訂品項金額"
          data-act="customPiece"
          value="${state.customPiece === '' ? '' : state.customPiece}"
        />
        <span class="custom-piece-state" data-out="customPieceStatus">${customPieceStatus()}</span>
      </label>`;
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
    renderTotalInfo(); // 付款合計／差距會隨欄位輸入即時更新（不重畫總帳輸入框，避免打斷打字）
    renderDiff();
    renderResults();
    renderHistory();
  }

  function render(): void {
    renderTabs();
    renderInputs();
    renderTotalBar();
    renderChips();
    renderDiff();
    renderResults();
    renderHistory();
  }

  // ── 總帳核對（navbar），依分頁分流 ───────────────────────────────────────
  // 百貨：input=手填／OCR銷售總金額（總帳）；info 顯示付款合計與差距。
  // 公司：input=自動加總公司付款（唯讀）；info 比對百貨總帳（公司應等於百貨銷售總金額）。
  function renderTotalBar(): void {
    if (state.tab === 'dept') {
      const warn = state.ocrWarn.has(TOTAL_OCR_KEY)
        ? ' <span class="warn" title="辨識信心不足，請確認">⚠️</span>'
        : '';
      const totalVal = state.total.dept;
      els.totalBar.innerHTML = `
        <label class="total-input-wrap">
          <span class="total-label">百貨總帳${warn}</span>
          <input type="number" inputmode="numeric" placeholder="銷售總金額" data-total="dept" value="${totalVal === '' ? '' : totalVal}" />
        </label>
        <div class="total-info" data-out="totalInfo"></div>`;
    } else {
      // 公司合計唯讀、自動加總；值由 renderTotalInfo 填入（不放 data-total，避免被輸入監聽改寫）。
      els.totalBar.innerHTML = `
        <label class="total-input-wrap">
          <span class="total-label">公司合計</span>
          <input type="number" inputmode="numeric" placeholder="自動加總" readonly tabindex="-1" value="" />
        </label>
        <div class="total-info" data-out="totalInfo"></div>`;
    }
    renderTotalInfo();
  }

  function renderTotalInfo(): void {
    const info = els.totalBar.querySelector('[data-out="totalInfo"]');
    if (!info) return; // 還沒 renderTotalBar 過（首次 render 順序保證有）
    if (state.tab === 'dept') {
      const sub = sumAll('dept');
      const total = state.total.dept;
      const sumHtml = `<span class="total-sum">付款合計 NT$${sub.toLocaleString()}</span>`;
      let diffHtml: string;
      if (total === '') {
        diffHtml = '<span class="total-hint">輸入總帳即可核對</span>';
      } else {
        const diff = total - sub;
        if (diff === 0) diffHtml = '<span class="total-diff ok">✓ 與付款合計相符</span>';
        else if (diff > 0)
          diffHtml = `<span class="total-diff bad">付款方式還少 NT$${diff.toLocaleString()}（疑似漏填）</span>`;
        else
          diffHtml = `<span class="total-diff bad">付款方式多了 NT$${Math.abs(diff).toLocaleString()}（疑似多填）</span>`;
      }
      info.innerHTML = sumHtml + diffHtml;
    } else {
      // 公司：把自動加總填進唯讀 input；info 比對百貨總帳。
      const compSum = sumAll('company');
      const inputEl = els.totalBar.querySelector<HTMLInputElement>('input');
      if (inputEl) inputEl.value = compSum ? String(compSum) : '';
      const deptTotal = state.total.dept;
      const refHtml = `<span class="total-sum">百貨總帳 ${deptTotal === '' ? '未填' : 'NT$' + deptTotal.toLocaleString()}</span>`;
      let diffHtml: string;
      if (deptTotal === '') {
        diffHtml = '<span class="total-hint">填百貨總帳後核對</span>';
      } else {
        const diff = compSum - deptTotal;
        if (diff === 0) diffHtml = '<span class="total-diff ok">✓ 與百貨總帳相符</span>';
        else if (diff < 0)
          diffHtml = `<span class="total-diff bad">公司比百貨總帳少 NT$${Math.abs(diff).toLocaleString()}</span>`;
        else diffHtml = `<span class="total-diff bad">公司比百貨總帳多 NT$${diff.toLocaleString()}</span>`;
      }
      info.innerHTML = refHtml + diffHtml;
    }
  }

  // ── OCR：拍照／選圖 → 立刻辨識 → 直接自動帶入表單（不需再按確認）──────────
  // 一次可選一張或多張；多張會自動合併、互相驗證。低信心或多張不一致的欄位會在
  // 帶入後標 ⚠️（見 renderInputs），提醒人工複核，但不擋下自動帶入。
  async function handleOcrFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    const myRun = ++ocrRun; // 認領這次辨識的序號；卸載或又選了新照片就讓舊結果作廢
    els.ocrReviewArea.innerHTML = `<div class="ocr-review">辨識中，共 ${files.length} 張照片…</div>`;
    try {
      const result = await recognizeAndParse(files, 'dept');
      if (unmounted || myRun !== ocrRun) return; // 已卸載或又選了新照片 → 這次結果作廢
      const conflictKeys = new Set(result.conflicts.map((c) => c.key));
      const matchedEntries = Object.entries(result.matched);
      let applied = 0;
      let warned = 0;
      matchedEntries.forEach(([key, r]) => {
        const value = Math.max(0, Math.floor(Number(r.value) || 0)); // 與 setVal 同樣正規化為非負整數
        const lowConf = r.confidence < ocrConfig.confidenceWarningThreshold;
        const warnThis = conflictKeys.has(key) || lowConf;
        if (key === TOTAL_OCR_KEY) {
          // 銷售總金額 → 總帳（不寫進付款欄位，避免被算進付款合計造成重複）。
          state.total.dept = value;
        } else {
          // OCR 字典對齊百貨POS，固定寫入 'dept'。經由 setVal 正規化為非負整數
          // （與手動輸入同一條路徑），避免小數流入計算讓 findBestCombination 擲例外。
          setVal('dept', key, String(value));
        }
        applied++;
        if (warnThis) {
          state.ocrWarn.add(key); // 標 ⚠️ 提醒人工複核（總帳用 TOTAL_OCR_KEY）
          warned++;
        } else {
          state.ocrWarn.delete(key); // 這次讀得很有把握 → 清掉舊的 ⚠️
        }
      });
      render(); // 重畫表單：帶入值、醒目標示非零欄位、低信心欄位標 ⚠️
      renderOcrNotice(result, applied, warned);
    } catch (err) {
      if (unmounted || myRun !== ocrRun) return;
      const msg = err instanceof Error ? err.message : String(err);
      els.ocrReviewArea.innerHTML = `<div class="ocr-review" style="color:var(--pos-down);">辨識失敗：${escapeHtml(msg)}</div>`;
    }
  }

  // 辨識後的「結果摘要」：純提示，不是確認步驟（值已自動帶入表單）。
  function renderOcrNotice(result: MergedResult, applied: number, warned: number): void {
    if (!applied) {
      els.ocrReviewArea.innerHTML = '<div class="ocr-review">這 ' + result.sourceCount + ' 張照片沒有辨識到任何已知欄位。</div>';
      return;
    }
    const conflictHtml = result.conflicts.length
      ? `<div class="conflict">⚠️ 以下欄位在不同照片讀到不同數值，已自動採用信心最高的一張，請務必確認：<br/>${result.conflicts
          .map((c) => `${escapeHtml(c.key)}：${c.values.map((v) => `第${v.source + 1}張=${v.value.toLocaleString()}`).join(' vs ')}`)
          .join('<br/>')}</div>`
      : '';
    const warnLine = warned ? `，其中 <b>${warned}</b> 項信心不足已標 ⚠️，請再確認` : '';
    els.ocrReviewArea.innerHTML = `
      <div class="ocr-review">
        <div class="title" style="color:var(--pos-up);">已自動帶入 ${applied} 項欄位 ✓${warnLine}</div>
        ${conflictHtml}
      </div>`;
  }

  // ── 事件綁定（全部掛 signal，卸載時一次移除）────────────────────────────
  const controller = new AbortController();
  const { signal } = controller;
  let unmounted = false;
  // 每次「辨識」拿一個遞增序號；佇列變動（加/刪/清）也會遞增，讓還在跑的舊辨識作廢，
  // 避免照片已換掉後，舊結果才回來蓋掉畫面、被使用者誤按套用。
  let ocrRun = 0;

  // 輸入欄位（事件委派於穩定的 inputRows 容器）。
  els.inputRows.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      const pos = t.dataset.pos as PosKind | undefined;
      const key = t.dataset.key;
      if (pos && key) {
        // ⚠️ 只屬於百貨POS；公司POS有同名 key（cash／linepay…），不可在公司端清掉百貨的 ⚠️。
        if (pos === 'dept' && state.ocrWarn.delete(key)) {
          // 手動改過＝已人工確認：即時移除該列的 ⚠️（不重畫分頁、不打斷輸入）。
          t.closest('.payment-row')?.querySelector('.warn')?.remove();
        }
        setVal(pos, key, t.value);
        // renderDynamic 不重畫輸入分頁；在原 DOM 即時切換外框、粗體與刪除鍵。
        const filled = hasInput(pos, key);
        const row = t.closest<HTMLElement>('.payment-row');
        if (row) row.dataset.filled = String(filled);
        reorderCompanyRows();
      }
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

  els.chips.addEventListener(
    'input',
    (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.dataset.act !== 'customPiece') return;
      updateCustomPiece(input.value, input);
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
      const actEl = el.closest<HTMLElement>('[data-act]');
      const act = actEl?.dataset.act;
      if (act === 'clear') clearAll();
      else if (act === 'sync') syncDeptToCompanyAction();
      else if (act === 'compute') compute();
      else if (act === 'export') exportText();
      else if (act === 'ocrAdd') els.fileInput.click();
      else if (act === 'rowDel') {
        // 一鍵清掉這格（辨識錯誤時用）：就地清空，避免橫向分頁跳回第一頁。
        const pos = actEl?.dataset.pos as PosKind | undefined;
        const key = actEl?.dataset.key;
        if (pos && key) {
          state[pos][key] = '';
          if (pos === 'dept') state.ocrWarn.delete(key); // ⚠️ 只屬於百貨POS
          const row = actEl.closest<HTMLElement>('.payment-row');
          const input = row?.querySelector<HTMLInputElement>('input[data-key]');
          if (input) input.value = '';
          row?.querySelector('.warn')?.remove();
          if (row) row.dataset.filled = 'false';
          reorderCompanyRows();
          renderDynamic();
        }
      } else if (act === 'clearHistory') {
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

  // 總帳輸入（委派於穩定的 totalBar 容器；只更新差距文字，不重畫輸入框以免打斷打字）。
  els.totalBar.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !t.dataset.total) return;
      const pos = t.dataset.total as PosKind;
      const v = t.value.trim();
      state.total[pos] = v === '' ? '' : Math.max(0, parseInt(v, 10) || 0);
      // 手動改過總帳＝已人工確認，清掉它的 ⚠️（僅百貨）並即時移除標記。
      if (pos === 'dept' && state.ocrWarn.delete(TOTAL_OCR_KEY)) {
        t.closest('.total-input-wrap')?.querySelector('.warn')?.remove();
      }
      renderTotalInfo();
    },
    { signal },
  );

  els.fileInput.addEventListener(
    'change',
    (e) => {
      const input = e.target as HTMLInputElement;
      // 先把檔案取進穩定陣列，再清空 input.value。順序很重要：
      // input.files 是 live FileList，先設 value='' 會把它清空，handleOcrFiles 就收到 0 張。
      const files = (input.files ? Array.from(input.files) : []).filter((f) => f.type.startsWith('image/'));
      input.value = ''; // 清空，下次選同一張也能再次觸發 change
      if (files.length) void handleOcrFiles(files); // 選好（單張或多張）立刻辨識並自動帶入
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
