import taxonomy from "../../rules/error-taxonomy.json";

export interface ErrorTaxonomyEntry {
  id: string;
  label: string;
  definition: string;
  severity: string;
}

const entries = taxonomy.categories as ErrorTaxonomyEntry[];

export const ERROR_TAXONOMY_VERSION = taxonomy.version;
export const ERROR_TAXONOMY = entries;
export const ERROR_CODES = new Set(entries.map(item => item.id));

export function isKnownErrorCode(value: string): boolean {
  return ERROR_CODES.has(value);
}
