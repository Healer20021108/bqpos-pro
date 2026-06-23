// 換錢模組的 UI 層：只負責讀輸入、呼叫純函式、把結果轉成現場看得懂的文字與表格。
// 不在此處放計算規則，所有計算都來自 calculate.ts。

import { denominations, unitLabel } from '../../core/rules';
import { formatNT } from '../../core/format';
import type { Denomination, TodayMode, ExchangeMode } from '../../core/types';
import {
  calculateAll,
  type CalculationResult,
  type DenominationResult,
} from './calculate';
import './exchange.css';

const modeLabels: Record<TodayMode, string> = {
  weekday: '平日',
  weekend: '假日',
  full: '完整整理',
};

type TextState = 'ok' | 'mid' | 'need';
interface StatefulText {
  state: TextState;
  text: string;
}

const TEMPLATE = `
  <section class="card">
    <h2>今日模式</h2>
    <div class="seg" role="radiogroup" aria-label="今日模式">
      <label><input type="radio" name="mode" value="weekday" checked /><span>平日</span></label>
      <label><input type="radio" name="mode" value="weekend" /><span>假日</span></label>
      <label><input type="radio" name="mode" value="full" /><span>完整整理</span></label>
    </div>
    <h2 class="mt">換錢模式</h2>
    <div class="seg" role="radiogroup" aria-label="換錢模式">
      <label><input type="radio" name="exchange" value="exact" checked /><span>精準</span></label>
      <label><input type="radio" name="exchange" value="rounded" /><span>好換</span></label>
    </div>
  </section>

  <section class="card">
    <h2>POS 機目前數量</h2>
    <div class="denoms" data-inputs="pos"></div>
  </section>

  <section class="card">
    <h2>預備金目前數量</h2>
    <div class="denoms" data-inputs="reserve"></div>
  </section>

  <section class="card">
    <h2>今日結論</h2>
    <p class="conclusion ok" data-out="conclusion">請輸入數量。</p>
  </section>

  <section class="card">
    <h2>POS 機調整建議</h2>
    <ul class="result-list" data-out="pos-list"></ul>
  </section>

  <section class="card">
    <h2>預備金硬規則檢查</h2>
    <ul class="result-list" data-out="reserve-list"></ul>
  </section>

  <section class="card">
    <h2>外部換錢清單</h2>
    <ul class="result-list" data-out="external-list"></ul>
    <p class="total" data-out="external-total"></p>
  </section>

  <section class="card">
    <h2>明細表</h2>
    <div class="table-scroll">
      <table class="detail">
        <thead>
          <tr>
            <th>面額</th><th>POS 目前</th><th>POS 需補</th><th>預備金目前</th>
            <th>補後預備金</th><th>預備金目標</th><th>外部需補</th><th>建議換錢</th>
          </tr>
        </thead>
        <tbody data-out="detail-body"></tbody>
      </table>
    </div>
  </section>

  <p class="unit-note">單位：500／100 為「張」，50／10／5／1 為「個」。預備金硬標準合計 10,000 元。</p>
`;

// ---- 讀寫輸入（皆以 container 為範圍，避免模組之間互相干擾） ----------

function buildInputs(wrap: HTMLElement, prefix: 'pos' | 'reserve'): void {
  wrap.innerHTML = denominations
    .map((d) => {
      const u = unitLabel(d);
      return `
        <label class="denom-row">
          <span class="denom-name">${d} 元 <small>（${u}）</small></span>
          <input type="number" inputmode="numeric" min="0" step="1"
                 data-${prefix}="${d}" placeholder="0" aria-label="${d} 元目前數量" />
        </label>`;
    })
    .join('');
}

function readCounts(
  container: HTMLElement,
  prefix: 'pos' | 'reserve',
): Partial<Record<Denomination, string>> {
  const obj: Partial<Record<Denomination, string>> = {};
  for (const d of denominations) {
    const input = container.querySelector<HTMLInputElement>(`[data-${prefix}="${d}"]`);
    obj[d] = input?.value ?? '';
  }
  return obj;
}

function getMode(container: HTMLElement): TodayMode {
  const el = container.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return (el?.value as TodayMode) ?? 'weekday';
}

