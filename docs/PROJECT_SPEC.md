# 申论 AI Trainer — V0.1 产品规格

## 当前目标

先做一个真正可用、可追溯的申论训练桌面软件，再接真实 AI 评分；不把聊天界面或一次性模型回答当作产品主体。

## V0.1 当前闭环

1. 从“今日训练”或“题库”选择题目；
2. 也可以手工粘贴题干与材料，建立本地题目；
3. 阅读材料并在独立作答区输入答案；
4. 草稿自动保存在本机；
5. 提交后经过统一 `gradingService` 生成结构化模拟批改；
6. 作答、得分、provider/ruleset 元数据与当次 review snapshot 进入训练记录；
7. 未覆盖要点自动进入“错题复盘”；
8. 可以打开历史记录查看原答案与当次反馈，并重新作答。

## 信息架构

- 今日训练：推荐题、训练连续性、近期状态。
- 题库：内置样题 + 本地导入题，支持搜索与训练入口。
- 题目导入：手工录入题目信息、作答要求和多段材料。
- 作答工作台：材料、作答、批改三栏；提交前隐藏得分要点。
- 错题复盘：按当次批改中的遗漏/部分覆盖要点生成复盘队列。
- 训练记录：保存每次作答、得分和批改快照，可进入详情页。
- 设置：后续接模型 provider、本地数据位置、批改严格度和隐私选项。

## 数据与持久化

- Desktop: Tauri 2。
- Frontend: React + TypeScript + Vite。
- 桌面运行时：Tauri SQL plugin + SQLite，数据库 `sqlite:shenlun-trainer.db`。
- 浏览器 Vite 开发模式：localStorage fallback。
- SQLite V1：`app_meta / questions / materials / drafts / training_records`。
- `materials` 使用 `(question_id, id)` 复合主键。
- 旧 V0.1 localStorage 数据首次桌面启动时迁移至 SQLite；迁移状态写入数据库 `app_meta`，失败后可重试。
- persistence API 全部异步化；UI 不直接调用 localStorage 或 SQL。

## 评分架构

规则层：

- `rules/shenlun-grading.md`：模型无关评分方法论；
- `rules/error-taxonomy.json`：结构化错误分类。

运行时层：

- `src/grading/contracts.ts`：provider contract、结果验证、规则版本和 provenance；
- `src/grading/artifacts.ts`：五阶段可审计中间产物 schema；
- `src/grading/mockProvider.ts`：当前 mock provider；
- `src/grading/index.ts`：UI 唯一评分入口。

真实 AI 目标工作流固定为：

1. 材料盲抽；
2. rubric 构造；
3. 答案映射；
4. 字数与表达审计；
5. 参考答案交叉验证。

机构/老师参考答案只能在盲抽和初步 rubric 完成后作为交叉验证输入，不能作为唯一真值反向关键词匹配。

## 数据原则

- 每次提交保存完整 StructuredReview snapshot，历史记录不能因未来模型变化被静默重算。
- review 可记录 `engine / providerId / rulesetVersion / generatedAt`。
- provider 输出必须先通过结构验证；分数越界、满分不匹配、字段错误时 fail closed，不写入历史记录。
- 本地导入题没有人工标准要点时，当前 mock 不冒充内容评分，只给明确标识的通用模拟反馈。
- 不保存或展示模型私有 chain-of-thought；只保存可审计的材料依据、rubric 映射和诊断结果。

## 设计原则

- 正式训练时不提前暴露评分要点，防止提示效应。
- 分数是结构化判断的结果，要点—材料依据—修改建议是核心。
- 同类压缩前先展开候选点；多对象先分别识别，不强行合并。
- 问题、原因、措施、成效、意义等不同要素必须区分。
- 字数不足时先压缩点内表达，最后才删除独立得分维度。
- provider 可以更换，但不能绕过规则层和结果验证层。

## CI

- Frontend CI：Node 24，TypeScript + Vite build。
- Desktop CI：Windows + Node 24 + stable Rust，执行前端 build 与 Tauri `cargo check`。
- 两条 workflow 均按 workflow + ref 设置 concurrency，新提交自动取消同分支过时 run。

## 尚未进入正式能力

- 真实 AI 材料理解与评分 provider；
- 标准答案/老师答案导入与评分后对照 UI；
- PDF、图片、OCR 真题导入；
- API key 的安全凭据存储；
- 人工标注集上的评分一致性与误差评估；
- 能力画像、自适应推荐；
- 模考计时、套题与整卷训练。
