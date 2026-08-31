# DEVLOG

## 2026-08-22 — 题库导入与 Shenlun Grader Skill 落地

### 公开真题题库

- 新增可恢复的“一键初始化近10年题库”：主结构化来源扫描 → 待处理整卷结构校验 → 已通过整卷导入；重复运行复用既有状态和确定性题目 ID。
- 失败/结构阻断项不在一键流程中反复请求，继续保留“重试失败项”作为显式恢复入口。
- 整卷拆题时，小题只保存题干明确引用的材料；文章写作保留整卷材料，减少无关上下文进入作答与批改。
- 若题干引用的材料号在解析结果中缺失，正式导入 fail closed。
- 题库初始化统计按唯一试卷分组，不把同卷不同公开来源版本重复计数。
- 正文仍按需读取并保存在用户本机；GitHub 仓库不打包第三方整卷全文。

### 第一套真实来源验收：2025 国考副省级

- 固定第一套桌面端到端验收来源为公开真题库的 2025 国考副省级申论卷；仓库只保存来源 URL 与结构预期，不提交第三方整卷正文。
- 对真实页面结构进行核查后，验收预期固定为：4 则材料、5 道题。
- 第1题应识别为综合分析；第2题综合分析；第3题贯彻执行；第4题提出对策；第5题文章写作。
- 真实页面第4题出现“给定 资 料 4”式异常字间空格。parser 已新增材料引用噪声归一化，可处理半角/全角空格，不再把该题错误阻断为“未识别明确材料编号”。
- 真实国考题型表达补充进分类器：关系/协同机制解释进入综合分析；“草拟…工作指南/指南”等进入贯彻执行。
- 新增真实来源噪声与真实题型措辞的回归测试，测试只保留必要结构片段，不保存整卷正文。

### Shenlun Grader Skill v0.3

- 日常 `gradingService.grade()` 继续统一进入 `shenlunGraderSkill`；当前 Skill 版本为 `shenlun-grader-skill@0.5.0`。
- 五类题型专用约束：概括归纳、提出对策、综合分析、贯彻执行、文章写作。
- 四类小题的题型约束已注入材料盲抽、rubric 构造、答案映射、字数审计和参考答案交叉验证全部五阶段。
- 当前远程 score policy 仍是小题“材料点 → rubric → 逐点映射”逻辑；文章写作不再误用该流程生成数值分，真实 AI 作文评分等待专用论证/结构 workflow。

### Stage 3 error taxonomy 契约

- 发现真实 provider 接口缺口：本地 validator 会拒绝未知 error code，但旧 Prompt 只要求“使用系统 taxonomy”，没有把正式代码集合传给模型。
- Stage 3 现在把 `rules/error-taxonomy.json` 的正式代码、标签和定义显式写入 Prompt。
- Stage 3 JSON Schema 同时把 `errorCodes` 约束为正式 taxonomy ID 枚举；模型不得自造代码。
- `hit` 且没有实质错误时允许返回空 `errorCodes`，避免为了满足结构而制造伪错误。
- 因 Prompt 行为再次实质改变，`STAGE_PROMPTSET_VERSION` 升级为 `shenlun-stage-prompts@0.5.0`；Benchmark 不同版本禁止混算。

### Provider 真实协议自检

- 设置页已有“快速测试连接”和“完整自检并启用 AI 批改”，无需再造第二套 provider smoke UI。
- 快速测试只验证网络与简单结构化 JSON。
- 完整自检使用短内置申论题真实运行 Stage 1—4，不写 TrainingRecord、不进入 Human Gold，全部通过后才自动启用 remote provider。
- 完整自检成功只说明 provider 可以执行当前 Skill 协议，不代表诊断分已经完成 Human Gold 校准。

### 回归与工程门禁

- 新增题目材料范围、缺失引用材料、题库初始化可恢复性、题型 Skill 注入、作文错误路由、真实材料引用空格、真实国考题型措辞、error taxonomy Prompt/schema 契约等测试。
- Frontend CI 的 push 门禁已覆盖当前开发分支 `feat/v0.1-product-shell`，后续该分支提交会自动跑 Vitest 与 TypeScript/Vite build。
- Desktop CI 触发规则暂不改变；桌面 secure provider、Tauri 网络抓取与安装包仍按桌面验收流程确认。

## V0.1 — product shell + remote grading + benchmark foundation

