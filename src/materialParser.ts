export interface ParsedMaterialBlock {
  label: string;
  content: string;
}

const MATERIAL_HEADING = /^\s*(?:#{1,6}\s*)?(?:第\s*)?(?:给定资料|材料|资料)\s*([0-9０-９一二三四五六七八九十百]+)\s*(?:[：:、.．\-—]\s*)?(.*)$/u;

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function cleanContent(lines: string[]): string {
  return lines.join("\n").trim();
}

/**
 * Parse pasted Shenlun materials conservatively.
 *
 * Rules:
 * 1. Recognise explicit headings such as 材料一 / 材料1 / 给定资料 2 / 资料三.
 * 2. Blank lines inside one material are preserved and NEVER treated as material separators.
 * 3. If no explicit material heading is found, keep the entire paste as one material.
 *
 * This intentionally prefers under-splitting to corrupting a real exam by splitting natural paragraphs.
 */
export function parseMaterialText(raw: string): ParsedMaterialBlock[] {
  const normalized = normalizeLineEndings(raw).trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const headings = lines
    .map((line, index) => ({ index, match: line.match(MATERIAL_HEADING) }))
    .filter((item): item is { index: number; match: RegExpMatchArray } => Boolean(item.match));

  if (!headings.length) {
    return [{ label: "材料 1", content: normalized }];
  }

  const preface = cleanContent(lines.slice(0, headings[0].index));
  const result: ParsedMaterialBlock[] = [];

  for (let position = 0; position < headings.length; position += 1) {
    const current = headings[position];
    const next = headings[position + 1];
    const inlineContent = current.match[2]?.trim() ?? "";
    const bodyLines = lines.slice(current.index + 1, next?.index ?? lines.length);
    const body = cleanContent(inlineContent ? [inlineContent, ...bodyLines] : bodyLines);
    const content = position === 0 && preface
      ? cleanContent([preface, body].filter(Boolean))
      : body;

    if (!content) continue;
    result.push({ label: `材料 ${result.length + 1}`, content });
  }

  // If headings were detected but none contained content, keep the original text intact rather than losing data.
  return result.length ? result : [{ label: "材料 1", content: normalized }];
}
