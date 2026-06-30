// 換錢模組的 UI 層：讀「目前各幣值總數」→ 呼叫純函式 → 顯示「好換」要換多少。
// 不在此處放計算規則，所有計算都來自 calculate.ts。

import { denominations, getStockTargets, unitLabel, type ReserveBoxCount } from '../../core/rules';
import { formatNT } from '../../core/format';
import type { Denomination } from '../../core/types';
import { popInput, pulseElement } from '../../core/animate';
import {
  clearDailyMemory,
  loadDailyMemory,
  saveDailyMemory,
  scheduleDailyReset,
} from '../../core/daily-memory';
import { goodExchange, sanitizeCount, type GoodExchangeResult } from './calculate';
import './exchange.css';

const MEMORY_KEY = 'exchangeDailyV1';

interface ExchangeMemory {
  counts: Partial<Record<Denomination, string>>;
  reserveBoxes: ReserveBoxCount;
}

const TEMPLATE = `
  <section class="card">
    <div class="card-heading-row">
      <h2>目前各幣值數量</h2>
      <button type="button" class="clear-all-btn" data-clear-all aria-label="清空所有換錢數量">
        清空全部
      </button>
    </div>
    <p class="hint">數一數每種面額目前總共有多少，填進去即可。</p>
    <div class="denoms" data-inputs="count"></div>
  </section>

  <section class="card">
    <fieldset class="reserve-box-control">
      <legend>備用金盒數</legend>
      <div class="seg">
        <label>
          <input type="radio" name="reserve-boxes" value="1" checked />
          <span>一盒（預設）</span>
        </label>
        <label>
          <input type="radio" name="reserve-boxes" value="2" />
          <span>兩盒</span>
        </label>
      </div>
      <p class="box-mode-note" data-out="box-mode-note">目前按「一盒備用金＋POS 預留」計算。</p>
    </fieldset>
    <h2>今日結論</h2>
    <p class="conclusion ok" data-out="conclusion">請輸入數量。</p>
  </section>

  <section class="card">
    <h2>要換多少（好換）</h2>
    <ul class="result-list" data-out="exchange-list"></ul>
    <p class="total" data-out="exchange-total"></p>
  </section>

  <section class="card">
    <h2>明細表</h2>
    <div class="table-scroll">
      <table class="detail">
        <thead>
          <tr><th>面額</th><th>目前</th><th>目標</th><th>缺少</th><th>好換</th><th>多出</th></tr>
        </thead>
        <tbody data-out="detail-body"></tbody>
      </table>
    </div>
  </section>

  <p class="unit-note">單位：500／100 為「張」，50／10／5／1 為「個」。好換＝銅板補到 5 的倍數、總額進位到整千，付款全用千元鈔。</p>
`;

// ---- 讀寫輸入（皆以 container 為範圍） ----------------------------------

function buildInputs(wrap: HTMLElement): void {
  wrap.innerHTML = denominations
    .map((d) => {
      const u = unitLabel(d);
      const target = getStockTargets(1)[d];
      return `
        <div class="denom-row" data-row="${d}" data-filled="false">
          <span class="denom-name">${d} 元 <small>（${u}，目標 <span data-target="${d}">${target}</span>）</small></span>
          <div class="denom-field">
            <input type="text" inputmode="numeric" pattern="[0-9]*"
                   data-count="${d}" placeholder="0" aria-label="${d} 元目前數量" />
            <button type="button" class="denom-clear" data-clear="${d}" aria-label="清除 ${d} 元數量" title="清除">✕</button>
          </div>
        </div>`;
    })
    .join('');
}

// 同步單一輸入列的「已填入」醒目狀態（外框粗體＋亮顯），並回傳是否由空變填（供彈跳回饋）。
function syncFilled(container: HTMLElement, d: Denomination): boolean {
  const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
  const row = container.querySelector<HTMLElement>(`[data-row="${d}"]`);
  if (!input || !row) return false;
  const filled = input.value.trim() !== '';
  const was = row.dataset.filled === 'true';
  row.dataset.filled = String(filled);
  return filled && !was;
}

