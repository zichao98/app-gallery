import type { Page } from "./App";
import type { AppData } from "./types";

export interface ActionItem {
  id: string;
  text: string;
  /** Page in this app where the step is done, if any. */
  page?: Page;
  /** How to do it when it happens outside the app. */
  hint?: string;
}

export interface Week {
  n: number;
  title: string;
  items: ActionItem[];
}

const DREAM = "夢想倉庫定期收集：隨手記下想要的生活，定期整理";

// From the 行動清單 sheet of the original spreadsheet.
export const WEEKS: Week[] = [
  {
    n: 1,
    title: "翻轉局勢：讓錢為你所用",
    items: [
      { id: "w1-dream-time", text: "預定首次夢想倉庫批量收集時間（4 小時獨處）", page: "goals" },
      { id: "w1-dream-setup", text: "設置夢想倉庫資料夾與文檔", hint: "電腦資料夾或實體筆記本" },
      { id: "w1-community", text: "加入社群獲得資源" },
      { id: "w1-income", text: "現有收入盤點", page: "monthly" },
      { id: "w1-assets", text: "現有顯性資產盤點", page: "assets" },
    ],
  },
  {
    n: 2,
    title: "盤點現況",
    items: [
      { id: "w2-dream", text: DREAM, page: "goals" },
      { id: "w2-debts", text: "現有債務盤點", page: "debts" },
      { id: "w2-expense", text: "現有支出盤點", page: "monthly" },
      { id: "w2-hidden", text: "隱形資產盤點（快樂、優勢、意義）", page: "goals" },
      { id: "w2-hidden-goal", text: "挑出最有機會發展的隱形資產，寫進財務目標", page: "goals" },
    ],
  },
  {
    n: 3,
    title: "提高財務主動權",
    items: [
      { id: "w3-overview", text: "把財務現況與目標放進財務全景圖", page: "dashboard" },
      { id: "w3-dream", text: DREAM, page: "goals" },
      { id: "w3-income-sources", text: "可能收入來源盤點", page: "survival" },
      { id: "w3-floor", text: "底限開支盤點", page: "survival" },
      { id: "w3-budget", text: "根據日常支出與未來可見的重要支出製作滾動預算", page: "monthly" },
    ],
  },
  {
    n: 4,
    title: "未雨綢繆",
    items: [
      { id: "w4-debt-plan", text: "債務盤點完，進一步做處置規劃", page: "debts" },
      { id: "w4-dream", text: DREAM, page: "goals" },
      { id: "w4-insurance-needs", text: "用保險三問句檢視需求", page: "insurance" },
      { id: "w4-insurance-plan", text: "保險處置規劃", page: "insurance" },
      { id: "w4-year-goal", text: "訂年度盈餘目標", page: "monthly" },
      { id: "w4-saving-goal", text: "訂每年、每週、每日儲蓄目標", page: "monthly" },
    ],
  },
  {
    n: 5,
    title: "拆解未來",
    items: [
      { id: "w5-vision-v1", text: "人生願景 V1（圖像＋描述）", page: "goals" },
      { id: "w5-tangible", text: "願景有形資產拆解", page: "goals" },
      { id: "w5-intangible", text: "願景無形資產拆解", page: "goals" },
      { id: "w5-living", text: "願景生活所需拆解", page: "goals" },
      { id: "w5-goal-assets", text: "財務目標資產表", page: "goals" },
    ],
  },
  {
    n: 6,
    title: "累積實力",
    items: [
      { id: "w6-goal-pl", text: "財務目標損益表（理想生活每年花費）", page: "goals" },
      { id: "w6-community", text: "在社群尋求所需內容" },
      { id: "w6-capital", text: "評估目前可投入的資金與達成年限", page: "dashboard" },
      { id: "w6-monthly", text: "評估每月可定期定額的金額", page: "dashboard", hint: "每月儲蓄，半年到一年投入市場一次即可" },
      { id: "w6-rate", text: "計算所需要的年化報酬率", page: "dashboard" },
    ],
  },
  {
    n: 7,
    title: "蓄勢待發",
    items: [
      { id: "w7-protect", text: "檢視目前保障型資金是否足夠", page: "survival" },
      { id: "w7-current-mix", text: "統整目前防守、進攻、樂透資金分配", page: "dashboard" },
      { id: "w7-target-mix", text: "初步制定防守、進攻、樂透型資金的合理分配", page: "goals" },
      { id: "w7-industries", text: "列出熱門產業、興趣產業清單" },
      { id: "w7-circle", text: "列出知識圈清單", hint: "自己真正了解的領域" },
    ],
  },
  {
    n: 8,
    title: "瞄準目標",
    items: [
      { id: "w8-rich-list", text: "致富清單" },
      { id: "w8-treasure", text: "聚寶盆" },
      { id: "w8-picks", text: "精選標的做水平配置" },
      { id: "w8-lottery", text: "列出樂透型標的" },
      { id: "w8-dream", text: DREAM, page: "goals" },
      { id: "w8-etf", text: "ETF 定期定額規劃", page: "monthly", hint: "加進滾動預算，並在資產新增帳戶" },
    ],
  },
  {
    n: 9,
    title: "準備設計",
    items: [
      { id: "w9-dream", text: DREAM, page: "goals" },
      { id: "w9-portfolio", text: "投資組合列表", page: "assets" },
      { id: "w9-banks", text: "台灣銀行帳戶盤點", page: "assets" },
      { id: "w9-auto-transfer", text: "自動轉帳設定（水庫儲蓄法）", hint: "臨櫃或網銀申請" },
      { id: "w9-offers", text: "到社群諮詢近期優惠開戶條件" },
    ],
  },
  {
    n: 10,
    title: "排兵部將",
    items: [
      { id: "w10-vision-v2", text: "人生願景 V2（圖像＋描述）", page: "goals" },
      { id: "w10-tw-broker", text: "台灣證券帳戶開戶", hint: "到機構官網或實體服務處辦理" },
      { id: "w10-us-broker", text: "美股帳戶開戶" },
      { id: "w10-fx", text: "外匯帳戶開戶" },
      { id: "w10-crypto-wallet", text: "加密貨幣錢包" },
      { id: "w10-crypto-account", text: "加密貨幣帳戶" },
      { id: "w10-passwords", text: "帳號密碼管理清單", hint: "用密碼管理器保存，不要存在這個 app 裡" },
      { id: "w10-dream", text: DREAM, page: "goals" },
    ],
  },
];

