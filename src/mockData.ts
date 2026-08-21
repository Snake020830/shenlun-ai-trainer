import type { MockReview, Question, ReviewPoint } from "./types";

export const questions: Question[] = [
  {
    id: "q-jqh-001", title: "概括 S 市“局区合一”改革的主要做法", year: 2024, region: "模拟题", type: "概括归纳", difficulty: "进阶", score: 10, wordLimit: 250,
    prompt: "根据给定资料，概括 S 市推进“局区合一”改革的主要做法。要求：全面、准确、有条理，不超过 250 字。", tags: ["机构改革", "概括做法", "要点分类"], source: "builtin",
    materials: [
      { id: "m1", label: "材料 1", content: "S 市围绕产业功能区建设推进“局区合一”改革。芯谷产业功能区实行一个班子、一套人员，推动管理力量向产业一线集中。发改、航空经济等主体局与功能区合署办公，审批、自然资源、住建交通、生态环境等职能局下沉力量，文旅、国资金融、人社、教育等事项局将服务延伸至功能区。" },
      { id: "m2", label: "材料 2", content: "改革后，原有 21 个内设机构整合为 6 个，174 项涉企审批事项下沉。当地建立“首席服务员+项目专员”机制，为重点项目提供一对一全流程服务，减少企业在部门之间往返，提升项目落地效率。" }
    ]
  },
  {
    id: "q-nmy-002", title: "分析“新民乐”走红引发的主要争议", year: 2025, region: "模拟题", type: "综合分析", difficulty: "挑战", score: 20, wordLimit: 400,
    prompt: "根据给定资料，归纳“新民乐”走红引发的主要议论，并作简要说明。不超过 400 字。", tags: ["文化", "争议归纳", "观点分类"], source: "builtin",
    materials: [
      { id: "m1", label: "材料 1", content: "近年来，一批青年演奏者通过改编传统曲目、融合电子音乐与舞台视觉，让民乐获得更大的传播舞台，并通过海外演出走向国际。支持者认为，新表达使传统艺术更贴近当代审美。" },
      { id: "m2", label: "材料 2", content: "也有人担心部分作品过度迎合市场，形式热闹却削弱民族音乐自身特色。业内人士认为，年轻从业者带来活力，但仍需提高专业素养与审美修养，在创新中守住传统文化的内在尺度。" }
    ]
  },
  {
    id: "q-fp-003", title: "围绕精准扶贫提出基层工作建议", year: 2023, region: "模拟题", type: "提出对策", difficulty: "基础", score: 15, wordLimit: 300,
    prompt: "根据材料中反映的问题，就提高基层精准帮扶质效提出建议。不超过 300 字。", tags: ["基层治理", "对策题"], source: "builtin",
    materials: [{ id: "m1", label: "材料 1", content: "部分基层帮扶仍停留在解决个别困难，缺少对产业、就业、教育、医疗等致贫因素的系统分析；部门数据分散，帮扶措施之间缺乏协同。" }]
  }
];

function point(title: string, hit: boolean, evidence: string, suggestion: string): ReviewPoint {
  return { title, status: hit ? "hit" : "missed", evidence, suggestion: hit ? undefined : suggestion };
}

function genericPoints(question: Question, text: string): ReviewPoint[] {
  const hasConcreteDetail = /\d|机制|措施|问题|原因|影响|提升|完善|建立|推进|加强|优化/.test(text);
  const hasStructure = /一是|二是|三是|首先|其次|再次|一、|二、|①|②|；/.test(text);
  const enoughLength = text.length >= Math.min(100, Math.round(question.wordLimit * 0.35));
  return [
    point("信息具体化", hasConcreteDetail, "本地导入题暂未配置人工标准要点，当前仅检查答案是否包含具体动作、事实或分析对象。", "避免只写抽象判断，尽量把材料中的主体、动作、问题或数量信息写出来。"),
    point("结构与分类", hasStructure, "当前模拟器只检查答案是否呈现可辨识的分层或并列结构。", "使用同类合并、异类分开，必要时用“一是、二是”等保持层次清楚。"),
    point("作答完整度", enoughLength, `本题字数上限 ${question.wordLimit} 字。`, "当前答案偏短；在不堆砌材料的前提下补足核心信息。")
  ];
}

