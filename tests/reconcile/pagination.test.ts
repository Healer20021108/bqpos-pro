import { describe, expect, test } from 'vitest';

import { PAYMENT_GROUPS } from '../../src/modules/reconcile/data';
import { paginate } from '../../src/modules/reconcile/pagination';

describe('付款方式直列分頁', () => {
  test('百貨 POS 依原順序每 11 項切成 8 頁', () => {
    const pages = paginate(PAYMENT_GROUPS.dept, 11);

    expect(pages.map((page) => page.length)).toEqual([11, 11, 11, 11, 11, 11, 11, 1]);
    expect(pages.map((page) => page[0]?.label)).toEqual([
      '現金',
      'Imall折抵',
      '街口幣折抵',
      '一卡通MONEY',
      '振興券',
      '應收一直播',
      '享樂券',
      '全盈+PAY',
    ]);
    expect(pages.map((page) => page.at(-1)?.label)).toEqual([
      '會員折價券',
      '街口支付',
      'LINEPay',
      '橘子支付',
      '應收五EC已',
      '點數付款',
      '簡單付',
      '全盈+PAY',
    ]);
  });

  test('公司 POS 也以相同規則直列分頁', () => {
    expect(paginate(PAYMENT_GROUPS.company, 11).map((page) => page.length)).toEqual([11, 11, 1]);
  });

  test('拒絕無效頁面大小', () => {
    expect(() => paginate([1, 2], 0)).toThrow(RangeError);
  });
});
