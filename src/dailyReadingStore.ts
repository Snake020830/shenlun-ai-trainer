import { persistence } from "./storage";
import type { DailyReadingPlan } from "./dailyReading";

const PREFIX = "public:daily-reading.v1:";

function key(date: string): string {
  return `${PREFIX}${date}`;
}

function isPlan(value: unknown, date: string): value is DailyReadingPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as DailyReadingPlan;
  return plan.date === date && typeof plan.generatedAt === "string" && Array.isArray(plan.articles) && Array.isArray(plan.readArticleIds);
}

export const dailyReadingStore = {
  async load(date: string): Promise<DailyReadingPlan | null> {
    const stored = await persistence.getPublicSetting<unknown>(key(date), null);
    return isPlan(stored, date) ? stored : null;
  },

  async save(plan: DailyReadingPlan): Promise<void> {
    await persistence.setPublicSetting(key(plan.date), plan);
  },

  async markRead(plan: DailyReadingPlan, articleId: string): Promise<DailyReadingPlan> {
    const next = { ...plan, readArticleIds: [...new Set([...plan.readArticleIds, articleId])] };
    await persistence.setPublicSetting(key(plan.date), next);
    return next;
  }
};
