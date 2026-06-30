// KK 清帳 UI：讀取公司 POS 快照，呈現單欄唯讀清帳資料。

import { loadCompanySnapshot } from '../../core/company-snapshot';
import { scheduleDailyReset } from '../../core/daily-memory';
import { formatNT } from '../../core/format';
import { buildKkSettlement } from './calculate';
import './kk.css';

function formatSavedAt(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function renderKk(container: HTMLElement): () => void {
  const render = (): void => {
    const snapshot = loadCompanySnapshot();
    const settlement = buildKkSettlement(snapshot.amounts);
    const when = formatSavedAt(snapshot.savedAt);
    const subtitle = when
      ? `已帶入公司 POS 金額 · ${when}`
      : '尚未在「雙POS對帳」輸入公司 POS 金額';

    const rows = settlement.rows
      .map((row) => {
        const filled = row.amount > 0;
        const value = filled ? formatNT(row.amount) : '—';
        return `
        <div class="kk-row" data-kind="${row.kind}" data-filled="${filled}">
          <span class="kk-label">${row.label}</span>
          <span class="kk-amount">${value}</span>
        </div>`;
      })
      .join('');

    container.innerHTML = `
    <div class="kk">
      <header class="kk-head">
        <div class="kk-title">KK清帳</div>
        <div class="kk-sub">${subtitle}</div>
      </header>
      <section class="kk-sheet" aria-label="KK清帳金額">
        ${rows}
      </section>
      <p class="kk-note">「街口／悠遊付等」已依總營業額扣除其他列出的款別後自動計算。</p>
    </div>`;
  };

  render();
  return scheduleDailyReset(render);
}
