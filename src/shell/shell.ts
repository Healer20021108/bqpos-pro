// 分頁殼層：負責畫出分頁列、依 hash 路由切換模組，並管理掛載／卸載生命週期。
// 殼層不認得任何特定功能，只透過 FeatureModule 介面操作，因此新增模組不需改這裡。

import type { FeatureModule } from '../core/types';
import { animateShellIn, animateModuleIn, animateTabActivate } from '../core/animate';
import './shell.css';

// 從網址 hash 解析出模組 id，例如 "#/exchange" → "exchange"。
function idFromHash(): string {
  const match = location.hash.match(/^#\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function createShell(root: HTMLElement, mods: FeatureModule[]): () => void {
  if (mods.length === 0) {
    root.innerHTML = '<p class="shell-empty">尚未註冊任何功能模組。</p>';
    return () => {};
  }

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <p class="stage-kicker">收銀現場 · 換錢決策台</p>
        <h1 class="stage-title">板橋KKPOS</h1>
        <span class="stage-rule" aria-hidden="true"></span>
      </header>
      <nav class="tab-bar" role="tablist" aria-label="功能分頁"></nav>
      <main class="app-main" id="module-root"></main>
    </div>`;

  const tabBar = root.querySelector<HTMLElement>('.tab-bar')!;
  const main = root.querySelector<HTMLElement>('#module-root')!;

  // 用 AbortController 統一綁定全域／分頁監聽器，卸載時一次移除，避免重複初始化時洩漏。
  const controller = new AbortController();
  const { signal } = controller;

  const buttons = new Map<string, HTMLButtonElement>();
  for (const mod of mods) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.textContent = mod.title;
    btn.setAttribute('role', 'tab');
    btn.dataset.id = mod.id;
    btn.addEventListener(
      'click',
      () => {
        location.hash = `#/${mod.id}`;
      },
      { signal },
    );
    tabBar.appendChild(btn);
    buttons.set(mod.id, btn);
  }

  let cleanup: (() => void) | undefined;
  let currentId: string | null = null;

  function activate(id: string): void {
    const mod = mods.find((m) => m.id === id) ?? mods[0];
    if (currentId === mod.id) return;

    // 卸載前一個模組。
    cleanup?.();
    cleanup = undefined;
    main.innerHTML = '';

    // 掛載新模組，保留它回傳的清理函式。
    const maybeCleanup = mod.mount(main);
    if (typeof maybeCleanup === 'function') cleanup = maybeCleanup;
    currentId = mod.id;

    // 更新分頁選取狀態。
    for (const [bid, btn] of buttons) {
      const selected = bid === mod.id;
      btn.setAttribute('aria-selected', String(selected));
      btn.classList.toggle('is-active', selected);
      if (selected) animateTabActivate(btn);
    }
    main.scrollTop = 0;

    // 純外觀：讓剛掛上的模組內容交錯進場（受保護的付款分頁區只淡入、不動排版）。
    animateModuleIn(main);
  }

  window.addEventListener(
    'hashchange',
    () => {
      const id = idFromHash();
      activate(id && buttons.has(id) ? id : mods[0].id);
    },
    { signal },
  );

  // 殼層進場動畫（標題＋分頁列），只在首次建立時跑一次。
  animateShellIn(root);

  // 初始進入：有合法 hash 就用它，否則正規化成第一個模組（用 replaceState 不產生多餘的歷史紀錄）。
  const initial = idFromHash();
  if (initial && buttons.has(initial)) {
    activate(initial);
  } else {
    history.replaceState(null, '', `#/${mods[0].id}`);
    activate(mods[0].id);
  }

  // 殼層卸載：移除所有監聽器並卸載目前模組。
  return () => {
    controller.abort();
    cleanup?.();
    cleanup = undefined;
    root.innerHTML = '';
  };
}
