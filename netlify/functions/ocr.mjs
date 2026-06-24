// Google Cloud Vision 辨識代理（Netlify Function）。
// 前端把縮圖後的 base64 影像丟過來，這裡用「server 端環境變數」VISION_API_KEY 呼叫 Vision，
// 把原始回應原封不動轉回前端。金鑰只存在 Netlify 後台，永遠不會進前端 bundle。
//
// 設定方式（Netlify 後台或 CLI）：
//   netlify env:set VISION_API_KEY <你的金鑰>
// 端點：POST /.netlify/functions/ocr   body: { "image": "<base64,不含 data: 前綴>" }

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: '只接受 POST' }, 405);
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
    return json({ error: '連線 Vision API 失敗' }, 502);
  }

  // 原樣轉回 Vision 的回應（含 responses[]），前端用既有解析邏輯處理。
  const data = await upstream.json().catch(() => null);
  if (!data) return json({ error: 'Vision API 回應無法解析' }, 502);
  return json(data, upstream.ok ? 200 : upstream.status);
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
