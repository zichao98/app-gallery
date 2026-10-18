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

export type InsuranceNeed = "medical" | "life" | "care" | "property";
export type PolicyPlan = "keep" | "adjust" | "cancel" | "add";

export interface Policy {
  id: string;
  insurer: string;
  product: string;
  /** 要保人 — who pays. */
  policyholder: string;
  /** 被保險人 — whose risk is covered. */
  insured: string;
  need: InsuranceNeed;
  annualPremium: number;
  /** Month the premium is due (1–12); undefined when paid monthly or unknown. */
  payMonth?: number;
  /** Sum insured counted toward the need's target. */
  coverage: number;
  /** How it pays out: beneficiary, reimbursement, lump sum… */
  coverageNote: string;
  contact: string;
  endDate?: string; // YYYY-MM-DD
  plan: PolicyPlan;
  planNote: string;
}

export interface NeedPlan {
  target?: number;
  /** Who to call, what documents, what counts — so the family knows what to do. */
  process: string;
  next: string;
}

export type DebtAction = "keep" | "prepay" | "negotiate" | "extend" | "consolidate" | "other";

export interface Debt {
  id: string;
  name: string;
  nature: string;
  principal: number;
  balance: number;
  monthlyPayment: number;
  /** Annual interest rate as a fraction, e.g. 0.025. */
  rate: number;
  endDate?: string; // last scheduled payment, YYYY-MM-DD
  /** Until this date early repayment may carry a penalty. */
  lockUntil?: string;
  action: DebtAction;
  note: string;
  /** Liability account this debt mirrors, if any. */
  accountId?: string;
}

export type DebtStrategy = "avalanche" | "snowball" | "custom";

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
  insurance: {
    needs: Record<InsuranceNeed, NeedPlan>;
    policies: Policy[];
  };
  debts: {
    items: Debt[];
    /** Extra money per month put toward paying debts off early. */
    extraMonthly: number;
    strategy: DebtStrategy;
  };
}

export const NEEDS: { id: InsuranceNeed; question: string; kinds: string; scope: string }[] = [
  { id: "medical", question: "生病受傷了誰出錢？", kinds: "醫療、意外險", scope: "住院、手術、復健、薪資補償" },
  { id: "life", question: "離開人世能留下什麼給在乎的人？", kinds: "壽險", scope: "家人生活費、債務、教育基金、遺產稅" },
  { id: "care", question: "無法自理怎麼辦？", kinds: "癌症、失能、重大傷病、長照", scope: "看護、醫療、生活費、家人的負擔" },
  { id: "property", question: "貴重物品損害怎麼辦？", kinds: "車險、住宅火險、其他產險", scope: "資產估值、可能發生的情況" },
];

export const POLICY_PLANS: { id: PolicyPlan; name: string }[] = [
  { id: "keep", name: "保留" },
  { id: "adjust", name: "調整" },
  { id: "cancel", name: "考慮解約" },
  { id: "add", name: "規劃新增" },
];

export const DEBT_NATURES = ["房貸", "車貸", "信貸", "學貸", "信用卡", "分期付款", "私人借款", "其他"];

export const DEBT_ACTIONS: { id: DebtAction; name: string }[] = [
  { id: "keep", name: "維持現狀繼續還" },
  { id: "prepay", name: "有餘錢優先提前還" },
  { id: "negotiate", name: "談降息" },
  { id: "extend", name: "拉長期限降低月付" },
  { id: "consolidate", name: "整合債務" },
  { id: "other", name: "其他（協商等）" },
];

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
    insurance: {
      needs: {
        medical: { process: "", next: "" },
        life: { process: "", next: "" },
        care: { process: "", next: "" },
        property: { process: "", next: "" },
      },
      policies: [],
    },
    debts: { items: [], extraMonthly: 0, strategy: "avalanche" },
  };
}
