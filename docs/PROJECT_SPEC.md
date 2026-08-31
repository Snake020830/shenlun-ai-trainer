# 申论 AI Trainer — V0.1 产品规格

## 当前目标

构建一个真正可用、可追溯的申论训练桌面软件。产品主体是“题目—独立作答—结构化批改—复盘—历史证据链”，不是聊天界面，也不是一次性模型回答。

V0.1 已完成远程 AI 评分的工程链路，但当前诊断分仍处于 `uncalibrated` 状态；在人工标注集校准完成前，不解释为正式申论阅卷分。

## V0.1 当前闭环

1. 从“今日训练”或“题库”选择题目；
2. 可手工粘贴题干与材料建立本地题目；
3. 导题时可选录入老师/机构参考答案，正常作答阶段完全隐藏；
4. 阅读材料并在独立作答区输入答案；
5. 草稿自动保存在本机；
6. 提交后统一经过 `gradingService`：remote 未启用时使用明确标识的 V0.1 mock，remote 启用时执行五阶段结构化 workflow；
7. 作答、得分、provider/ruleset/scoring policy 元数据与当次 review snapshot 进入训练记录；
8. 未覆盖/部分覆盖要点自动进入错题复盘；
9. 如存在参考答案，Stage 5 的交叉验证差异进入 review snapshot，但不自动改分；
10. 历史记录可查看原答案、当次反馈、参考答案交叉验证结果，并重新作答。

## 信息架构

- 今日训练：推荐题、训练连续性、近期状态。
- 题库：内置样题 + 本地导入题，支持搜索与训练入口。
- 题目导入：题目信息、作答要求、多段材料，以及可选老师/机构参考答案。
- 作答工作台：材料、作答、批改三栏；提交前隐藏得分要点和参考答案。
- 批改结果：得分、覆盖、分类、表达、冗余、逐点材料依据、错误 taxonomy、Stage 5 交叉验证。
- 错题复盘：按当次 review snapshot 中的遗漏/部分覆盖要点组织下一轮训练。
- 训练记录：保存每次作答、评分 provenance 与 immutable review snapshot。
- 设置：remote provider、Responses/Chat 协议、模型、推理强度、timeout、系统凭据和连通性测试。

## 数据与持久化

- Desktop：Tauri 2。
- Frontend：React + TypeScript + Vite。
- 桌面运行时：Tauri SQL plugin + SQLite，数据库 `sqlite:shenlun-trainer.db`。
- 浏览器 Vite 开发模式：localStorage fallback，仅用于 UI 开发；不允许远程 AI 评分。
- SQLite V1：`app_meta / questions / materials / drafts / training_records`。
- SQLite V2：为 `questions` 增加可选 `reference_answer_content / reference_answer_source`。
- `materials` 使用 `(question_id, id)` 复合主键。
- 旧 V0.1 localStorage 数据首次桌面启动时迁移至 SQLite；迁移状态写入数据库 `app_meta`，失败可重试。
- persistence API 全部异步化；UI 不直接调用 localStorage 或 SQL。
- 远程 provider 的公开配置可以进入 `app_meta`，API key/token 不允许进入 SQLite 或 localStorage。

## 评分架构

### 规则层

- `rules/shenlun-grading.md`：模型无关评分方法论 v0.1.0；
- `rules/error-taxonomy.json`：结构化错误分类。

### 运行时层

- `src/grading/contracts.ts`：provider contract、StructuredReview 结果验证、规则版本和 provenance；
- `src/grading/artifacts.ts`：五阶段可审计中间产物 schema；
- `src/grading/stagePrompts.ts`：五个独立结构化任务；
- `src/grading/workflowValidation.ts`：stage artifact 运行时验证；
- `src/grading/remote/remoteWorkflowProvider.ts`：remote 五阶段编排；
- `src/grading/scorePolicy.ts`：可替换 score policy；
- `src/grading/reviewAssembler.ts`：将 artifacts 组装为 StructuredReview；
- `src/grading/mockProvider.ts`：产品交互用 mock；
- `src/grading/index.ts`：UI 唯一评分入口，动态解析当前 provider。

### 五阶段 workflow

