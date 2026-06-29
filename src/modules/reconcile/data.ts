// 雙POS對帳的固定資料：欄位表、對帳分類、配對規則。
// 內容逐字移植自原始 index.html 的 PAYMENT_GROUPS／METHODS（reference/dual-pos-original）。
//
// key 命名對齊 ocr.ts 的字典，OCR「套用」可直接寫入不需轉換層。

import type { PaymentField, PosKind } from './types';

export const PAYMENT_GROUPS: Record<PosKind, PaymentField[]> = {
  // 百貨POS（Global Mall）—— 78 個欄位，順序對齊真實畫面；UI 每 11 項直列成一頁。
  // active:false 保留為「較少使用」的資料註記；UI 仍固定顯示全部欄位。
  // 所有欄位都可手動輸入或由 OCR 帶入（顯示規則見 view.ts renderInputs）。
  dept: [
    { key: 'cash', label: '現金', glyph: '金' },
    { key: 'credit_card', label: '連線信用卡', glyph: '卡' },
    { key: 'credit_card_offline', label: '離線信用卡', glyph: '卡' },
    { key: 'product_voucher', label: '商品禮券', glyph: '禮' },
    { key: 'receivable_amount', label: '應收帳款', glyph: '收', active: false },
    { key: 'product_substitute_voucher', label: '商代用券', glyph: '禮', active: false },
    { key: 'bonus_offset', label: '紅利抵扣', glyph: '點', active: false },
    { key: 'cash_voucher', label: '現金禮券', glyph: '禮' },
    { key: 'cash_substitute_voucher', label: '現代用券', glyph: '禮', active: false },
    { key: 'store_own_voucher', label: '專櫃自有券', glyph: '禮', active: false },
    { key: 'member_discount_voucher', label: '會員折價券', glyph: '禮', active: false },
    { key: 'imall_discount', label: 'Imall折抵', glyph: '折', active: false },
    { key: 'balance_voucher', label: '餘額券', glyph: '禮', active: false },
    { key: 'sodexo_product', label: '索迪斯商品', glyph: '禮', active: false },
    { key: 'sodexo_substitute', label: '索迪斯代用', glyph: '禮', active: false },
    { key: 'sodexo_balance', label: '索迪斯餘額', glyph: '禮', active: false },
    { key: 'citi_direct_pay', label: '中信直接付', glyph: '付', active: false },
    { key: 'citi_wechat', label: '中信微信', glyph: '付', active: false },
    { key: 'app_discount_voucher', label: 'APP折價券', glyph: '折', active: false },
    { key: 'citi_line', label: '中信LINE', glyph: '付', active: false },
    { key: 'line_bonus', label: 'LINE紅利', glyph: '點', active: false },
    { key: 'jkopay', label: '街口支付', glyph: '付' },
    { key: 'jkopay_offset', label: '街口幣折抵', glyph: '折' },
    { key: 'uupon_discount', label: 'UUPON折抵', glyph: '折', active: false },
    { key: 'fb_voucher', label: 'FB折價券', glyph: '折', active: false },
    { key: 'gift_voucher', label: '禮物券', glyph: '禮', active: false },
    { key: 'gift_voucher_alt', label: '禮物券代用', glyph: '禮', active: false },
    { key: 'gift_voucher_balance', label: '禮物券餘額', glyph: '禮', active: false },
    { key: 'line_yikatong', label: 'LINE一卡通', glyph: '付', active: false },
    { key: 'union_pay_cloud', label: '銀聯雲閃付', glyph: '付', active: false },
    { key: 'union_pay_discount', label: '銀聯折抵', glyph: '折', active: false },
    { key: 'pi_wallet', label: 'PI拍錢包', glyph: '錢' },
    { key: 'linepay', label: 'LINEPay', glyph: '付' },
    { key: 'ipass_money', label: '一卡通MONEY', glyph: '卡', active: false },
    { key: 'gmpay', label: 'GMPay', glyph: '付' },
    { key: 'e_product_gift', label: '電子商品禮', glyph: '禮', active: false },
    { key: 'e_product_substitute', label: '電子商品代', glyph: '禮', active: false },
    { key: 'easycard_pay', label: '悠遊付', glyph: '付' },
    { key: 'ue_opened', label: '外送UE已開', glyph: '外', active: false },
    { key: 'twpay', label: '台灣PAY', glyph: '付' },
    { key: 'twpay_discount', label: '台灣PAY現折', glyph: '折', active: false },
    { key: 'easycard_card', label: '悠遊卡', glyph: '卡' },
    { key: 'takeout_self_pickup', label: '外帶自取', glyph: '外', active: false },
    { key: 'orange_pay', label: '橘子支付', glyph: '付', active: false },
    { key: 'stimulus_voucher', label: '振興券', glyph: '券', active: false },
    { key: 'stimulus_voucher_substitute', label: '振興代用券', glyph: '券', active: false },
    { key: 'sports_voucher', label: '動滋券', glyph: '券', active: false },
    { key: 'jingcheng_discount', label: '精誠電子抵', glyph: '折' },
    { key: 'foodpanda_pending', label: '外送熊貓未', glyph: '外' },
    { key: 'e_cash_voucher', label: '電子現金券', glyph: '禮', active: false },
    { key: 'e_gift_voucher', label: '電子禮物券', glyph: '禮', active: false },
    { key: 'ipass_card', label: '一卡通', glyph: '卡', active: false },
    { key: 'esun_wallet', label: '玉山Wallet', glyph: '付', active: false },
    { key: 'ubereats_pending', label: '外送UE未開', glyph: '外' },
    { key: 'receivable_5_ec', label: '應收五EC已', glyph: '收', active: false },
    { key: 'receivable_1_live', label: '應收一直播', glyph: '收', active: false },
    { key: 'panda_grocery', label: '熊貓雜貨外', glyph: '外', active: false },
    { key: 'receivable_6', label: '應收六', glyph: '收', active: false },
    { key: 'takeout_pending', label: '外帶未開', glyph: '外', active: false },
    { key: 'local_voucher', label: '地方券', glyph: '券', active: false },
    { key: 'full_pay', label: '全支付', glyph: '付' },
    { key: 'entertainment_voucher', label: '娛樂券', glyph: '券', active: false },
    { key: 'dining_voucher', label: '餐飲券', glyph: '券', active: false },
    { key: 'instant_voucher', label: '即享券', glyph: '券', active: false },
    { key: 'gmpay_union', label: 'GMPay(聯信)', glyph: '付' },
    { key: 'points_payment', label: '點數付款', glyph: '點', active: false },
    { key: 'pleasure_voucher', label: '享樂券', glyph: '券', active: false },
    { key: 'receivable_7', label: '應收七', glyph: '收', active: false },
    { key: 'fula_pay', label: 'fula', glyph: '付', active: false },
    { key: 'icash_pay', label: 'iCashPay', glyph: '付', active: false },
    { key: 'gmpay_citi', label: 'GMPAY(中信)', glyph: '付' },
    { key: 'sui_mai_qing_song', label: '隨買輕鬆取', glyph: '付', active: false },
    { key: 'linepay_electronic', label: 'LINE PAY(電', glyph: '付' },
    { key: 'receivable_3', label: '應收三(補登', glyph: '收', active: false },
    { key: 'ipass_money_app', label: 'iPass Money', glyph: '卡', active: false }, // 與「一卡通MONEY」為畫面上兩個不同位置，先各自獨立記錄
    { key: 'oupay', label: '歐付寶', glyph: '付', active: false },
    { key: 'simple_pay', label: '簡單付', glyph: '付', active: false },
    { key: 'full_ying_pay', label: '全盈+PAY', glyph: '付', active: false },
  ],
  // 公司POS —— 23 個欄位，UI 以單一直欄顯示；有金額的欄位會穩定移到最前方。
  // active:false 僅保留為資料註記，UI 仍固定顯示全部欄位。
  // 數值來源是百貨POS對應項目加總後的結果（見 syncDeptToCompany）。
  company: [
    { key: 'cash', label: '現金', glyph: '金' },
    { key: 'voucher', label: '禮券', glyph: '禮' },
    { key: 'credit', label: '信用卡', glyph: '卡' },
    { key: 'product_voucher', label: '商品禮券', glyph: '禮' },
    { key: 'linepay', label: 'Line Pay', glyph: '付' },
    { key: 'pi_wallet', label: 'PI電子錢包', glyph: '錢' },
    { key: 'easycard_pay', label: '悠遊付', glyph: '付' },
    { key: 'px_pay', label: 'PX-Pay', glyph: '付' },
    { key: 'gmpay', label: 'GM Pay', glyph: '付' },
    { key: 'icash_pay', label: 'icash pay', glyph: '付', active: false },
    { key: 'jkopay', label: '街口支付', glyph: '付' },
    { key: 'easycard_card', label: '悠遊卡', glyph: '卡' },
    { key: 'twpay', label: '台灣Pay', glyph: '付' },
    { key: 'jkopay_offset', label: '街口折抵', glyph: '折' },
    { key: 'foodpanda', label: 'Food panda', glyph: '外' },
    { key: 'ubereats', label: 'Ubereats', glyph: '外' },
    { key: 'global_points_offset', label: '環球點數折抵', glyph: '折', active: false },
    { key: 'ipass_card', label: '一卡通', glyph: '卡', active: false },
    { key: 'orange_pay', label: '橘子支付', glyph: '付', active: false },
    { key: 'instant_voucher', label: '即享券', glyph: '券', active: false },
    { key: 'balance_voucher', label: '餘額券', glyph: '禮', active: false }, // 無單獨配對，金額併入「未配對項目」一起比對
    { key: 'twpay_offset', label: '台灣Pay折抵', glyph: '折', active: false }, // 無單獨配對，金額併入「未配對項目」一起比對
    { key: 'add_purchase', label: '加價購', glyph: '購', active: false }, // 無單獨配對，金額併入「未配對項目」一起比對
  ],
};

