// 檔案傳送邊界：支援原生分享、下載，以及日後接上的暫存連結服務。

export interface InventoryTransferResult {
  kind: 'shared' | 'downloaded' | 'temporary-link' | 'external-service';
  url?: string;
  expiresAt?: string;
}

export interface InventoryFileTransfer {
  id: string;
  label: string;
  isAvailable(): boolean;
  send(file: File): Promise<InventoryTransferResult>;
}

export interface InventoryTemporaryUpload {
  upload(file: File): Promise<{
    url: string;
    expiresAt?: string;
  }>;
}

export const WORMHOLE_URL = 'https://wormhole.app/';

function triggerDownload(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const nativeShareTransfer: InventoryFileTransfer = {
  id: 'native-share',
  label: '分享檔案',
  isAvailable: () => typeof navigator.share === 'function',
  async send(file) {
    if (typeof navigator.share !== 'function') {
      throw new Error('此瀏覽器不支援檔案分享。');
    }
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      throw new Error('此瀏覽器無法分享這個 Excel 檔案。');
    }

    await navigator.share({ files: [file], title: file.name });
    return { kind: 'shared' };
  },
};

export const browserDownloadTransfer: InventoryFileTransfer = {
  id: 'browser-download',
  label: '下載 Excel',
  isAvailable: () => typeof document !== 'undefined' && typeof URL.createObjectURL === 'function',
  async send(file) {
    triggerDownload(file);
    return { kind: 'downloaded' };
  },
};

/**
 * Wormhole 未提供公開上傳 API，因此使用官方支援的網頁流程：
 * 先下載剛產生的 Excel，再開啟 Wormhole 讓使用者選取該檔案並取得暫存連結。
 */
export const wormholeTransfer: InventoryFileTransfer = {
  id: 'wormhole',
  label: '使用 Wormhole 傳送',
  isAvailable: () =>
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof URL.createObjectURL === 'function',
  async send(file) {
    triggerDownload(file);

    const anchor = document.createElement('a');
    anchor.href = WORMHOLE_URL;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.click();

    return { kind: 'external-service', url: WORMHOLE_URL };
  },
};

export function createTemporaryLinkTransfer(
  provider: InventoryTemporaryUpload,
): InventoryFileTransfer {
  return {
    id: 'temporary-link',
    label: '建立暫存連結',
    isAvailable: () => true,
    async send(file) {
      const result = await provider.upload(file);
      return { kind: 'temporary-link', ...result };
    },
  };
}
