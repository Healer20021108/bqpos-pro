// 換錢模組的 UI 層：讀「目前各幣值總數」→ 呼叫純函式 → 顯示「好換」要換多少。
// 不在此處放計算規則，所有計算都來自 calculate.ts。

import { denominations, unitLabel, stockTargets } from '../../core/rules';
import { formatNT } from '../../core/format';
import type { Denomination } from '../../core/types';
import { goodExchange, sanitizeCount, type GoodExchangeResult } from './calculate';
import './exchange.css';

const TEMPLATE = `
  <section class="card">
    <h2>目前各幣值數量</h2>
    <p class="hint">數一數每種面額目前總共有多少，填進去即可。</p>
    <div class="denoms" data-inputs="count"></div>
  </section>

  <section class="card">
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
          <tr><th>面額</th><th>目前</th><th>目標</th><th>精準缺</th><th>好換換</th><th>多出</th></tr>
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
      const target = stockTargets[d];
      return `
        <label class="denom-row">
          <span class="denom-name">${d} 元 <small>（${u}，目標 ${target}）</small></span>
          <input type="text" inputmode="numeric" pattern="[0-9]*"
                 data-count="${d}" placeholder="0" aria-label="${d} 元目前數量" />
        </label>`;
    })
    .join('');
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
        const overTarget = Math.max(0, current[l.denom] - stockTargets[l.denom]);
        return `<tr>
        <td>${l.denom}</td>
        <td>${current[l.denom]}</td>
        <td>${stockTargets[l.denom]}</td>
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

  const conclusionEl = container.querySelector<HTMLElement>('[data-out="conclusion"]')!;
  const exchangeListEl = container.querySelector<HTMLElement>('[data-out="exchange-list"]')!;
  const exchangeTotalEl = container.querySelector<HTMLElement>('[data-out="exchange-total"]')!;
  const tableBodyEl = container.querySelector<HTMLElement>('[data-out="detail-body"]')!;

  function render(): void {
    const counts = readCounts(container);
    const result = goodExchange({ counts });
    const current = {} as Record<Denomination, number>;
    for (const d of denominations) current[d] = sanitizeCount(counts[d]);
    renderConclusion(conclusionEl, result);
    renderExchangeList(exchangeListEl, exchangeTotalEl, result);
    renderTable(tableBodyEl, result, current);
  }

  const onInput = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.count !== undefined) {
      const cleaned = target.value.replace(/\D/g, '');
      if (cleaned !== target.value) target.value = cleaned;
    }
    render();
  };
  container.addEventListener('input', onInput);

  render();

  return () => {
    container.removeEventListener('input', onInput);
  };
}
