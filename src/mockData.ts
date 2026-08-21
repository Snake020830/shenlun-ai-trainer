import type { MockReview, Question } from "./types";

export const questions: Question[] = [
  {
    id: "q-jqh-001",
    title: "概括 S 市“局区合一”改革的主要做法",
    year: 2024,
    region: "模拟题",
    type: "概括归纳",
    difficulty: "进阶",
    score: 10,
    wordLimit: 250,
    prompt: "根据给定资料，概括 S 市推进“局区合一”改革的主要做法。要求：全面、准确、有条理，不超过 250 字。",
    tags: ["机构改革", "概括做法", "要点分类"],
    materials: [
      {
        id: "m1",
        label: "材料 1",
        content: "S 市围绕产业功能区建设推进“局区合一”改革。芯谷产业功能区实行一个班子、一套人员，推动管理力量向产业一线集中。发改、航空经济等主体局与功能区合署办公，审批、自然资源、住建交通、生态环境等职能局下沉力量，文旅、国资金融、人社、教育等事项局将服务延伸至功能区。"
      },
      {
        id: "m2",
        label: "材料 2",
        content: "改革后，原有 21 个内设机构整合为 6 个，174 项涉企审批事项下沉。当地建立“首席服务员+项目专员”机制，为重点项目提供一对一全流程服务，减少企业在部门之间往返，提升项目落地效率。"
      }
    ]
  },
  {
    id: "q-nmy-002",
    title: "分析“新民乐”走红引发的主要争议",
    year: 2025,
    region: "模拟题",
    type: "综合分析",
    difficulty: "挑战",
    score: 20,
    wordLimit: 400,
    prompt: "根据给定资料，归纳“新民乐”走红引发的主要议论，并作简要说明。不超过 400 字。",
    tags: ["文化", "争议归纳", "观点分类"],
    materials: [
      { id: "m1", label: "材料 1", content: "近年来，一批青年演奏者通过改编传统曲目、融合电子音乐与舞台视觉，让民乐获得更大的传播舞台，并通过海外演出走向国际。支持者认为，新表达使传统艺术更贴近当代审美。" },
      { id: "m2", label: "材料 2", content: "也有人担心部分作品过度迎合市场，形式热闹却削弱民族音乐自身特色。业内人士认为，年轻从业者带来活力，但仍需提高专业素养与审美修养，在创新中守住传统文化的内在尺度。" }
    ]
  },
  {
    id: "q-fp-003",
    title: "围绕精准扶贫提出基层工作建议",
    year: 2023,
    region: "模拟题",
    type: "提出对策",
    difficulty: "基础",
    score: 15,
    wordLimit: 300,
    prompt: "根据材料中反映的问题，就提高基层精准帮扶质效提出建议。不超过 300 字。",
    tags: ["基层治理", "对策题"],
    materials: [
      { id: "m1", label: "材料 1", content: "部分基层帮扶仍停留在解决个别困难，缺少对产业、就业、教育、医疗等致贫因素的系统分析；部门数据分散，帮扶措施之间缺乏协同。" }
    ]
  }
];

export function buildMockReview(answer: string): MockReview {
  const normalized = answer.replace(/\s/g, "");
  const hasDown = /下沉|审批/.test(normalized);
  const hasMerge = /合署|一个班子|机构|整合/.test(normalized);
  const hasService = /首席|专员|一对一|服务/.test(normalized);
  const hitCount = [hasDown, hasMerge, hasService].filter(Boolean).length;
  const score = Math.min(10, 5.5 + hitCount * 1.3 + (normalized.length >= 90 ? 0.6 : 0));

  return {
    score: Number(score.toFixed(1)),
    maxScore: 10,
    coverage: `${Math.min(9, 5 + hitCount)}/9`,
    classification: hitCount >= 2 ? "良好" : "需加强",
    expression: normalized.length > 60 ? "良好" : "偏简略",
    redundancy: normalized.length <= 250 ? "较低" : "偏高",
    summary: "结构已经形成，但应把抽象概括进一步落到材料中的制度动作和关键数量信息上。",
    points: [
      {
        title: "机构与人员整合",
        status: hasMerge ? "hit" : "partial",
        evidence: "一个班子、一套人员；原 21 个机构整合为 6 个。",
        suggestion: hasMerge ? undefined : "建议明确写出“机构整合/合署办公”，避免只写“优化组织架构”。"
      },
      {
        title: "审批和职能力量下沉",
        status: hasDown ? "hit" : "missed",
        evidence: "174 项涉企审批事项下沉，多个职能局力量下沉。",
        suggestion: hasDown ? undefined : "这是高密度得分点，应直接写“审批权限和职能力量下沉”。"
      },
      {
        title: "项目服务机制",
        status: hasService ? "hit" : "missed",
        evidence: "建立“首席服务员+项目专员”机制，一对一全流程服务。",
        suggestion: hasService ? undefined : "补充“首席+专员”服务机制及其全流程服务功能。"
      }
    ]
  };
}