function readCounts(container: HTMLElement): Partial<Record<Denomination, string>> {
  const obj: Partial<Record<Denomination, string>> = {};
  for (const d of denominations) {
    const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
    obj[d] = input?.value ?? '';
  }
  return obj;
}

// ---- 渲染 ---------------------------------------------------------------

function renderConclusion(el: HTMLElement, result: GoodExchangeResult): void {
  if (!result.needsExchange) {
    el.className = 'conclusion ok';
    el.textContent = '今日建議：不需要換錢，各幣值都已達標準量。';
    return;
  }
  el.className = 'conclusion need';
  const extra = result.total - result.exactTotal;
  let text = `今日建議：換 ${formatNT(result.total)}，付 ${result.thousandNotes} 張千元鈔。`;
  text += `實際缺 ${formatNT(result.exactTotal)}`;
  if (extra > 0) text += `，為湊整千多換的 ${formatNT(extra)} 留抽屜備用`;
  text += '。';
  el.textContent = text;
}

function renderExchangeList(listEl: HTMLElement, totalEl: HTMLElement, result: GoodExchangeResult): void {
  const items = result.lines.filter((l) => l.exchange > 0);
  if (items.length === 0) {
    listEl.innerHTML = '<li class="muted">各幣值都已達標準量，不需要換錢。</li>';
    totalEl.textContent = '';
    return;
  }
  listEl.innerHTML = items
    .map((l) => {
      const extraNote = l.extra > 0 ? `（含多換 ${l.extra}）` : '';
      return `<li class="state-need">${l.denom} 元 換 ${l.exchange} ${l.unit} = ${formatNT(l.amount)}${extraNote}</li>`;
    })
    .join('');
  totalEl.textContent = `合計：${formatNT(result.total)}（付 ${result.thousandNotes} 張千元）`;
}

function renderTable(
  tbody: HTMLElement,
  result: GoodExchangeResult,
  current: Record<Denomination, number>,
): void {
  tbody.innerHTML = result.lines
    .map(
      (l) => {
        // 「多出」= 目前高於目標的真實餘量（規格 §8.5）；好換多換的部分另在清單／結論呈現。
        const overTarget = Math.max(0, current[l.denom] - l.target);
        return `<tr>
        <td>${l.denom}</td>
        <td>${current[l.denom]}</td>
        <td>${l.target}</td>
        <td>${l.exact || '－'}</td>
        <td>${l.exchange || '－'}</td>
        <td>${overTarget || '－'}</td>
      </tr>`;
      },
    )
    .join('');
}

/**
 * 把換錢工具畫進 container，並回傳卸載用的清理函式。
 */
