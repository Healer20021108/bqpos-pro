/**
 * ocrFill.js
 * --------------------------------------------------------------------------
 * 用 Google Cloud Vision API（DOCUMENT_TEXT_DETECTION）辨識固定格式的對帳表單照片
 * （收據 / POS 螢幕拍照皆可），自動比對已知欄位標籤、擷取數值，
 * 並提供「人工複核後才套用」的安全機制。
 *
 * 設計重點（為什麼這樣寫）：
 * 1. 解析邏輯完全不依賴任何特定程式的欄位名稱 —— 純粹是「把一列文字切成
 *    [標籤][數字][標籤][數字]...再去比對字典」，所以可以套用在任何固定格式報表上。
 * 2. 支援一次丟「多張照片」並自動合併 —— 因為實務上一次對帳常常要翻頁拍好幾張，
 *    同一欄位如果在不同照片讀到不同數值，會列成「衝突」讓你決定，不會自己亂選。
 * 3. 辨識不到字典裡的標籤，不會被丟掉，會放進「未對應欄位」給你看，方便之後擴充字典。
 * 4. 辨識結果絕對不會直接寫入你的系統，一定要你按「套用」才會觸發回呼。
 *
 * 使用方式：見檔案最後的「對外主函式」與整合範例。
 * --------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ==========================================================================
  // ① 設定區
  // ==========================================================================
  const CONFIG = {
    // ⚠️ 安全性提醒：純前端架構沒有後端可以藏這把 Key，它會出現在瀏覽器原始碼裡。
    // 務必到 Google Cloud Console → API 和服務 → 憑證 → 這把金鑰 → 應用程式限制，
    // 設成「HTTP 連結網域」只允許你自己的網域呼叫，並設定每日配額上限（例如 100 次/天）。
    apiKey: 'YOUR_GOOGLE_VISION_API_KEY',

    // 上傳前縮圖的長邊上限（像素）。手機拍照常常 6~8MB，Vision API 不需要這麼大張，
    // 縮小可以加快上傳速度、省行動網路流量，對辨識率幾乎沒有影響。
    maxImageDimension: 1600,

    // 同一視覺列裡，字元的中心 y 座標差距在「該列文字平均高度 × 這個倍率」之內，
    // 視為同一列。用比例而不是固定像素，才能自動適應不同解析度的照片。
    lineClusterTolerance: 0.6,

    // 低於這個信心值的擷取結果，複核畫面會標示警告，提醒人工確認。
    confidenceWarningThreshold: 0.85,
  };

  // ==========================================================================
  // ② 欄位標籤字典
  // --------------------------------------------------------------------------
  // 直接依照你實際拍到的 6 張照片（收據 + POS 螢幕「單機銷售查詢」5 頁）逐字核對整理。
  // 排序原則：「比較精確/比較長」的別名要排在「比較籠統/比較短」的前面，
  // 例如「離線信用卡」要排在「信用卡」前面 —— 否則「信用卡」這個籠統別名
  // 會搶先比對到「離線信用卡」這一列（因為它本來就包含「信用卡」三個字）。
  // 之後遇到新標籤，直接在對應分類加一行就好。
  // ==========================================================================
  const LABEL_MAPS = {
    // 百貨POS —— 78項，已用真實照片核對過。
    dept: [
    // --- 現金（注意：含「現金」兩字的更長標籤要排在純「現金」前面，否則會被搶） ---
    { key: 'cash_voucher', aliases: ['現金禮券'] },
    { key: 'e_cash_voucher', aliases: ['電子現金券'] },
    { key: 'cash', aliases: ['現金'] },

    // --- 信用卡（注意排序：離線要排在信用卡前面，否則「信用卡」這個籠統別名
    //     會搶先比對到「離線信用卡」這一列，因為它本來就包含「信用卡」三個字） ---
    { key: 'credit_card_offline', aliases: ['離線信用卡'] },
    { key: 'credit_card', aliases: ['連線信用卡', '信用卡'] }, // 「信用卡」是收據格式才會出現的籠統寫法

    // --- 禮券 / 折抵類 ---
    { key: 'product_voucher', aliases: ['商品禮券'] },
    { key: 'receivable_amount', aliases: ['應收帳款'] },
    { key: 'product_substitute_voucher', aliases: ['商代用券'] },
    { key: 'bonus_offset', aliases: ['紅利抵扣'] },
    { key: 'cash_substitute_voucher', aliases: ['現代用券'] },
    { key: 'store_own_voucher', aliases: ['專櫃自有券'] },
    { key: 'member_discount_voucher', aliases: ['會員折價券'] },
    { key: 'imall_discount', aliases: ['Imall折抵'] },
    { key: 'balance_voucher', aliases: ['餘額券'] },
    { key: 'sodexo_product', aliases: ['索迪斯商品'] },
    { key: 'sodexo_substitute', aliases: ['索迪斯代用'] },
    { key: 'sodexo_balance', aliases: ['索迪斯餘額'] },
    { key: 'citi_direct_pay', aliases: ['中信直接付'] },
    { key: 'citi_wechat', aliases: ['中信微信'] },
    { key: 'app_discount_voucher', aliases: ['APP折價券'] },
    { key: 'citi_line', aliases: ['中信LINE'] },
    { key: 'line_bonus', aliases: ['LINE紅利'] },

    // --- 街口（折抵要排在支付前面避免被搶） ---
    { key: 'jkopay_offset', aliases: ['街口幣折抵', '街口折抵'] },
    { key: 'jkopay', aliases: ['街口支付'] },

    { key: 'uupon_discount', aliases: ['UUPON折抵'] },
    { key: 'fb_voucher', aliases: ['FB折價券'] },
    { key: 'gift_voucher_balance', aliases: ['禮物券餘額'] },
    { key: 'gift_voucher_alt', aliases: ['禮物券代用'] },
    { key: 'e_gift_voucher', aliases: ['電子禮物券'] },
    { key: 'gift_voucher', aliases: ['禮物券'] },
    { key: 'line_yikatong', aliases: ['LINE一卡通'] },
    { key: 'union_pay_cloud', aliases: ['銀聯雲閃付'] },
    { key: 'union_pay_discount', aliases: ['銀聯折抵'] },
    { key: 'pi_wallet', aliases: ['PI拍錢包', 'PI電子錢包'] },

    // --- LINE Pay（電子版要排在一般版前面） ---
    { key: 'linepay_electronic', aliases: ['LINE PAY(電子)', 'LINE PAY(電', 'LINEPAY(電'] },
    { key: 'linepay', aliases: ['LINEPay', 'Line Pay'] },

    // --- 一卡通（MONEY/卡 要排在純「一卡通」前面，否則會被搶） ---
    { key: 'ipass_money', aliases: ['一卡通MONEY'] },
    { key: 'ipass_money_app', aliases: ['iPass Money'] },
    { key: 'ipass_card', aliases: ['一卡通'] },

    // --- GMPay（聯信／中信版要排在純GMPay前面，否則會被搶） ---
    { key: 'gmpay_union', aliases: ['GMPay(聯信)'] },
    { key: 'gmpay_citi', aliases: ['GMPAY(中信)'] },
    { key: 'gmpay', aliases: ['GMPay', 'GM Pay'] },

    { key: 'e_product_gift', aliases: ['電子商品禮'] },
    { key: 'e_product_substitute', aliases: ['電子商品代'] },
    { key: 'easycard_pay', aliases: ['悠遊付'] },
    { key: 'ue_opened', aliases: ['外送UE已開'] },

    // --- 台灣Pay（現折要排在前面） ---
    { key: 'twpay_discount', aliases: ['台灣PAY現折'] },
    { key: 'twpay', aliases: ['台灣Pay', '台灣PAY'] },

    { key: 'easycard_card', aliases: ['悠遊卡'] },
    { key: 'takeout_self_pickup', aliases: ['外帶自取'] },
    { key: 'orange_pay', aliases: ['橘子支付'] },
    { key: 'stimulus_voucher_substitute', aliases: ['振興代用券'] },
    { key: 'stimulus_voucher', aliases: ['振興券'] },
    { key: 'sports_voucher', aliases: ['動滋券'] },
    { key: 'jingcheng_discount', aliases: ['精誠電子抵'] },
    { key: 'foodpanda_pending', aliases: ['外送熊貓未'] },
    { key: 'esun_wallet', aliases: ['玉山Wallet'] },
    { key: 'ubereats_pending', aliases: ['外送UE未開'] },
    { key: 'receivable_5_ec', aliases: ['應收五EC已'] },
    { key: 'receivable_1_live', aliases: ['應收一直播'] },
    { key: 'panda_grocery', aliases: ['熊貓雜貨外'] },
    { key: 'receivable_6', aliases: ['應收六'] },
    { key: 'takeout_pending', aliases: ['外帶未開'] },
    { key: 'local_voucher', aliases: ['地方券'] },
    { key: 'full_pay', aliases: ['全支付'] },
    { key: 'entertainment_voucher', aliases: ['娛樂券'] },
    { key: 'dining_voucher', aliases: ['餐飲券'] },
    { key: 'instant_voucher', aliases: ['即享券'] },
    { key: 'points_payment', aliases: ['點數付款'] },
    { key: 'pleasure_voucher', aliases: ['享樂券'] },
    { key: 'receivable_7', aliases: ['應收七'] },
    { key: 'fula_pay', aliases: ['fula'] },
    { key: 'icash_pay', aliases: ['iCashPay'] },
    { key: 'sui_mai_qing_song', aliases: ['隨買輕鬆取'] },
    { key: 'receivable_3', aliases: ['應收三(補登', '應收三(補登)'] },
    { key: 'full_ying_pay', aliases: ['全盈+PAY', '全盈+pay'] },
    { key: 'oupay', aliases: ['歐付寶'] },
    { key: 'simple_pay', aliases: ['簡單付'] },
    ],

    // 公司POS —— 15項，文字直接取自你提供的配對規則（已確認跟canonical對帳邏輯一致），
    // 但目前沒有實際照片核對過OCR真實辨識率，建議先用真實照片測過再正式上線使用。
    company: [
      { key: 'product_voucher', aliases: ['商品禮券'] }, // 要排在「禮券」前面，否則「商品禮券」會被籠統的「禮券」搶走
      { key: 'voucher', aliases: ['禮券'] },
      { key: 'cash', aliases: ['現金'] },
      { key: 'credit', aliases: ['信用卡'] },
      { key: 'linepay', aliases: ['Line Pay'] },
      { key: 'pi_wallet', aliases: ['PI電子錢包'] },
      { key: 'easycard_pay', aliases: ['悠遊付'] },
      { key: 'px_pay', aliases: ['PX-Pay'] },
      { key: 'gmpay', aliases: ['GM Pay'] },
      { key: 'jkopay_offset', aliases: ['街口折抵'] },
      { key: 'jkopay', aliases: ['街口支付'] },
      { key: 'easycard_card', aliases: ['悠遊卡'] },
      { key: 'twpay', aliases: ['台灣Pay'] },
      { key: 'foodpanda', aliases: ['Food panda'] },
      { key: 'ubereats', aliases: ['Ubereats'] },
    ],
  };

  /**
   * 重要提醒（不要省略這段）：
   * 1. 「商品禮券」與「現金禮券」、「LINEPay」與「LINE PAY(電子)」、
   *    「連線信用卡」與「離線信用卡」、「GMPay／GMPay(聯信)／GMPAY(中信)」
   *    都是百貨POS畫面上各自獨立的欄位，不會在這支模組裡自動加總——
   *    加總是對帳程式那邊 deptToCanonical() 依照你確認過的配對規則做的，
   *    OCR這一層只負責「如實記錄畫面上有什麼」。
   * 2. 「一卡通MONEY」與「iPass Money」是畫面上兩個不同位置，業務含義上的實際差異
   *    不確定，先各自獨立記錄，不要自己假設兩者相等或自動合併。
   */


  // ==========================================================================
  // ③ 影像前處理：縮圖 + 轉 base64（瀏覽器專用，需要 Image/canvas/FileReader）
  // ==========================================================================
  function resizeImageToBase64(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('讀取檔案失敗'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('圖片解碼失敗'));
        img.onload = () => {
          let { width, height } = img;
          const longEdge = Math.max(width, height);
          if (longEdge > maxDim) {
            const scale = maxDim / longEdge;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl.split(',')[1]); // 去掉 "data:image/jpeg;base64," 前綴
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ==========================================================================
  // ④ 呼叫 Google Cloud Vision API
  // ==========================================================================
  async function callVisionAPI(base64Image) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${CONFIG.apiKey}`;
    const body = {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['zh-Hant', 'en'] },
      }],
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Vision API 連線失敗：HTTP ${res.status}`);
    const data = await res.json();
    const result = data.responses && data.responses[0];
    if (!result) throw new Error('Vision API 沒有回傳結果');
    if (result.error) throw new Error(`Vision API 錯誤：${result.error.message}`);
    return result.fullTextAnnotation || null; // 圖片裡沒偵測到文字時為 null，不算錯誤
  }

  // ==========================================================================
  // ⑤ 純邏輯區（不依賴瀏覽器，方便用 Node.js 直接測試）
  // ==========================================================================

  // 全形數字轉半形，避免某些字型辨識出全形 0-9 導致數字判斷漏掉
  function toHalfWidthDigit(ch) {
    const code = ch.charCodeAt(0);
    if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xfee0);
    return ch;
  }

  // 把 Vision API 的巢狀結構（page→block→paragraph→word→symbol）攤平成「字元陣列」。
  // 刻意拆到「每個字」這層，而不是用 Vision 自己切好的「word」，
  // 是因為中文在不同字型/版面下，Vision 切詞的顆粒度不一致（有時整串、有時單字），
  // 全部拆到字元層級，後面的比對邏輯才不用管 Vision 怎麼切。
  function flattenToChars(fullTextAnnotation) {
    const chars = [];
    const pages = fullTextAnnotation.pages || [];
    pages.forEach((page) => {
      (page.blocks || []).forEach((block) => {
        (block.paragraphs || []).forEach((paragraph) => {
          (paragraph.words || []).forEach((word) => {
            (word.symbols || []).forEach((symbol) => {
              const v = symbol.boundingBox && symbol.boundingBox.vertices;
              if (!v || v.length < 4) return;
              const cx = (v[0].x + v[1].x + v[2].x + v[3].x) / 4;
              const cy = (v[0].y + v[1].y + v[2].y + v[3].y) / 4;
              const height = Math.abs((v[3].y ?? v[0].y) - v[0].y) || Math.abs(v[2].y - v[1].y) || 12;
              chars.push({
                ch: toHalfWidthDigit(symbol.text),
                cx, cy, height,
                confidence: symbol.confidence != null ? symbol.confidence : 1,
              });
            });
          });
        });
      });
    });
    return chars;
  }

  // 依垂直座標把字元群聚成「視覺列」(同一橫排)，不管 Vision 原本輸出的段落順序。
  // 這一步是為了正確處理「兩欄式」POS 螢幕畫面 —— 左欄、右欄的同一橫排
  // 在 Vision 回傳的資料裡常常不是相鄰的，必須靠座標自己重新分組。
  function clusterIntoLines(chars) {
    if (!chars.length) return [];
    const sorted = [...chars].sort((a, b) => a.cy - b.cy);
    const heights = sorted.map((c) => c.height).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] || 12;
    const tolerance = medianHeight * CONFIG.lineClusterTolerance;

    const lines = [];
    let current = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const avgY = current.reduce((s, c) => s + c.cy, 0) / current.length;
      if (Math.abs(sorted[i].cy - avgY) <= tolerance) {
        current.push(sorted[i]);
      } else {
        lines.push(current);
        current = [sorted[i]];
      }
    }
    lines.push(current);
    return lines.map((line) => line.sort((a, b) => a.cx - b.cx)); // 列內依左到右排序
  }

  // 正規化字串：用來比對標籤文字，忽略大小寫、空白、全/半形冒號與逗號
  function normalize(str) {
    return str.toLowerCase().replace(/[\s：:，,]/g, '').trim();
  }

  // 注意：負號「-」不算在這裡面 —— 因為像「PX-Pay」這種文字標籤本身就含連字號，
  // 如果連字號被當成數字，會把「PX」跟「Pay」硬生生切成兩段文字，"Pay：146" 就比對不到字典。
  // 負數（例如「退貨金額：-776」）改在 pairChunks() 用「文字段結尾是不是負號」來判斷救回來，
  // 這樣可以同時處理「文字本身帶連字號」跟「數字前面真的是負號」這兩種情況。
  function isNumericChar(ch) {
    return /[0-9.,]/.test(ch);
  }

  // 把一列字元，依「文字／數字」交替切成 chunk
  function splitLineIntoChunks(line) {
    const chunks = [];
    let current = null;
    line.forEach((c) => {
      const type = isNumericChar(c.ch) ? 'num' : 'text';
      if (current && current.type === type) {
        current.chars.push(c);
      } else {
        current = { type, chars: [c] };
        chunks.push(current);
      }
    });
    return chunks;
  }

  // 把 [文字, 數字, 文字, 數字...] 的 chunk 序列，整理成 (標籤, 數值) 配對
  // 這一步完全不查字典 —— 只要「文字後面緊接著數字」就視為一組候選，
  // 之後才拿去跟字典比對。這樣未收錄的標籤也不會被漏掉，只會被丟進「未對應」。
  function pairChunks(chunks) {
    const pairs = [];
    for (let i = 0; i < chunks.length - 1; i++) {
      if (chunks[i].type === 'text' && chunks[i + 1].type === 'num') {
        let labelRaw = chunks[i].chars.map((c) => c.ch).join('').trim();
        const numChars = chunks[i + 1].chars;
        let numStr = numChars.map((c) => c.ch).join('');
        // 文字段結尾如果是負號，代表它其實是數字的一部分（如「退貨金額：-776」），
        // 不是文字本身帶的連字號（如「PX-Pay」的連字號出現在文字中間，結尾不會是負號）。
        if (labelRaw.endsWith('-')) {
          labelRaw = labelRaw.slice(0, -1).trim();
          numStr = `-${numStr}`;
        }
        const labelNorm = normalize(labelRaw);
        if (labelNorm.length < 1) continue; // 標籤太短（可能只是符號），跳過
        const value = Number(numStr.replace(/,/g, ''));
        if (Number.isNaN(value)) continue;
        const confidence = numChars.reduce((s, c) => s + c.confidence, 0) / numChars.length;
        pairs.push({ labelRaw, labelNorm, value, confidence });
      }
    }
    return pairs;
  }

  // 拿候選 (標籤, 數值) 配對去比對字典，分流到 matched / unmatched
  function parseLines(lines, labelMap) {
    const matched = {};
    const unmatched = [];
    lines.forEach((line) => {
      const pairs = pairChunks(splitLineIntoChunks(line));
      pairs.forEach((pair) => {
        // 只用「OCR讀到的文字 包含 字典別名」這個方向比對（見字典區註解說明排序原則）
        const known = labelMap.find((entry) => entry.aliases.some((alias) => pair.labelNorm.includes(normalize(alias))));
        const record = { value: pair.value, confidence: pair.confidence, rawText: pair.labelRaw };
        if (known) {
          if (!matched[known.key] || matched[known.key].confidence < record.confidence) {
            matched[known.key] = record;
          }
        } else {
          unmatched.push({ label: pair.labelRaw, ...record });
        }
      });
    });
    return { matched, unmatched };
  }

  // 把「多張照片各自的辨識結果」合併成一份，並偵測同一欄位的數值衝突。
  // 拆成獨立函式是為了方便在 Node.js 環境下直接單元測試（不用真的呼叫 API）。
  function mergeParsedResults(perFileResults) {
    const merged = { matched: {}, unmatched: [], conflicts: [], sourceCount: perFileResults.length };
    perFileResults.forEach(({ matched, unmatched }, i) => {
      Object.entries(matched).forEach(([key, record]) => {
        if (merged.matched[key] == null) {
          merged.matched[key] = { ...record, sources: [i] };
        } else if (merged.matched[key].value === record.value) {
          // 數值相同 → 多張照片互相驗證成功，記錄來源、信心值取較高者
          merged.matched[key].sources.push(i);
          merged.matched[key].confidence = Math.max(merged.matched[key].confidence, record.confidence);
        } else {
          // 同一欄位、不同照片讀到不同數值 —— 不猜哪個對，列成衝突讓人決定
          merged.conflicts.push({
            key,
            values: [
              { value: merged.matched[key].value, source: merged.matched[key].sources[0] },
              { value: record.value, source: i },
            ],
          });
        }
      });
      unmatched.forEach((u) => merged.unmatched.push({ ...u, source: i }));
    });
    return merged;
  }

  // ==========================================================================
  // ⑥ 對外主函式：辨識並解析（支援單張或多張照片，自動合併+衝突偵測）
  // pos: 'dept'（百貨POS，預設值）或 'company'（公司POS），決定用哪一份字典比對
  // ==========================================================================
  async function recognizeAndParse(files, pos = 'dept') {
    const labelMap = LABEL_MAPS[pos];
    if (!labelMap) throw new Error(`未知的 pos: ${pos}，目前只支援 'dept' 或 'company'`);
    const fileArray = Array.isArray(files) ? files : [files];
    const perFileResults = [];
    for (let i = 0; i < fileArray.length; i++) {
      const base64 = await resizeImageToBase64(fileArray[i], CONFIG.maxImageDimension);
      const fullTextAnnotation = await callVisionAPI(base64);
      if (!fullTextAnnotation) { perFileResults.push({ matched: {}, unmatched: [] }); continue; }
      perFileResults.push(parseLines(clusterIntoLines(flattenToChars(fullTextAnnotation)), labelMap));
    }
    return mergeParsedResults(perFileResults);
  }

  // ==========================================================================
  // ⑦ 複核 UI：辨識結果不會直接寫入表單，一定要按「套用」才會呼叫 applyCallback
  //    （金額辨識錯一位數，對帳結果就會整個跑掉，這一步不能省）
  // ==========================================================================
  function renderReviewPanel(container, result, applyCallback) {
    const matchedEntries = Object.entries(result.matched);
    const matchedRows = matchedEntries.map(([key, r]) => `
      <div class="field-row">
        <input type="checkbox" data-key="${key}" checked />
        <span class="name">${r.rawText}${r.confidence < CONFIG.confidenceWarningThreshold ? ' ⚠️' : ''}</span>
        <input type="number" data-value-for="${key}" value="${r.value}" />
      </div>
    `).join('');

    const conflictHtml = result.conflicts.length
      ? `<div class="conflict">
           ⚠️ 以下欄位在不同照片讀到不同數值，請自行確認後手動填入：<br/>
           ${result.conflicts.map((c) => `${c.key}：${c.values.map((v) => `第${v.source + 1}張=${v.value.toLocaleString()}`).join(' vs ')}`).join('<br/>')}
         </div>`
      : '';

    const unmatchedHtml = result.unmatched.length
      ? `<div class="unmatched">
           未對應欄位（讀到了，但字典裡沒有，僅供參考）：<br/>
           ${result.unmatched.map((u) => `${u.label}：${u.value.toLocaleString()}`).join('　')}
         </div>`
      : '';

    container.innerHTML = `
      <div class="ocr-review">
        <div class="title">辨識結果複核（共 ${result.sourceCount} 張照片，抓到 ${matchedEntries.length} 項）</div>
        ${matchedRows || '<div class="unmatched">沒有辨識到任何已知欄位</div>'}
        ${conflictHtml}
        ${unmatchedHtml}
        ${matchedEntries.length ? '<button class="btn btn-primary apply-btn" id="ocrApplyBtn">套用到表單</button>' : ''}
      </div>
    `;

    const applyBtn = container.querySelector('#ocrApplyBtn');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', () => {
      const fields = {};
      container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (!cb.checked) return;
        const key = cb.dataset.key;
        const valueInput = container.querySelector(`input[data-value-for="${key}"]`);
        fields[key] = Number(valueInput.value) || 0;
      });
      applyCallback(fields);
      container.innerHTML = `<div class="ocr-review" style="color:#2a8a4a;">已套用 ${Object.keys(fields).length} 項欄位 ✓</div>`;
    });
  }

  // ==========================================================================
  // ⑧ 匯出
  // ==========================================================================
  const OCRFill = {
    recognizeAndParse,
    renderReviewPanel,
    config: CONFIG,
    labelMaps: LABEL_MAPS,
    // 以下純邏輯函式額外匯出，方便寫單元測試（不需要瀏覽器環境）
    _internal: { flattenToChars, clusterIntoLines, splitLineIntoChunks, pairChunks, parseLines, normalize, mergeParsedResults },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OCRFill; // Node.js 測試用
  }
  if (typeof global !== 'undefined') {
    global.OCRFill = OCRFill; // 瀏覽器用
  }
})(typeof window !== 'undefined' ? window : globalThis);
