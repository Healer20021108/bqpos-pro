/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Cloud Vision API 金鑰，來自 .env（見 reconcile 模組 OCR）。 */
  readonly VITE_VISION_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
