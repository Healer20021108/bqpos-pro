#!/bin/bash
# POS 換錢決策器 — 一鍵啟動
# macOS 使用者可直接「雙擊」這個檔案，會自動開啟終端機並啟動開發伺服器。
# 啟動後會顯示：
#   - Local：本機網址（電腦用）
#   - Network：區網網址（手機用，需同一個 Wi-Fi）
#   - 一個 QR Code：手機相機掃碼即可開啟

cd "$(dirname "$0")" || exit 1

echo "==============================================="
echo "  POS 換錢決策器 — 啟動中"
echo "==============================================="

# 沒裝過相依就先安裝（第一次啟動會比較久）。
if [ ! -d node_modules ]; then
  echo "首次啟動，正在安裝相依套件..."
  npm install || { echo "安裝失敗，請確認已安裝 Node.js"; exit 1; }
fi

echo ""
echo "伺服器啟動後："
echo "  電腦：用下方 Local 網址開啟"
echo "  手機：與電腦連同一個 Wi-Fi，掃下方 QR Code（或輸入 Network 網址）"
echo "  要停止：在這個視窗按 Ctrl + C"
echo ""

npm run start
