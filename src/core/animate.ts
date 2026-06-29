// 共用動畫層：以 GSAP 做進場與互動回饋，純屬「外觀美化」，不參與任何計算或狀態邏輯。
// 由殼層（shell）在掛載／切換分頁時呼叫；功能模組可選用 pulse／pop 做結果與輸入的微回饋。
//
// 設計語彙：電影敘事——開場標題升起、各區塊像分鏡依序入場、互動有明確意圖的微動態。
// 動態收斂、節奏明快（多在 0.3–0.5s），現場工作不被拖慢。
//
// 重要約束：雙POS對帳的「付款方式分頁」區（.payment-pages 及其 section）排版不可被更動。
// 因此凡是包含 .payment-pages 的區塊，一律只做透明度淡入（不位移、不縮放、不留任何 inline 樣式），
// opacity 不影響版面，橫向分頁的 flex／scroll-snap 排版自始至終維持原樣。

import { gsap } from 'gsap';

// 尊重使用者的「減少動態效果」系統設定（前庭功能敏感者）。符合時直接略過所有動畫。
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// 區塊內若含橫向分頁，視為受保護區：只能淡入，不可施加任何 transform，
// 以免擾動 scroll-snap 的初始排版。涵蓋對帳 .payment-pages 與環球清帳 .uv-pages。
function isProtectedBlock(el: Element): boolean {
  return (
    el.matches('.rows') ||
    el.querySelector('.payment-pages') !== null ||
    el.querySelector('.uv-pages') !== null
  );
}

/** 殼層開場：分頁列像片頭字卡依序落下入場。 */
export function animateShellIn(root: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const tabs = root.querySelectorAll('.tab-bar .tab');
  if (!tabs.length) return;
  gsap.from(tabs, {
    autoAlpha: 0,
    y: -10,
    duration: 0.4,
    ease: 'power3.out',
    stagger: 0.07,
    clearProps: 'opacity,visibility,transform',
  });
}

/**
 * 分頁內容進場：把模組頂層的各區塊像分鏡依序淡入、輕微上移並去除微模糊。
 * 換錢模組頂層即為多張 .card；對帳模組頂層只有一個 .rc 殼，因此改取其子層做交錯。
 */
export function animateModuleIn(main: HTMLElement): void {
  if (prefersReducedMotion()) return;

  const direct = Array.from(main.children) as HTMLElement[];
  const blocks =
    direct.length === 1 && direct[0].children.length > 1
      ? (Array.from(direct[0].children) as HTMLElement[])
      : direct;
  if (!blocks.length) return;

  gsap.killTweensOf(blocks);
  gsap.from(blocks, {
    autoAlpha: 0,
    // 受保護的付款分頁區塊位移與模糊量為 0（只淡入），其餘區塊上移帶出層次。
    y: (_i, target) => (isProtectedBlock(target as Element) ? 0 : 18),
    filter: (_i, target) => (isProtectedBlock(target as Element) ? 'blur(0px)' : 'blur(6px)'),
    duration: 0.5,
    ease: 'power3.out',
    stagger: 0.06,
    // 動畫結束後清掉 inline 樣式，交還給原本的 CSS，受保護區也不殘留任何痕跡。
    clearProps: 'opacity,visibility,transform,filter',
  });
}

/** 分頁切換回饋：剛選取的分頁鈕做一個快速的回彈縮放。 */
export function animateTabActivate(btn: HTMLElement): void {
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    btn,
    { scale: 0.9 },
    { scale: 1, duration: 0.38, ease: 'back.out(2.4)', clearProps: 'transform' },
  );
}

/**
 * 結果強調：當結論／合計等關鍵字句更新時，做一次明確但短促的高亮脈動，
 * 讓現場一眼注意到「數字變了」。純外觀，不改任何文字內容。
 */
export function pulseElement(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 0.985, filter: 'brightness(1.18)' },
    { scale: 1, filter: 'brightness(1)', duration: 0.45, ease: 'power2.out', clearProps: 'transform,filter' },
  );
}

/** 輸入填入回饋：剛被填上數字的欄位輕輕彈一下，配合「醒目外框」更顯眼。 */
export function popInput(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 0.94 },
    { scale: 1, duration: 0.32, ease: 'back.out(3)', clearProps: 'transform' },
  );
}
