import { persistence } from "./storage";

export type MaterialBankCategory = "expression" | "mechanism" | "case" | "essay-angle";

export interface MaterialBankItem {
  id: string;
  category: MaterialBankCategory;
  title: string;
  content: string;
  themes: string[];
  sourceQuestionId: string;
  sourceQuestionTitle: string;
  sourceEvidence?: string;
  note: string;
  createdAt: string;
}

const STORE_KEY = "public:material-bank-v1";

function normalize(items: MaterialBankItem[]): MaterialBankItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function list(): Promise<MaterialBankItem[]> {
  return normalize(await persistence.getPublicSetting<MaterialBankItem[]>(STORE_KEY, []));
}

async function saveAll(items: MaterialBankItem[]): Promise<void> {
  await persistence.setPublicSetting(STORE_KEY, normalize(items));
}

export const materialBankStore = {
  list,

  async addMany(items: MaterialBankItem[]): Promise<MaterialBankItem[]> {
    const current = await list();
    const signatures = new Set(current.map(item => `${item.category}:${item.sourceQuestionId}:${item.title}`));
    const additions = items.filter(item => {
      const signature = `${item.category}:${item.sourceQuestionId}:${item.title}`;
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
    const next = normalize([...additions, ...current]);
    await saveAll(next);
    return next;
  },

  async updateNote(id: string, note: string): Promise<MaterialBankItem[]> {
    const current = await list();
    const next = current.map(item => item.id === id ? { ...item, note } : item);
    await saveAll(next);
    return next;
  },

  async remove(id: string): Promise<MaterialBankItem[]> {
    const current = await list();
    const next = current.filter(item => item.id !== id);
    await saveAll(next);
    return next;
  }
};