### 产品闭环

- 建立 Tauri 2 + React + TypeScript + Vite 工程骨架。
- 完成今日训练、题库、三栏作答工作台、结构化批改、错题复盘、训练记录详情。
- 支持手工导入题型、分值、字数、标签、题干、多段材料。
- 导题时可选录入老师/机构参考答案；正常作答阶段完全隐藏。
- 每次提交保存 immutable review snapshot；未来模型或规则升级不会静默重算旧记录。

### SQLite 与持久化

- persistence adapter 全部异步化。
- Tauri 桌面运行时使用 `tauri-plugin-sql` SQLite；浏览器开发模式保留 localStorage fallback。
- SQLite V1：`app_meta / questions / materials / drafts / training_records`。
- SQLite V2：`questions` 增加 `reference_answer_content / reference_answer_source`。
- `materials` 使用 `(question_id, id)` 复合主键。
- 旧 localStorage 题目、草稿和训练记录支持幂等迁移。
- 草稿采用“先读后写”门禁；启动 hydration 与当前会话状态按 ID 合并。
- provider 公开配置存入 `app_meta`；secret-like public setting key 直接拒绝。

### 评分规则与 contract

- `rules/shenlun-grading.md`：模型无关评分方法论 v0.1.0。
- `rules/error-taxonomy.json`：遗漏、部分覆盖、要素混淆、过度抽象、过度合并、机制缺失、情态错置等 taxonomy。
- `StructuredReview` 保存 provider/ruleset/generation/scoring-policy provenance。
- provider 非法结构、越界分数、满分不匹配时 fail closed。
- 不保存模型私有 chain-of-thought，只保存可审计结构化证据和诊断。

### 五阶段 remote workflow

1. 材料盲抽；
2. rubric 构造；
3. 考生答案逐点映射；
4. 字数与表达审计；
5. 可选老师/机构参考答案交叉验证。

Runtime validators 检查：

- material/candidate/rubric ID 唯一性与引用；
- rubric/mapping 完整性；
- error taxonomy code；
- charCount 与真实答案；
- wordLimit；
- review 分值范围与结构。

### 参考答案隔离

- `questionPayload()` 不包含 `referenceAnswer`。
- Stage 1–4 看不到已保存参考答案。
- Stage 5 才显式收到 reference answer。
- 回归测试使用唯一标记验证隔离边界。
- Stage 5 输出进入 StructuredReview snapshot，可在当前批改和历史复盘中查看。
- Reference cross-check 不回写盲抽 rubric，也不自动改变 score。

### Score policy

- 当前 policy：`equal-rubric-diagnostic@0.1.0`。
- 状态：`uncalibrated`。
- policy 与材料抽取/映射层解耦。
- UI 与 summary 明确当前数值不能解释为正式阅卷分。

### Remote provider 与安全

- 支持 OpenAI-compatible Responses API / Chat Completions。
- 默认 Responses；remote 默认关闭。
- Responses `store: false`。
- 不强制 `temperature`。
- `reasoningEffort`：Provider default / Low / Medium / High / XHigh；仅 Responses 发送。
- Rust `keyring` 使用 OS 原生凭据库保存 API key；React 无 API-key 读取接口。
- `reqwest` secure executor：HTTPS（localhost 例外）、禁止 redirect、URL 禁内嵌凭据、timeout 1–300 秒、响应体 2 MiB 上限、HTTP 错误不回显 provider 原始 body。
- public provider config 采用 allow-list，API key/token 无法混入普通持久化。

### Benchmark / calibration harness

当前已经从“指标草图”推进到可复现实验数据链：

#### Human Gold

- `annotationStatus: draft | adjudicated`；
- draft 只保存真实题目/材料/答案快照，gold 为空；
- 任何指标拒绝 draft；
- calibration/holdout score 指标要求真实 human score observation。

#### Debug gold fixtures

`benchmark/cases/debug/` 已加入 3 个 adjudicated synthetic fixtures：

1. 局区合一：项目服务机制 partial，覆盖 `MECHANISM_LOSS`；
2. 新民乐：专业素养维度 missed，覆盖 `OMISSION`；
3. 精准帮扶：多维致贫分析 partial，覆盖 `OVER_ABSTRACTION`。

三者均 `humanScores: []`，只用于结构/rubric/mapping/taxonomy debug，禁止 score calibration。

