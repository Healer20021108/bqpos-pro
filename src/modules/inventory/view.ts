// 盤點模組 UI：依每個品項開對應「盤點單位」輸入格 → 呼叫純函式即時換算 →
// 顯示盤點單位(H)與入庫最小單位(J) → 匯出填好範本的 Excel，並可下載或傳到電腦。
// 所有換算規則都在 calculate.ts / items.ts，本檔只負責讀輸入、渲染、匯出。

import { INVENTORY_ITEMS, fieldKey, type InventoryField, type InventoryItem } from './items';
import {
  computeInventory,
  toExcelCells,
  type InventoryResult,
  type ItemResult,
} from './calculate';
import { exportInventoryExcel, inventoryFileName } from './excel';
import {
  WORMHOLE_URL,
  browserDownloadTransfer,
  nativeShareTransfer,
  wormholeTransfer,
  type InventoryFileTransfer,
} from './transfer';
import { popInput } from '../../core/animate';
import './inventory.css';

const MEMORY_KEY = 'inventoryV1';

// ---- 純顯示小工具 --------------------------------------------------------

function trimNum(value: number, maxDp: number): string {
  const rounded = Number(value.toFixed(maxDp));
  return rounded.toLocaleString('zh-TW', { maximumFractionDigits: maxDp });
}

/** 欄位下方的換算提示，例如「1整包=200個」「填入整體克數・自動扣除瓶身136克」。 */
function fieldHint(item: InventoryItem, field: InventoryField): string {
  if (field.hint) return field.hint;
  if (field.kind === 'grams') {
    return field.tare === null
      ? '填入整體克數・瓶身重量待測'
      : `填入整體克數・自動扣除瓶身${field.tare}克`;
  }
  return field.factor === 1 ? `${item.smallestUnit}` : `1${field.label}=${field.factor}${item.smallestUnit}`;
}

// ---- 版面 ---------------------------------------------------------------

function fieldHtml(item: InventoryItem, field: InventoryField): string {
  const key = fieldKey(item, field);
  const inputMode = field.kind === 'grams' ? 'decimal' : 'numeric';
  const unit = field.kind === 'grams' ? '克' : field.label;
  return `
    <label class="inv-field">
      <span class="inv-field-top">
        <span class="inv-field-name">${field.label}</span>
        <span class="inv-field-unit">${unit}</span>
      </span>
      <input type="text" inputmode="${inputMode}" data-field="${key}" data-kind="${field.kind}"
             placeholder="0" aria-label="${item.name} ${field.label}" />
      <span class="inv-field-hint">${fieldHint(item, field)}</span>
    </label>`;
}

function itemCardHtml(item: InventoryItem): string {
  return `
    <article class="inv-card" data-item="${item.code}">
      <header class="inv-card-head">
        <span class="inv-code">${item.code}</span>
        <span class="inv-name">${item.name}</span>
        <span class="inv-pcode">${item.productCode}</span>
      </header>
      <div class="inv-fields">${item.fields.map((f) => fieldHtml(item, f)).join('')}</div>
      <div class="inv-card-out">
        <span class="inv-result" data-result="${item.code}">—</span>
        <span class="inv-pending" data-pending="${item.code}" hidden>⚠ 皮重待測（暫未扣重）</span>
      </div>
    </article>`;
}

const TEMPLATE = `
  <div class="inventory">
    <header class="inventory-head">
      <div class="inventory-title">盤點模組</div>
      <div class="inventory-sub">依各品項填入盤點單位，工具即時換算入庫量，並匯出填好的盤點表 Excel。</div>
    </header>

    <section class="card">
      <div class="card-heading-row">
        <h2>盤點輸入</h2>
        <button type="button" class="inv-clear-all" data-clear-all>清空全部</button>
      </div>
      <p class="hint">數字用實際數的量填：整包／小捆／個各自一格；醬料類「開封／分裝」填磅秤上的整體克數即可，工具會自動扣除瓶身重量換算。</p>
      <div class="inv-list">${INVENTORY_ITEMS.map(itemCardHtml).join('')}</div>
    </section>

    <section class="card">
      <h2>對照表（盤點單位 H｜入庫最小單位 J）</h2>
      <div class="table-scroll">
        <table class="inv-table">
          <thead>
            <tr><th>品項</th><th>盤點單位 H</th><th>入庫 J</th></tr>
          </thead>
          <tbody data-out="inv-table"></tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>匯出盤點表</h2>
      <p class="hint">匯出會套用固定範本、自動填上今天日期（民國）；未填的品項在表上留空。</p>
      <div class="inv-actions">
        <button type="button" class="inv-btn primary" data-export="download" disabled>下載 Excel</button>
        <button type="button" class="inv-btn" data-export="wormhole" disabled>傳到電腦（Wormhole）</button>
        <button type="button" class="inv-btn" data-export="share" disabled hidden>分享檔案</button>
      </div>
      <p class="inv-status" data-out="inv-status" role="status"></p>
    </section>
  </div>`;

// ---- 渲染與互動 ---------------------------------------------------------

function readRaw(container: HTMLElement): Record<string, string> {
  const raw: Record<string, string> = {};
  container.querySelectorAll<HTMLInputElement>('[data-field]').forEach((input) => {
    raw[input.dataset.field!] = input.value;
  });
  return raw;
}