export function renderExchange(container: HTMLElement): () => void {
  container.innerHTML = TEMPLATE;

  buildInputs(container.querySelector<HTMLElement>('[data-inputs="count"]')!);

  const memory = loadDailyMemory<Partial<ExchangeMemory>>(MEMORY_KEY);
  for (const d of denominations) {
    const saved = memory?.counts?.[d];
    const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
    if (input && typeof saved === 'string' && /^\d+$/.test(saved)) input.value = saved;
    syncFilled(container, d);
  }
  const savedBoxes = memory?.reserveBoxes === 2 ? '2' : '1';
  const savedBoxInput = container.querySelector<HTMLInputElement>(
    `input[name="reserve-boxes"][value="${savedBoxes}"]`,
  );
  if (savedBoxInput) savedBoxInput.checked = true;

  const conclusionEl = container.querySelector<HTMLElement>('[data-out="conclusion"]')!;
  const exchangeListEl = container.querySelector<HTMLElement>('[data-out="exchange-list"]')!;
  const exchangeTotalEl = container.querySelector<HTMLElement>('[data-out="exchange-total"]')!;
  const tableBodyEl = container.querySelector<HTMLElement>('[data-out="detail-body"]')!;
  const boxModeNoteEl = container.querySelector<HTMLElement>('[data-out="box-mode-note"]')!;

  function readReserveBoxes(): ReserveBoxCount {
    const checked = container.querySelector<HTMLInputElement>('input[name="reserve-boxes"]:checked');
    return checked?.value === '2' ? 2 : 1;
  }

  function saveMemory(): void {
    saveDailyMemory<ExchangeMemory>(MEMORY_KEY, {
      counts: readCounts(container),
      reserveBoxes: readReserveBoxes(),
    });
  }

  function renderTargets(reserveBoxes: ReserveBoxCount): void {
    const targets = getStockTargets(reserveBoxes);
    for (const d of denominations) {
      const targetEl = container.querySelector<HTMLElement>(`[data-target="${d}"]`);
      if (targetEl) targetEl.textContent = String(targets[d]);
    }
    boxModeNoteEl.textContent = `目前按「${reserveBoxes === 2 ? '兩盒' : '一盒'}備用金＋POS 預留」計算。`;
  }

  let prevConclusion = '';
  let firstRender = true;

  function render(): void {
    const counts = readCounts(container);
    const reserveBoxes = readReserveBoxes();
    const result = goodExchange({ counts, reserveBoxes });
    const current = {} as Record<Denomination, number>;
    for (const d of denominations) current[d] = sanitizeCount(counts[d]);
    renderTargets(reserveBoxes);
    renderConclusion(conclusionEl, result);
    renderExchangeList(exchangeListEl, exchangeTotalEl, result);
    renderTable(tableBodyEl, result, current);

    // 結論文字一變就脈動一次，現場一眼看到「今日建議變了」（首次渲染不做）。
    const text = conclusionEl.textContent ?? '';
    if (!firstRender && text !== prevConclusion) pulseElement(conclusionEl);
    prevConclusion = text;
    firstRender = false;
  }

  const onInput = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.count !== undefined) {
      const cleaned = target.value.replace(/\D/g, '');
      if (cleaned !== target.value) target.value = cleaned;
      const d = Number(target.dataset.count) as Denomination;
      if (syncFilled(container, d)) popInput(target);
    }
    render();
    saveMemory();
  };

  // 快速刪除：點該列的 ✕ 立即清空、解除醒目狀態並重算，再把游標留在該欄方便重填。
  const onClick = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const clearAll = target.closest<HTMLElement>('[data-clear-all]');
    if (clearAll) {
      const hasInput = denominations.some((d) => {
        const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
        return input?.value.trim() !== '';
      });
      if (!hasInput || !confirm('清空所有換錢數量？')) return;

      for (const d of denominations) {
        const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
        if (input) input.value = '';
        syncFilled(container, d);
      }
      render();
      saveMemory();
      container.querySelector<HTMLInputElement>('[data-count]')?.focus();
      return;
    }

    const clear = target.closest<HTMLElement>('[data-clear]');
    if (!clear) return;
    const d = Number(clear.dataset.clear) as Denomination;
    const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
    if (input) {
      input.value = '';
      syncFilled(container, d);
      input.focus();
    }
    render();
    saveMemory();
  };

  container.addEventListener('input', onInput);
  container.addEventListener('click', onClick);

  render();

  const stopDailyReset = scheduleDailyReset(() => {
    clearDailyMemory(MEMORY_KEY);
    for (const d of denominations) {
      const input = container.querySelector<HTMLInputElement>(`[data-count="${d}"]`);
      if (input) input.value = '';
      syncFilled(container, d);
    }
    const defaultBox = container.querySelector<HTMLInputElement>('input[name="reserve-boxes"][value="1"]');
    if (defaultBox) defaultBox.checked = true;
    render();
  });

  return () => {
    stopDailyReset();
    container.removeEventListener('input', onInput);
    container.removeEventListener('click', onClick);
  };
}
