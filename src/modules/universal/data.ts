// 環球清帳「Global Mall 收銀台結帳單」的表單結構與對應規則。
// 來源確認（與使用者逐項對過）：百貨POS（reconcile dept）各欄位金額 → 表單項目。
// keys 為要加總帶入的百貨POS欄位 key（可為多個＝加總；空陣列＝表單有此列但不自動帶入）。

import { PAYMENT_GROUPS } from '../reconcile/data';

export interface FormItem {
  label: string;
  /** 要加總的百貨POS欄位 key；空陣列代表此列保留但不自動帶入（如 LINE Money／微信支付）。 */
  keys: string[];
}

export const SECTION_LEFT_TITLE = '實收款別';
export const SECTION_RIGHT_TITLE = '實收有價證券';

// 左欄：實收款別（A7–A23）
export const FORM_LEFT: FormItem[] = [
  { label: '現金', keys: ['cash'] },
  { label: '連線信用卡', keys: ['credit_card', 'credit_card_citi', 'credit_card_union'] }, // 新 POS 中信＋聯合加總
  { label: '離線信用卡', keys: ['credit_card_offline'] },
  { label: '悠遊卡', keys: ['easycard_card'] },
  { label: '一卡通', keys: ['ipass_card'] },
  { label: '街口支付', keys: ['jkopay'] },
  { label: '街口幣折抵', keys: ['jkopay_offset'] },
  { label: 'LINE Pay', keys: ['linepay', 'linepay_electronic'] }, // LINEPay ＋ LINE PAY(電) 加總
  { label: 'LINE Money', keys: [] }, // 無對應，留空
  { label: 'Pi 拍錢包', keys: ['pi_wallet'] },
  { label: 'GM Pay', keys: ['gmpay', 'gmpay_union', 'gmpay_citi'] }, // 三家加總
  { label: '台灣Pay折抵', keys: ['twpay_discount'] },
  { label: '橘子支付', keys: ['orange_pay'] },
  { label: '微信支付', keys: [] }, // 略過，留空
  { label: '台灣Pay', keys: ['twpay'] },
  { label: '悠遊Pay', keys: ['easycard_pay'] }, // ＝百貨POS 悠遊付
  { label: '銀聯支付', keys: ['union_pay_cloud'] }, // ＝銀聯雲閃付
];

// 右欄：實收有價證券（E7–E21）
export const FORM_RIGHT: FormItem[] = [
  { label: '現金禮券', keys: ['cash_voucher'] },
  { label: '現金代用券', keys: ['cash_substitute_voucher'] },
  { label: '現金餘額券', keys: ['balance_voucher'] },
  { label: '商品禮券', keys: ['product_voucher'] },
  { label: '商品代用券', keys: ['product_substitute_voucher'] },
  { label: '電子商品禮券', keys: ['e_product_gift'] },
  { label: '禮物券', keys: ['gift_voucher'] },
  { label: '禮物券代用券', keys: ['gift_voucher_alt'] },
  { label: '禮物券餘額券', keys: ['gift_voucher_balance'] },
  { label: '精誠商品抵用券', keys: ['jingcheng_discount'] },
  { label: 'FB折價券', keys: ['fb_voucher'] },
  { label: '應收帳款一', keys: ['receivable_1_live'] },
  { label: '應收帳款三', keys: ['receivable_3'] },
  { label: '外送UE', keys: ['ubereats_pending'] }, // 只帶外送UE未開
  { label: '外帶自取', keys: ['takeout_self_pickup'] },
];

// 略過清單：不對應、也不會被自動補列（使用者指定）。
export const SKIP_KEYS: ReadonlySet<string> = new Set<string>(['citi_wechat']);

// 百貨POS欄位順序（自動補列時依此排序，貼近實際畫面順序）。
export const DEPT_ORDER: string[] = PAYMENT_GROUPS.dept.map((f) => f.key);

// 百貨POS key → 中文名稱（自動補列時顯示）。
export const DEPT_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_GROUPS.dept.map((f) => [f.key, f.label]),
);
