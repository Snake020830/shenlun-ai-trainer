import { describe, expect, it } from "vitest";
import { parseMaterialText, serializeMaterialTextForPersistence } from "./materialParser";

describe("parseMaterialText", () => {
  it("preserves natural paragraphs inside one material", () => {
    const input = `材料一\n第一自然段。\n\n第二自然段。\n\n第三自然段。\n材料二\n另一则材料。`;
    const result = parseMaterialText(input);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("材料 1");
    expect(result[0].content).toBe("第一自然段。\n\n第二自然段。\n\n第三自然段。");
    expect(result[1].content).toBe("另一则材料。");
  });

  it("recognises common numbered material headings", () => {
    const input = `给定资料 1\n甲。\n资料二：乙。\n### 材料３\n丙。`;
    const result = parseMaterialText(input);
    expect(result.map(item => item.content)).toEqual(["甲。", "乙。", "丙."]);
  });

  it("keeps inline content after a heading", () => {
    const input = `材料一：这是第一段开头。\n继续第一则。\n材料2 这是第二则开头。\n继续第二则。`;
    const result = parseMaterialText(input);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("这是第一段开头。\n继续第一则。");
    expect(result[1].content).toBe("这是第二则开头。\n继续第二则。");
  });

  it("keeps the whole paste as one material when headings are absent", () => {
    const input = `第一段。\n\n第二段。\n\n第三段。`;
    const result = parseMaterialText(input);
    expect(result).toEqual([{ label: "材料 1", content: input }]);
  });

  it("normalizes Windows line endings without losing paragraph breaks", () => {
    const input = "材料1\r\n第一段。\r\n\r\n第二段。";
    const result = parseMaterialText(input);
    expect(result[0].content).toBe("第一段。\n\n第二段。");
  });

  it("preserves preface text by attaching it to the first material instead of dropping it", () => {
    const input = `背景说明。\n材料一\n正文。`;
    const result = parseMaterialText(input);
    expect(result[0].content).toBe("背景说明。\n正文。");
  });
});

describe("serializeMaterialTextForPersistence", () => {
  it("keeps real material boundaries while preventing internal paragraph breaks from being mis-split", () => {
    const input = `材料一\n第一段。\n\n第二段。\n\n第三段。\n材料二\n第四段。\n\n第五段。`;
    const serialized = serializeMaterialTextForPersistence(input);
    expect(serialized).toBe("第一段。\n第二段。\n第三段。\n\n第四段。\n第五段。");
    expect(serialized.split(/\n\s*\n/)).toHaveLength(2);
  });

  it("never explodes an unheaded multi-paragraph paste into multiple materials", () => {
    const input = `第一段。\n\n第二段。\n\n第三段。`;
    const serialized = serializeMaterialTextForPersistence(input);
    expect(serialized).toBe("第一段。\n第二段。\n第三段。");
    expect(serialized.split(/\n\s*\n/)).toHaveLength(1);
  });
});