function loadSaved(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function save(container: HTMLElement): void {
  try {
    const raw = readRaw(container);
    const kept = Object.fromEntries(Object.entries(raw).filter(([, v]) => v.trim() !== ''));
    localStorage.setItem(MEMORY_KEY, JSON.stringify(kept));
  } catch {
    /* localStorage 不可用時略過 */
  }
}

function resultText(row: ItemResult): string {
  if (!row.hasInput) return '—';
  const h = `${trimNum(row.displayQty, 3)} ${row.item.displayUnit}`;
  if (row.item.g === 1) return `= ${h}`;
  return `= ${h}（${trimNum(row.smallestTotal, 1)} ${row.item.smallestUnit}）`;
}

function renderResult(container: HTMLElement, result: InventoryResult): void {
  for (const row of result.items) {
    const out = container.querySelector<HTMLElement>(`[data-result="${row.item.code}"]`);
    if (out) {
      out.textContent = resultText(row);
      out.classList.toggle('is-filled', row.hasInput);
    }
    const pending = container.querySelector<HTMLElement>(`[data-pending="${row.item.code}"]`);
    if (pending) pending.hidden = !row.pendingTare;
  }

  const tbody = container.querySelector<HTMLElement>('[data-out="inv-table"]');
  if (tbody) {
    tbody.innerHTML = result.items
      .map((row) => {
        const h = row.hasInput ? `${trimNum(row.displayQty, 3)} ${row.item.displayUnit}` : '—';
        const j = row.hasInput ? `${trimNum(row.smallestTotal, 1)} ${row.item.smallestUnit}` : '—';
        const flag = row.pendingTare ? ' <span class="inv-flag">待測</span>' : '';
        return `<tr data-filled="${row.hasInput}">
          <td><span class="inv-tcode">${row.item.code}</span>${row.item.name}${flag}</td>
          <td>${h}</td>
          <td>${j}</td>
        </tr>`;
      })
      .join('');
  }
}

export function renderInventory(container: HTMLElement): () => void {
  container.innerHTML = TEMPLATE;

  // 還原上次輸入。
  const saved = loadSaved();
  for (const [key, value] of Object.entries(saved)) {
    const input = container.querySelector<HTMLInputElement>(`[data-field="${key}"]`);
    if (input) input.value = value;
  }

  const statusEl = container.querySelector<HTMLElement>('[data-out="inv-status"]')!;
  const exportBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-export]'));
  const shareBtn = container.querySelector<HTMLButtonElement>('[data-export="share"]')!;
  if (nativeShareTransfer.isAvailable()) shareBtn.hidden = false;

  let latest: InventoryResult = computeInventory(readRaw(container));

  function render(): void {
    latest = computeInventory(readRaw(container));
    renderResult(container, latest);
    const anyInput = latest.items.some((row) => row.hasInput);
    for (const btn of exportBtns) {
      if (btn === shareBtn && shareBtn.hidden) continue;
      btn.disabled = !anyInput;
    }
  }

  function setStatus(text: string, kind: 'ok' | 'error' | 'busy' | '' = ''): void {
    statusEl.textContent = text;
    statusEl.className = `inv-status${kind ? ` ${kind}` : ''}`;
  }

  async function runExport(transfer: InventoryFileTransfer): Promise<void> {
    for (const btn of exportBtns) btn.disabled = true;
    setStatus('產生 Excel 中…', 'busy');
    try {
      const now = new Date();
      const cells = toExcelCells(computeInventory(readRaw(container)), now);
      const file = await exportInventoryExcel(cells, inventoryFileName(now));
      const outcome = await transfer.send(file);
      if (outcome.kind === 'downloaded') {
        setStatus(`已下載「${file.name}」。`, 'ok');
      } else if (outcome.kind === 'shared') {
        setStatus('已開啟分享。', 'ok');
      } else if (outcome.kind === 'external-service') {
        statusEl.className = 'inv-status ok';
        statusEl.innerHTML = `已下載並開啟 Wormhole；若沒自動跳出，<a href="${WORMHOLE_URL}" target="_blank" rel="noopener noreferrer">點這裡開啟</a>，再把剛下載的檔案拖進去。`;
      } else {
        setStatus('完成。', 'ok');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '匯出失敗，請再試一次。', 'error');
    } finally {
      render();
    }
  }

  // ---- 事件 ----
  const onInput = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.field === undefined) return;
    const kind = target.dataset.kind;
    const before = target.value;
    // count 只留數字；grams 允許一個小數點。
    const cleaned =
      kind === 'grams'
        ? target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
        : target.value.replace(/\D/g, '');
    if (cleaned !== before) target.value = cleaned;
    if (before.trim() === '' && cleaned.trim() !== '') popInput(target);
    render();
    save(container);
  };

  const onClick = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest('[data-clear-all]')) {
      const inputs = container.querySelectorAll<HTMLInputElement>('[data-field]');
      const hasAny = Array.from(inputs).some((i) => i.value.trim() !== '');
      if (!hasAny || !confirm('清空所有盤點輸入？')) return;
      inputs.forEach((i) => (i.value = ''));
      setStatus('');
      render();
      save(container);
      return;
    }

    const exportBtn = target.closest<HTMLButtonElement>('[data-export]');
    if (!exportBtn || exportBtn.disabled) return;
    const which = exportBtn.dataset.export;
    if (which === 'download') void runExport(browserDownloadTransfer);
    else if (which === 'wormhole') void runExport(wormholeTransfer);
    else if (which === 'share') void runExport(nativeShareTransfer);
  };

  container.addEventListener('input', onInput);
  container.addEventListener('click', onClick);

  render();

  return () => {
    container.removeEventListener('input', onInput);
    container.removeEventListener('click', onClick);
  };
}
