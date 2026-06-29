// 環球清帳 UI 層：讀百貨POS金額快照 → 依對應規則攤成結帳單 → 可手動微調 → 算實收總計。
// 計算規則都在 calculate.ts / data.ts；本檔只負責畫面、事件與帶入。

import { formatNT } from '../../core/format';
import { popInput, pulseElement } from '../../core/animate';
import { loadDeptSnapshot } from '../../core/dept-snapshot';
import { buildSettlement } from './calculate';
import { SECTION_LEFT_TITLE, SECTION_RIGHT_TITLE } from './data';
import './universal.css';

interface ViewRow {
  id: string;
  label: string;
  amount: number;
  appended: boolean;
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function formatSavedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function renderUniversal(container: HTMLElement): () => void {
  let leftRows: ViewRow[] = [];
  let rightRows: ViewRow[] = []; // 含外帶自取下方的自動補列
  let savedAt = '';

  function loadFromSnapshot(): void {
    const snap = loadDeptSnapshot();
    savedAt = snap.savedAt;
    const s = buildSettlement(snap.amounts);
    leftRows = s.left.map((r, i) => ({ id: `L${i}`, label: r.label, amount: r.amount, appended: false }));
    rightRows = [
      ...s.right.map((r, i) => ({ id: `R${i}`, label: r.label, amount: r.amount, appended: false })),
      ...s.appended.map((r, i) => ({ id: `A${i}`, label: r.label, amount: r.amount, appended: true })),
    ];
  }

  const allRows = (): ViewRow[] => [...leftRows, ...rightRows];
  const total = (): number => allRows().reduce((sum, r) => sum + (r.amount || 0), 0);
  const rowById = (id: string): ViewRow | undefined => allRows().find((r) => r.id === id);

  function rowHtml(r: ViewRow): string {
    const tag = r.appended ? '<span class="uv-tag">補</span>' : '';
    return `
      <div class="uv-row" data-id="${r.id}" data-filled="${r.amount > 0}">
        <span class="uv-label">${esc(r.label)}${tag}</span>
        <input class="uv-amount" type="text" inputmode="numeric" pattern="[0-9]*"
               value="${r.amount > 0 ? r.amount : ''}" placeholder="0"
               data-id="${r.id}" aria-label="${esc(r.label)}金額" />
      </div>`;
  }

  function sectionHtml(title: string, rows: ViewRow[]): string {
    return `
      <section class="uv-section">
        <h2 class="uv-section-title">${esc(title)}</h2>
        <div class="uv-rows">${rows.map(rowHtml).join('')}</div>
      </section>`;
  }

  function metaHtml(): string {
    const when = formatSavedAt(savedAt);
    return when
      ? `已帶入「雙POS對帳」百貨POS金額 · ${when}`
      : '尚未在「雙POS對帳」輸入百貨POS金額；下方可直接手填。';
  }

  function renderAll(): void {
    container.innerHTML = `
      <div class="uv">
        <div class="uv-head">
          <div>
            <div class="uv-title">環球清帳</div>
            <div class="uv-sub" data-out="meta">${metaHtml()}</div>
          </div>
          <div class="uv-actions">
            <button class="uv-btn" data-act="reload" title="重新從百貨POS帶入">重新帶入</button>
            <button class="uv-btn ghost" data-act="clear" title="清空所有金額">清空</button>
          </div>
        </div>

        <div class="uv-columns">
          ${sectionHtml(SECTION_LEFT_TITLE, leftRows)}
          ${sectionHtml(SECTION_RIGHT_TITLE, rightRows)}
        </div>

        <div class="uv-total" data-out="totalBar">
          <span class="uv-total-label">實收總計</span>
          <span class="uv-total-value" data-out="total">${formatNT(total())}</span>
        </div>
      </div>`;
  }

  function refreshTotal(): void {
    const el = container.querySelector<HTMLElement>('[data-out="total"]');
    if (el) el.textContent = formatNT(total());
  }

  const onInput = (e: Event): void => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.id) return;
    const cleaned = t.value.replace(/\D/g, '');
    if (cleaned !== t.value) t.value = cleaned;
    const row = rowById(t.dataset.id);
    if (!row) return;
    const was = row.amount > 0;
    row.amount = cleaned === '' ? 0 : Math.max(0, parseInt(cleaned, 10) || 0);
    const rowEl = t.closest<HTMLElement>('.uv-row');
    if (rowEl) rowEl.dataset.filled = String(row.amount > 0);
    if (row.amount > 0 && !was) popInput(t);
    refreshTotal();
  };

  const onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'reload') {
      loadFromSnapshot();
      renderAll();
      pulseElement(container.querySelector<HTMLElement>('[data-out="totalBar"]'));
    } else if (btn.dataset.act === 'clear') {
      for (const r of allRows()) r.amount = 0;
      renderAll();
    }
  };

  container.addEventListener('input', onInput);
  container.addEventListener('click', onClick);

  loadFromSnapshot();
  renderAll();

  return () => {
    container.removeEventListener('input', onInput);
    container.removeEventListener('click', onClick);
  };
}
