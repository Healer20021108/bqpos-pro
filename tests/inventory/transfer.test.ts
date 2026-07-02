import { describe, expect, test } from 'vitest';
import {
  WORMHOLE_URL,
  wormholeTransfer,
} from '../../src/modules/inventory/transfer';

describe('盤點模組 Wormhole 傳送接口', () => {
  test('固定使用 Wormhole 官方 HTTPS 網址', () => {
    expect(WORMHOLE_URL).toBe('https://wormhole.app/');
    expect(wormholeTransfer.id).toBe('wormhole');
    expect(wormholeTransfer.label).toContain('Wormhole');
  });

  test('非瀏覽器環境不宣告可用', () => {
    expect(wormholeTransfer.isAvailable()).toBe(false);
  });
});
