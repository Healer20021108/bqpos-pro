// 環球清帳 UI 層：讀百貨POS金額快照 → 依對應規則攤成結帳單 → 唯讀對照（照抄用）。
// 只呈現、不編輯：有金額者醒目，無金額／0 者淡化。計算規則都在 calculate.ts / data.ts。

import { formatNT } from '../../core/format';
import { loadDeptSnapshot } from '../../core/dept-snapshot';
import { scheduleDailyReset } from '../../core/daily-memory';
import { buildSettlement, type SettlementRow } from './calculate';
import { SECTION_LEFT_TITLE, SECTION_RIGHT_TITLE } from './data';
import './universal.css';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function formatSavedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function renderUniversal(container: HTMLElement): () => void {
  const render = (): void => {
    const snap = loadDeptSnapshot();
    const s = buildSettlement(snap.amounts);
    const rightRows = [...s.right, ...s.appended]; // 自動補列接在右欄外帶自取下方

    const rowHtml = (r: SettlementRow): string => {
      const filled = r.amount > 0;
      const tag = r.appended ? '<span class="uv-tag">補</span>' : '';
      const value = filled ? r.amount.toLocaleString('en-US') : '—';
      return `
      <div class="uv-row" data-filled="${filled}">
        <span class="uv-label">${esc(r.label)}${tag}</span>
        <span class="uv-amount">${value}</span>
      </div>`;
    };

    const sectionHtml = (title: string, rows: SettlementRow[]): string => `
    <section class="uv-section">
      <h2 class="uv-section-title">${esc(title)}</h2>
      <div class="uv-rows">${rows.map(rowHtml).join('')}</div>
    </section>`;

    const when = formatSavedAt(snap.savedAt);
    const sub = when
      ? `照抄用 · 已帶入百貨POS金額 · ${when}`
      : '尚未在「雙POS對帳」輸入百貨POS金額';

    container.innerHTML = `
    <div class="uv">
      <div class="uv-head">
        <div class="uv-title">環球清帳</div>
        <div class="uv-sub">${sub}</div>
      </div>
      <div class="uv-columns">
        ${sectionHtml(SECTION_LEFT_TITLE, s.left)}
        ${sectionHtml(SECTION_RIGHT_TITLE, rightRows)}
      </div>
      <div class="uv-total">
        <span class="uv-total-label">實收總計</span>
        <span class="uv-total-value">${formatNT(s.total)}</span>
      </div>
    </div>`;
  };

  render();
  return scheduleDailyReset(render);
}
