export type CategoryKind = "income" | "expense" | "saving";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  archived?: boolean;
}

/** One month of the rolling budget (planned) and the P&L (what actually happened), per category. */
export interface MonthRecord {
  budget: Record<string, number>;
  actual: Record<string, number>;
  note?: string;
}

export type AccountKind = "asset" | "liability";
export type Bucket = "protect" | "defend" | "attack" | "lottery";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  type: string;
  currency: string;
  /** Liquid = can be turned into cash within a year. */
  liquid: boolean;
  /** Which of the four money buckets an asset belongs to (assets only). */
  bucket?: Bucket;
  archived?: boolean;
}

/** A dated count of every account's balance (in the account's own currency), plus the FX rates used. */
export interface Snapshot {
  id: string;
  date: string; // YYYY-MM-DD
  balances: Record<string, number>;
  fx: Record<string, number>;
  note?: string;
}

export interface GoalItem {
  id: string;
  name: string;
  /** Yearly cost of this part of the ideal life. */
  annual: number;
  /** One-off cost (a house, a car, equipment). */
  oneOff: number;
}

export interface Plan {
  years: number;
  monthly: number;
  initial: number;
  inflation: number; // e.g. 0.02
  applyInflation: boolean;
}

export interface AppData {
  schema: 1;
  settings: {
    baseCurrency: string;
    /** Default rates to the base currency, used to prefill new snapshots. */
    fx: Record<string, number>;
    /** Cash at the start of each year, keyed by YYYY — the starting point of the rolling budget. */
    openingCash: Record<string, number>;
    /** Optional yearly saving goal, keyed by YYYY. */
    yearGoals: Record<string, number>;
  };
  categories: Category[];
  months: Record<string, MonthRecord>; // keyed by YYYY-MM
  accounts: Account[];
  snapshots: Snapshot[];
  goals: {
    vision: string;
    items: GoalItem[];
    withdrawalRate: number; // e.g. 0.04 → need 25× yearly cost
  };
  plan: Plan;
  /** Target share of each bucket, in percent. */
  allocationTarget: Record<Bucket, number>;
}

export const BUCKETS: { id: Bucket; name: string; hint: string }[] = [
  { id: "protect", name: "保障型", hint: "緊急備用金、儲蓄險" },
  { id: "defend", name: "防守型", hint: "年化 5–12%，如大盤 ETF" },
  { id: "attack", name: "進攻型", hint: "年化 12–25%，如成長股" },
  { id: "lottery", name: "樂透型", hint: "年化 25% 以上，高風險" },
];

export const ASSET_TYPES: { name: string; liquid: boolean; bucket: Bucket }[] = [
  { name: "活存", liquid: true, bucket: "protect" },
  { name: "定存", liquid: true, bucket: "protect" },
  { name: "台股", liquid: true, bucket: "attack" },
  { name: "美股", liquid: true, bucket: "attack" },
  { name: "ETF", liquid: true, bucket: "defend" },
  { name: "外匯", liquid: true, bucket: "protect" },
  { name: "加密貨幣", liquid: true, bucket: "lottery" },
  { name: "儲蓄險／投資型保單", liquid: false, bucket: "protect" },
  { name: "應收款／押金", liquid: true, bucket: "protect" },
  { name: "不動產", liquid: false, bucket: "defend" },
  { name: "車輛／器材", liquid: false, bucket: "protect" },
  { name: "其他資產", liquid: true, bucket: "protect" },
];

export const LIABILITY_TYPES: { name: string; liquid: boolean }[] = [
  { name: "信用卡", liquid: true },
  { name: "分期付款", liquid: true },
  { name: "信貸", liquid: false },
  { name: "車貸", liquid: false },
  { name: "學貸", liquid: false },
  { name: "房貸", liquid: false },
  { name: "其他負債", liquid: true },
];

export const CURRENCIES = ["TWD", "USD", "MYR", "JPY", "EUR", "CNY", "HKD", "USDT", "BTC", "ETH"];

export const KIND_LABEL: Record<CategoryKind, string> = {
  income: "收入",
  expense: "支出",
  saving: "儲蓄／投資轉出",
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const cat = (name: string, kind: CategoryKind): Category => ({ id: uid(), name, kind });

export function defaultData(): AppData {
  return {
    schema: 1,
    settings: { baseCurrency: "TWD", fx: { TWD: 1, USD: 32 }, openingCash: {}, yearGoals: {} },
    categories: [
      cat("薪資", "income"),
      cat("獎金", "income"),
      cat("副業／接案", "income"),
      cat("股息／利息", "income"),
      cat("其他收入", "income"),
      cat("生活費（食／住）", "expense"),
      cat("孝親費／零用錢", "expense"),
      cat("稅金", "expense"),
      cat("償債", "expense"),
      cat("訂閱", "expense"),
      cat("保險", "expense"),
      cat("交通", "expense"),
      cat("健康與休閒", "expense"),
      cat("個人成長", "expense"),
      cat("公益", "expense"),
      cat("紅包／禮金", "expense"),
      cat("其他支出", "expense"),
      cat("定期定額／儲蓄", "saving"),
    ],
    months: {},
    accounts: [],
    snapshots: [],
    goals: { vision: "", items: [], withdrawalRate: 0.04 },
    plan: { years: 20, monthly: 10000, initial: 0, inflation: 0.02, applyInflation: false },
    allocationTarget: { protect: 20, defend: 50, attack: 25, lottery: 5 },
  };
}