1. **材料盲抽**：只看题干与材料，不看考生答案和参考答案；
2. **Rubric 构造**：从材料候选点形成可得分信息维度；
3. **答案映射**：逐点判断 `hit / partial / missed`，附错误 taxonomy；
4. **字数与表达审计**：独立检查字数、重复、低价值表达和压缩方向；
5. **参考答案交叉验证**：仅在前四阶段完成后使用老师/机构答案，发现可能遗漏维度、参考答案独有维度和归并粒度差异。

Stage 5 只产生审计/复盘信息：不得反向改写已形成的盲抽 rubric，也不得自动改变本次 score policy 计算结果。

## Remote provider

当前支持 OpenAI-compatible：

- Responses API（默认、优先）；
- Chat Completions（兼容模式）。

Remote provider 默认关闭。显式启用后：

- 结构化 JSON 请求由统一 transport 发出；
- Responses 请求设置 `store: false`；
- Responses 模式可选 `reasoning.effort`：Provider 默认 / Low / Medium / High / XHigh；
- `provider-default` 表示完全不发送 reasoning effort；
- Chat Completions 兼容模式不发送 reasoning 参数，避免不同兼容服务因未知字段失败；
- 五阶段请求不强制发送 `temperature`；
- 任一阶段结构、引用关系或网络校验失败时 fail closed，不写训练历史。

## 凭据与网络安全

- API key 由 Rust 写入操作系统原生凭据库：Windows Credential Manager / macOS Keychain / Linux Secret Service。
- React 不存在“读取并返回 API key”的接口，只保存/删除凭据并传递 `secretRef`。
- Rust secure executor 从系统凭据库取 key 后直接发 HTTP 请求。
- URL 禁止内嵌 username/password；远程目标必须 HTTPS，localhost 开发例外。
- HTTP redirect 禁用；timeout 为 1–300 秒；响应体上限 2 MiB。
- 非 2xx 错误不把 provider 原始 body 回显到 UI。
- provider 公开配置使用字段 allow-list；临时 `apiKey/bearerToken` 等额外字段不会被普通持久化。

## Review 与历史证据

每次提交保存完整 StructuredReview snapshot，包括：

- score / maxScore；
- coverage / classification / expression / redundancy；
- points[] 与材料依据；
- error codes；
- engine / providerId / rulesetVersion / generatedAt；
- scoringPolicy / calibrationStatus；
- 可选 Stage 5 referenceCrossCheck。

历史记录不能因未来模型、规则或 score policy 升级被静默重算。

## 当前评分边界

Remote workflow 已经可以执行真实模型调用，但当前 score policy 是：

`equal-rubric-diagnostic@0.1.0`

状态：`uncalibrated`。

因此：

- 可以评估材料抽取、rubric、答案映射和诊断质量；
- 可以比较不同 provider/模型的结构化输出；
- 可以做 Stage 5 参考答案交叉验证；
- **不能把当前数值分数解释为正式申论阅卷分。**

只有人工 benchmark/calibration 达到门槛后，才允许把 `calibrationStatus` 提升为 `validated`。

## 设计原则

- 正式训练时不提前暴露评分要点或参考答案，防止提示效应。
- 分数必须是结构化判断的结果，而不是先给分再找理由。
- 同类压缩前先展开候选点；多对象先分别识别，不强行合并。
- 问题、原因、措施、成效、意义等不同要素必须区分。
- 字数不足时先压缩点内表达，最后才删除独立得分维度。
- 参考答案是 Stage 5 外部校验信号，不是唯一真值。
- provider 可以更换，但不能绕过规则层、artifact validators 和 review validator。
- 不保存或展示模型私有 chain-of-thought；只保留可审计的材料依据、rubric 映射和诊断。

## CI / 测试

- Frontend CI：Node 24，运行 Vitest、TypeScript 与 Vite build。
- Desktop CI：Windows + Node 24 + stable Rust，运行前端 build 与 Tauri `cargo check`。
- workflow 使用 concurrency，新提交自动取消同分支过时 run。
- 当前单测覆盖：remote protocol、provider config/sanitizer、workflow 引用关系、taxonomy、score policy、review assembler、参考答案 Stage 1–4 隔离与 Stage 5 注入。

## 尚未进入正式能力

- 人工标注集上的评分一致性与 score policy 校准；
- 真实桌面环境中的 provider/keyring 端到端人工验证；
- PDF、图片、OCR 真题导入；
- 能力画像、自适应推荐；
- 模考计时、套题与整卷训练；
- 在 `calibrationStatus=validated` 之前的“正式 AI 分数”。