function getExchangeMode(container: HTMLElement): ExchangeMode {
  const el = container.querySelector<HTMLInputElement>('input[name="exchange"]:checked');
  return (el?.value as ExchangeMode) ?? 'exact';
}

// ---- 文字產生（現場指令語氣） ------------------------------------------

function posText(line: DenominationResult, mode: TodayMode): StatefulText {
  const { denom, unit, posCurrent, safe, recommended, actualTransferFromReserve, posRemainingNeed, posTransfer } = line;

  if (posTransfer > 0) {
    const threshold = mode === 'weekday' ? safe : recommended;
    const thresholdName = mode === 'weekday' ? '安全量' : '建議量';
    let text = `${denom} 元目前 ${posCurrent} ${unit}，低於${modeLabels[mode]}${thresholdName} ${threshold} ${unit}。`;
    if (actualTransferFromReserve > 0) {
      text += `建議從預備金補 ${actualTransferFromReserve} ${unit}，使 POS 回到建議量 ${recommended} ${unit}。`;
    }
    if (posRemainingNeed > 0) {
      text += `預備金同面額不足，外部需直接補 POS ${posRemainingNeed} ${unit}。`;
    }
    return { state: 'need', text };
  }

  if (posCurrent >= recommended) {
    return { state: 'ok', text: `${denom} 元目前 ${posCurrent} ${unit}，充足（建議量 ${recommended} ${unit}）。` };
  }

  // 走到這裡只可能是平日模式、介於安全量與建議量之間。
  return {
    state: 'mid',
    text: `${denom} 元目前 ${posCurrent} ${unit}，高於安全量 ${safe} ${unit} 但低於建議量 ${recommended} ${unit}。${modeLabels[mode]}模式下不強制補。`,
  };
}

function reserveText(line: DenominationResult): StatefulText {
  const { denom, unit, reserveCurrent, reserveTarget, reserveAfterTransfer, actualTransferFromReserve, reserveNeed } = line;

  if (reserveNeed > 0) {
    if (actualTransferFromReserve > 0) {
      return {
        state: 'need',
        text: `預備金 ${denom} 元原本 ${reserveCurrent} ${unit}，補 POS ${actualTransferFromReserve} ${unit} 後剩 ${reserveAfterTransfer} ${unit}。硬規則需要 ${reserveTarget} ${unit}，外部需補 ${reserveNeed} ${unit}。`,
      };
    }
    return {
      state: 'need',
      text: `預備金 ${denom} 元目前 ${reserveCurrent} ${unit}，低於硬規則 ${reserveTarget} ${unit}，外部需補 ${reserveNeed} ${unit}。`,
    };
  }

  if (reserveAfterTransfer > reserveTarget) {
    const extra = reserveAfterTransfer - reserveTarget;
    return {
      state: 'ok',
      text: `預備金 ${denom} 元為 ${reserveAfterTransfer} ${unit}，高於硬規則 ${reserveTarget} ${unit}（多 ${extra} ${unit}），可接受不必處理。`,
    };
  }

  return { state: 'ok', text: `預備金 ${denom} 元 ${reserveAfterTransfer} ${unit}，符合硬規則。` };
}

function externalText(line: DenominationResult, exchangeMode: ExchangeMode): string | null {
  if (exchangeMode === 'exact') {
    if (line.externalNeed <= 0) return null;
    return `${line.denom} 元 ${line.externalNeed} ${line.unit} = ${formatNT(line.externalNeed * line.denom)}`;
  }
  // 好換模式
  if (line.exchangeCount <= 0) return null;
  if (line.roundedExtra > 0) {
    return `${line.denom} 元缺 ${line.externalNeed} ${line.unit}，建議換 ${line.exchangeCount} ${line.unit} = ${formatNT(line.amount)}。多出 ${line.roundedExtra} ${line.unit} 放入預備金。`;
  }
  return `${line.denom} 元 ${line.exchangeCount} ${line.unit} = ${formatNT(line.amount)}`;
}

// ---- 渲染 ---------------------------------------------------------------

