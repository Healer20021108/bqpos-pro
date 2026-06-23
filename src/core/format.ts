// 共用格式化工具。

const ntFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

/** 以新台幣格式顯示金額，例如 1000 → NT$1,000。 */
export function formatNT(amount: number): string {
  return ntFormatter.format(amount);
}