export interface Recurring {
  id: string;
  text: string;
  months: number;
  page?: Page;
}

/** 定期維護致富系統: checks to repeat once the ten weeks are done. */
export const RECURRING: Recurring[] = [
  { id: "r-budget", text: "檢視損益表與滾動預算", months: 1, page: "monthly" },
  { id: "r-gap", text: "檢視財務目標與現況的差距", months: 1, page: "dashboard" },
  { id: "r-dream", text: "夢想倉庫定期收集與整理", months: 1, page: "goals" },
  { id: "r-balance", text: "盤點資產負債表", months: 3, page: "assets" },
  { id: "r-portfolio", text: "檢視投資組合與四桶金配置", months: 3, page: "dashboard" },
  { id: "r-debts", text: "檢視債務", months: 3, page: "debts" },
  { id: "r-insurance", text: "檢視保險", months: 12, page: "insurance" },
  { id: "r-survival", text: "更新生存底線與緊急預備金", months: 12, page: "survival" },
];

export const ALL_ITEMS = WEEKS.flatMap(w => w.items);

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Which of the ten weeks `on` falls in (1–10), 11 once the plan is over, 0 before it starts. */
export function currentWeek(start: string | undefined, on: string): number {
  if (!start) return 0;
  const days = Math.floor((Date.parse(on) - Date.parse(start)) / 86_400_000);
  if (days < 0) return 0;
  return Math.min(11, Math.floor(days / 7) + 1);
}

export function weekProgress(data: AppData, week: Week) {
  const settled = week.items.filter(i => data.actions.status[i.id]).length;
  const done = week.items.filter(i => data.actions.status[i.id]?.s === "done").length;
  return { settled, done, total: week.items.length };
}

export function planProgress(data: AppData) {
  const settled = ALL_ITEMS.filter(i => data.actions.status[i.id]).length;
  return { settled, total: ALL_ITEMS.length };
}

/** Date `months` after `date` (YYYY-MM-DD), clamped to the month's last day. */
export function addMonthsIso(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  const x = new Date(y, m - 1 + months, Math.min(d, last));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** When each recurring check is next due; never-done checks are due now. */
export function recurringDue(data: AppData, on: string) {
  return RECURRING.map(r => {
    const last = data.actions.recurring[r.id];
    const next = last ? addMonthsIso(last, r.months) : on;
    return { ...r, last, next, due: next <= on };
  });
}