function renderConclusion(el: HTMLElement, result: CalculationResult): void {
  if (!result.needsExchange) {
    el.className = 'conclusion ok';
    el.textContent = '今日建議：不需要外部換錢，POS 與預備金皆可維持正常運作。';
    return;
  }
  el.className = 'conclusion need';
  let text = `今日建議：需要外部換錢 ${formatNT(result.externalAmount)}。`;
  if (result.exchangeMode === 'rounded' && result.externalAmount !== result.exactAmount) {
    text += `（精準缺口 ${formatNT(result.exactAmount)}，已依好換單位進位。）`;
  }
  el.textContent = text;
}

function renderList(el: HTMLElement, items: StatefulText[], emptyText: string): void {
  if (items.length === 0) {
    el.innerHTML = `<li class="muted">${emptyText}</li>`;
    return;
  }
  el.innerHTML = items.map((i) => `<li class="state-${i.state}">${i.text}</li>`).join('');
}

function renderExternal(listEl: HTMLElement, totalEl: HTMLElement, result: CalculationResult): void {
  const items = result.lines
    .map((l) => externalText(l, result.exchangeMode))
    .filter((t): t is string => t !== null);

  if (items.length === 0) {
    listEl.innerHTML = '<li class="muted">今日不需要外部換錢。</li>';
    totalEl.textContent = '';
    return;
  }
  listEl.innerHTML = items.map((t) => `<li>${t}</li>`).join('');
  totalEl.textContent = `合計：${formatNT(result.externalAmount)}`;
}

function renderTable(tbody: HTMLElement, result: CalculationResult): void {
  tbody.innerHTML = result.lines
    .map((l) => {
      const exchangeCell =
        l.exchangeCount > 0
          ? `${l.exchangeCount} ${l.unit}${l.roundedExtra > 0 ? `（多 ${l.roundedExtra}）` : ''}`
          : '－';
      return `<tr>
        <td>${l.denom}</td>
        <td>${l.posCurrent}</td>
        <td>${l.posTransfer || '－'}</td>
        <td>${l.reserveCurrent}</td>
        <td>${l.reserveAfterTransfer}</td>
        <td>${l.reserveTarget}</td>
        <td>${l.externalNeed || '－'}</td>
        <td>${exchangeCell}</td>
      </tr>`;
    })
    .join('');
}

/**
 * 把換錢工具畫進 container，並回傳卸載用的清理函式。
 * 監聽器都掛在 container 上（事件委派），切換分頁時一併移除，不污染 document。
 */
export function renderExchange(container: HTMLElement): () => void {
  container.innerHTML = TEMPLATE;

  buildInputs(container.querySelector<HTMLElement>('[data-inputs="pos"]')!, 'pos');
  buildInputs(container.querySelector<HTMLElement>('[data-inputs="reserve"]')!, 'reserve');

  const conclusionEl = container.querySelector<HTMLElement>('[data-out="conclusion"]')!;
  const posListEl = container.querySelector<HTMLElement>('[data-out="pos-list"]')!;
  const reserveListEl = container.querySelector<HTMLElement>('[data-out="reserve-list"]')!;
  const externalListEl = container.querySelector<HTMLElement>('[data-out="external-list"]')!;
  const externalTotalEl = container.querySelector<HTMLElement>('[data-out="external-total"]')!;
  const tableBodyEl = container.querySelector<HTMLElement>('[data-out="detail-body"]')!;

  function render(): void {
    const result = calculateAll({
      mode: getMode(container),
      exchangeMode: getExchangeMode(container),
      pos: readCounts(container, 'pos'),
      reserve: readCounts(container, 'reserve'),
    });

    renderConclusion(conclusionEl, result);
    renderList(posListEl, result.lines.map((l) => posText(l, result.mode)), '無資料。');
    renderList(reserveListEl, result.lines.map((l) => reserveText(l)), '無資料。');
    renderExternal(externalListEl, externalTotalEl, result);
    renderTable(tableBodyEl, result);
  }

  const onInput = (e: Event): void => {
    if ((e.target as HTMLElement).matches('input')) render();
  };
  const onChange = (e: Event): void => {
    if ((e.target as HTMLElement).matches('input[name="mode"], input[name="exchange"]')) render();
  };
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);

  render();

  return () => {
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
  };
}
