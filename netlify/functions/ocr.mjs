// Google Cloud Vision 辨識代理（Netlify Function）。
// 前端把縮圖後的 base64 影像丟過來，這裡用「server 端環境變數」VISION_API_KEY 呼叫 Vision，
// 把原始回應原封不動轉回前端。金鑰只存在 Netlify 後台，永遠不會進前端 bundle。
//
// 設定方式（Netlify 後台或 CLI）：
//   netlify env:set VISION_API_KEY <你的金鑰>
// 端點：POST /api/ocr   body: { "image": "<base64,不含 data: 前綴>" }

import { Redis } from '@upstash/redis';
import {
  OCR_DAILY_LIMIT,
  OCR_WEEKLY_LIMIT,
  releaseOcrQuota,
  reserveOcrQuota,
} from './ocr-quota.ts';

const MAX_REQUEST_BYTES = 4_000_000;
const MAX_BASE64_CHARS = 3_000_000;

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: '只接受 POST' }, 405);
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.startsWith('application/json')) {
    return json({ error: '只接受 JSON 格式' }, 415);
  }
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: '圖片資料過大' }, 413);
  }

  const key = process.env.VISION_API_KEY;
  if (!key) {
    return json({ error: '伺服器未設定 VISION_API_KEY' }, 500);
  }

  let image;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: '請求格式錯誤（需要 JSON）' }, 400);
  }
  if (!image || typeof image !== 'string') {
    return json({ error: '缺少 image（base64 字串）' }, 400);
  }
  if (image.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    return json({ error: '圖片格式錯誤或資料過大' }, 413);
  }

  let redis;
  let reservation;
  try {
    redis = Redis.fromEnv();
    reservation = await reserveOcrQuota(redis);
  } catch {
    // 額度服務失效時採 fail-closed，避免繞過限制直接產生 Vision 費用。
    return json({ error: 'OCR 額度服務暫時無法使用，請稍後再試' }, 503);
  }
  if (!reservation.quota.allowed) {
    const error =
      reservation.quota.reason === 'daily'
        ? `今日 OCR ${OCR_DAILY_LIMIT} 次額度已用完，明日 00:00 重新開放。`
        : `本週 OCR ${OCR_WEEKLY_LIMIT} 次額度已用完，下週一 00:00 重新開放。`;
    return json({ error, quota: publicQuota(reservation.quota) }, 429);
  }

  let upstream;
  try {
    upstream = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['zh-Hant', 'en'] },
          },
        ],
      }),
    });
  } catch {
    await releaseOcrQuota(redis, reservation.window).catch(() => {});
    return json({ error: '連線 Vision API 失敗' }, 502);
  }

  // 原樣轉回 Vision 的回應（含 responses[]），前端用既有解析邏輯處理。
  const data = await upstream.json().catch(() => null);
  if (!data) {
    await releaseOcrQuota(redis, reservation.window).catch(() => {});
    return json({ error: 'Vision API 回應無法解析' }, 502);
  }
  if (!upstream.ok) {
    await releaseOcrQuota(redis, reservation.window).catch(() => {});
    return json(data, upstream.status);
  }
  if (data.responses?.some((response) => response?.error)) {
    await releaseOcrQuota(redis, reservation.window).catch(() => {});
    return json(data, 200);
  }
  return json({ ...data, quota: publicQuota(reservation.quota) }, 200);
};

export const config = {
  path: '/api/ocr',
};

function publicQuota(quota) {
  return {
    dailyLimit: OCR_DAILY_LIMIT,
    weeklyLimit: OCR_WEEKLY_LIMIT,
    dailyRemaining: quota.dailyRemaining,
    weeklyRemaining: quota.weeklyRemaining,
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