#### Benchmark Draft

- `createBenchmarkDraft.ts` 可把真实 Question + Answer 快照成待人工标注 case；
- 不生成任何伪 gold；
- draft 无法进入 metrics。

#### Immutable Model Run

- `createBenchmarkModelRun.ts` 冻结模型原始 rubric、mapping、error codes 和 score；
- 保存 provider/model/protocol/reasoning effort；
- 保存 ruleset/workflow/promptset/scoring policy versions；
- 记录 `referenceCrossCheckUsed`；
- Model Run 是模型判断唯一真源。

#### Human Alignment

- Alignment 只保存 gold/predicted rubric ID 关系和 mapping ID 关系；
- 不保存、覆盖模型预测的 status/error/score；
- `match / acceptable-merge / acceptable-split` 有严格基数约束；
- 一拆多时模型状态由 Model Run 自动聚合：全 hit→hit，全 missed→missed，其余→partial；error codes 取并集。

#### Metrics

- rubric recall / precision / F1；
- unmatched gold/predicted rubric；
- mapping coverage / exact status accuracy / confusion；
- taxonomy micro precision/recall/F1；
- score MAE/RMSE/signed error/normalized MAE。

Rubric 质量与答案 mapping 质量独立报告，避免模型自己漏 rubric 点后仍靠“剩余点判断正确”获得虚高评价。

#### Validation Report

- `validationReport.ts` 汇总同一 split、同一实验签名的 cases/runs/alignments；
- 实验签名包括 provider/model/protocol/reasoning/ruleset/workflow/promptset/score policy/Stage-5 条件；
- 不同实验签名禁止混算；
- 报告固定 `validationStatus = evidence-only`，不会自动把应用升级成 validated。

### 设置页

已启用评分引擎控制页：remote 开关、protocol、model、base URL、reasoning effort、timeout、public config、OS keyring 凭据写入/删除、主动连接测试和完整批改链自检。浏览器 Vite 模式禁止 remote grading。

### CI / 测试

- Frontend CI：Node 24 + Vitest + TypeScript/Vite build。
- Desktop CI：Windows + Node 24 + stable Rust + frontend build + `cargo check`。
- keyring + reqwest + Tauri secure commands 已有 Windows `cargo check` 成功记录。
- concurrency 自动取消同分支过时 run。
- 单测覆盖 provider protocol/config、workflow validation、参考答案隔离、benchmark fixture、draft lifecycle、immutable model run、rubric alignment、split aggregation、metrics 和 validation report。

### 当前边界

- Remote workflow 已具备真实模型调用能力，但 score policy 未校准，因此不是正式 AI 阅卷分。
- 四类小题已进入题型专用 remote workflow；文章写作仍需独立作文评分 workflow，当前不会误套小题数值评分。
- Benchmark 工程与 3 个 synthetic debug gold 已建立，但尚未填充真实独立人工 calibration/holdout cases。
- 尚未在用户真实桌面环境完成一套公开真题的扫描/解析/拆题入库 + 一道真实非作文题的 remote Skill 批改联合验收。
- 尚未形成基于真实 human gold 的 validation report。
- 未做 PDF/图片/OCR 真题导入、能力画像、自适应推荐、整卷模考。

### 下一阶段

1. 拉取当前分支并通过最新 Frontend 回归测试与 production build；
2. 在 Tauri 桌面版用 2025 国考副省级固定样本完成“扫描 → 4材料/5题结构核对 → 拆题入库”的真实验收；
3. 在设置页保存真实 provider 凭据，先运行“完整自检并启用 AI 批改”；
4. 从 2025 国考副省级选一道非作文题提交真实作答，完成 secure provider + Shenlun Grader Skill v0.3 人工验收；
5. 从真实训练记录生成少量 benchmark drafts；
6. 完成独立人工材料点/rubric/mapping/taxonomy/human-score adjudication；
7. 固定 calibration/holdout split；
8. 跑真实 Model Runs，另建 Human Alignment，生成 validation reports；
9. 比较模型与 reasoning effort，优先解决 rubric 遗漏和 mapping/taxonomy 错误；
10. 校准 score policy；
11. 设计文章写作专用评分 workflow；
12. 只有证据达到门槛后，才将 `calibrationStatus` 从 `uncalibrated` 升级为 `validated`。
