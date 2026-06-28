// 共用動畫層：以 GSAP 做進場與分頁回饋，純屬「外觀美化」，不參與任何計算或狀態邏輯。
// 由殼層（shell）在掛載／切換分頁時呼叫；功能模組本身不需要知道動畫的存在。
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

// 區塊內若含付款分頁，視為受保護區：只能淡入，不可施加任何 transform。
function isProtectedBlock(el: Element): boolean {
  return el.matches('.rows') || el.querySelector('.payment-pages') !== null;
}

/** 殼層進場：標題與分頁列由上輕輕落下並淡入。 */
export function animateShellIn(root: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const header = root.querySelector('.app-header');
  const tabs = root.querySelectorAll('.tab-bar .tab');
  const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
  if (header) tl.from(header, { autoAlpha: 0, y: -12, duration: 0.4 });
  if (tabs.length) {
    tl.from(tabs, { autoAlpha: 0, y: -8, duration: 0.35, stagger: 0.06 }, '-=0.2');
  }
}

/**
 * 分頁內容進場：把模組頂層的各區塊依序淡入並輕微上移。
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
    // 受保護的付款分頁區塊位移量為 0（只淡入），其餘區塊上移 14px 帶出層次。
    y: (_i, target) => (isProtectedBlock(target as Element) ? 0 : 14),
    duration: 0.4,
    ease: 'power2.out',
    stagger: 0.05,
    // 動畫結束後清掉 inline 樣式，交還給原本的 CSS，受保護區也不殘留任何痕跡。
    clearProps: 'opacity,visibility,transform',
  });
}

/** 分頁切換回饋：剛選取的分頁鈕做一個快速的回彈縮放。 */
export function animateTabActivate(btn: HTMLElement): void {
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    btn,
    { scale: 0.92 },
    { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' },
  );
}
