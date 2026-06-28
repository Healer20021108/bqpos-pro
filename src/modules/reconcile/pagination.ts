/** 將付款方式依 POS 畫面順序切成固定大小的橫向頁面。 */
export function paginate<T>(items: readonly T[], pageSize = 11): T[][] {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('pageSize must be a positive integer');
  }

  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += pageSize) {
    pages.push(items.slice(start, start + pageSize));
  }
  return pages;
}
