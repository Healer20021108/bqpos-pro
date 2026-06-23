// 跨模組共用型別。

export type Denomination = 500 | 100 | 50 | 10 | 5 | 1;

export type TodayMode = 'weekday' | 'weekend' | 'full';
export type ExchangeMode = 'exact' | 'rounded';

/**
 * 功能模組對外的契約。殼層（shell）只認得這個介面，
 * 因此任何功能都能以同樣方式被掛載、切換、卸載，互不影響。
 */
export interface FeatureModule {
  /** 路由與識別用，需唯一，例如 'exchange'。 */
  id: string;
  /** 分頁顯示名稱。 */
  title: string;
  /**
   * 把模組畫進指定容器。
   * 可回傳一個清理函式；切換到別的分頁時，殼層會呼叫它做卸載（移除監聽器等）。
   */
  mount(container: HTMLElement): void | (() => void);
}