// 對帳比對的分類軸（canonical 分類）：每一項代表一條配對規則的比較軸，
// 由 deptToCanonical／companyToCanonical 各自加總兩邊 POS 對應欄位後逐項相減。
export const METHODS: string[] = [
  '現金', '禮券類', '信用卡', 'Line Pay', 'PI電子錢包', '悠遊付',
  'PX-Pay', 'GM Pay', '街口支付', '悠遊卡', '台灣Pay', '街口折抵', 'Food panda', 'Ubereats',
  '一卡通', '環球點數折抵', 'iCash Pay', '橘子支付', '即享券', '未配對項目',
];

// 這些分類沒有「拆組合湊金額」的概念，差異只標示直接增減、不算組合：
// 外送平台、以及把兩邊未配對欄位加總的「未配對項目」（內容混雜，無法用面額湊）。
export const NO_FORMULA_METHODS: ReadonlySet<string> = new Set(['Food panda', 'Ubereats', '未配對項目']);

// 品項組合用的金額（calculateAdjustments）：常用、可選（由 UI 開關）、最後手段。
export const NORMAL_PIECES: number[] = [42, 47, 57];
export const LAST_RESORT_PIECES: number[] = [1, 3, 5];
export const OPTIONAL_PIECES: number[] = [60, 65, 70, 75, 80, 85];