export function buildMockReview(questionOrAnswer: Question | string, maybeAnswer?: string): MockReview {
  const question = typeof questionOrAnswer === "string" ? questions[0] : questionOrAnswer;
  const answer = typeof questionOrAnswer === "string" ? questionOrAnswer : (maybeAnswer ?? "");
  const text = answer.replace(/\s/g, "");
  let points: ReviewPoint[];

  if (question.id === "q-nmy-002") {
    points = [
      point("传播价值与文化影响", /传播|舞台|海外|国际|当代|走红/.test(text), "新表达扩大传播舞台并推动民乐走向海外。", "补充支持方关于传播扩展、国际传播或贴近时代审美的观点。"),
      point("从业者专业素养", /年轻|从业者|专业|素养|审美/.test(text), "青年从业者带来活力，同时需要提高专业与审美修养。", "把“青年加入带来活力”和“仍需提升专业素养”作为一组争议写出。"),
      point("创新与守本的张力", /创新|传统|守|特色|市场|迎合/.test(text), "创新表达与守住民族音乐特色之间存在张力。", "明确概括“创新还是守本”的核心争议，并写出市场迎合风险。")
    ];
  } else if (question.id === "q-fp-003") {
    points = [
      point("系统识别致贫因素", /系统|产业|就业|教育|医疗|致贫/.test(text), "基层需要从产业、就业、教育、医疗等维度系统分析致贫因素。", "对策应从“解决个别困难”上升到系统识别致贫原因。"),
      point("打通部门数据", /数据|共享|信息|平台/.test(text), "材料反映部门数据分散。", "提出数据共享、信息归集或统一台账等对应措施。"),
      point("强化部门协同", /协同|联动|统筹|机制/.test(text), "材料反映帮扶措施之间缺乏协同。", "补充跨部门统筹、协同推进或闭环落实机制。")
    ];
  } else if (question.id === "q-jqh-001") {
    points = [
      point("机构与人员整合", /合署|一个班子|机构|整合/.test(text), "一个班子、一套人员；原 21 个机构整合为 6 个。", "建议明确写出“机构整合/合署办公”，避免只写“优化组织架构”。"),
      point("审批和职能力量下沉", /下沉|审批/.test(text), "174 项涉企审批事项下沉，多个职能局力量下沉。", "这是高密度得分点，应直接写“审批权限和职能力量下沉”。"),
      point("项目服务机制", /首席|专员|一对一|服务/.test(text), "建立“首席服务员+项目专员”机制，一对一全流程服务。", "补充“首席+专员”服务机制及其全流程服务功能。")
    ];
  } else {
    points = genericPoints(question, text);
  }

  const hitCount = points.filter(item => item.status === "hit").length;
  const completion = hitCount / points.length;
  const lengthBonus = text.length >= Math.min(80, question.wordLimit * 0.35) ? 0.08 : 0;
  const ratio = Math.min(0.96, 0.48 + completion * 0.4 + lengthBonus);

  return {
    score: Number((question.score * ratio).toFixed(1)),
    maxScore: question.score,
    coverage: `${hitCount}/${points.length}`,
    classification: hitCount >= 2 ? "良好" : "需加强",
    expression: text.length > 60 ? "良好" : "偏简略",
    redundancy: text.length <= question.wordLimit ? "较低" : "偏高",
    summary: question.source === "local" ? "本地导入题尚无标准要点，当前反馈只用于验证训练与复盘流程，不代表真实评分。" : "这是用于验证产品交互的模拟批改。重点观察要点是否落到材料中的具体动作，而不是把该分数当作真实评分。",
    points,
    engine: "mock-v0.1"
  };
}
