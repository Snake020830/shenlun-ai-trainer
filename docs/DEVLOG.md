# DEVLOG

## V0.1 — product shell + remote grading foundation

### 产品闭环

- 建立 Tauri 2 + React + TypeScript + Vite 工程骨架。
- 完成今日训练、题库、三栏作答工作台、结构化批改、错题复盘、训练记录详情。
- 新增手工题目导入：题型、分值、字数、标签、题干、多段材料均可录入。
- 导题时可选录入老师/机构参考答案；正常作答界面不展示参考答案。
- 每次提交保存 immutable review snapshot；历史记录不会被未来模型或规则升级静默重算。

### SQLite 与持久化

- persistence adapter 全部异步化。
- Tauri 桌面运行时使用 `tauri-plugin-sql` SQLite；浏览器开发模式保留 localStorage fallback。
- SQLite V1：`app_meta / questions / materials / drafts / training_records`。
- SQLite V2：`questions` 增加 `reference_answer_content / reference_answer_source`。
- `materials` 使用 `(question_id, id)` 复合主键。
- 旧 localStorage 题目、草稿和训练记录支持幂等迁移至 SQLite。
- 草稿采用“先读后写”门禁，启动 hydration 与当前会话状态按 ID 合并。
- provider 公开配置存入 `app_meta`；secret-like public setting key 直接拒绝。

### 评分规则与 contract

- `rules/shenlun-grading.md`：模型无关评分方法论 v0.1.0。
- `rules/error-taxonomy.json`：遗漏、部分覆盖、要素混淆、过度抽象、过度合并、机制缺失、情态错置等错误 taxonomy。
- `StructuredReview` 保存 provider/ruleset/generation/scoring policy provenance。
- provider 返回非法结构、越界分数、满分不匹配时 fail closed。
- 不保存模型私有 chain-of-thought，只保存可审计结构化证据和诊断。

### 五阶段 remote workflow

已实现：

1. 材料盲抽；
2. rubric 构造；
3. 考生答案逐点映射；
4. 字数与表达审计；
5. 可选老师/机构参考答案交叉验证。

运行时 validators 会检查：

- material/candidate/rubric ID 唯一性与引用关系；
- 每个 rubric point 必须存在 mapping；
- error taxonomy code 必须有效；
- charCount 必须与真实答案一致；
- wordLimit 不允许被模型改写；
- review 输出结构与分值范围必须有效。

### 参考答案隔离

- `questionPayload()` 不包含 `referenceAnswer`。
- Stage 1–4 完全看不到已保存参考答案。
- Stage 5 才显式收到 reference answer。
- 新增回归测试，使用唯一标记验证 Stage 1–4 不泄漏、Stage 5 明确注入。
- Stage 5 输出进入 StructuredReview snapshot，可在当前批改与历史复盘中查看。
- Reference cross-check 不回写盲抽 rubric，也不自动改变本次 score。

### Score policy

- 当前 policy：`equal-rubric-diagnostic@0.1.0`。
- 当前状态：`uncalibrated`。
- policy 与材料抽取/映射层解耦，未来可基于人工 benchmark 整体替换。
- UI 与 summary 明确说明当前数值不能解释为正式阅卷分。

### Remote provider 与推理配置

- 支持 OpenAI-compatible Responses API 与 Chat Completions。
- 默认使用 Responses API，remote provider 默认关闭。
- Responses 请求显式 `store: false`。
- 五阶段不再强制 `temperature`。
- 新增 `reasoningEffort` 公开配置：Provider 默认 / Low / Medium / High / XHigh。
- `provider-default` 表示请求中完全不发送 reasoning effort。
- Responses 模式发送 `reasoning: { effort }`；Chat compatibility 暂不发送 reasoning 字段。
- 设置页会在 Chat 模式禁用推理强度控件，避免假配置。

### 凭据与网络安全

- Rust `keyring` 使用 OS 原生凭据库保存 API key。
- React 无 API key 读取接口；只允许写入/删除。
- Rust `secure_post_json` 在发请求时通过 `secretRef` 读取凭据。
- 使用 reqwest；禁止自动 redirect。
- 只允许 HTTPS，localhost 开发例外。
- URL 禁止内嵌 username/password。
- timeout 1–300 秒；响应体最大 2 MiB。
- provider HTTP 错误不回显原始 body。
- provider public config 采用字段 allow-list，`apiKey/bearerToken` 等额外字段无法混入普通持久化。

### 设置页

已启用真正的评分引擎控制页：

- remote 开关；
- Responses / Chat protocol；
- model；
- base URL；
- reasoning effort；
- timeout；
- public config 保存/恢复；
- API key 写入/删除系统凭据库；
- 主动连接测试。

浏览器 Vite 模式禁止启用 remote grading。

### CI / 测试

- Frontend CI：Node 24 + Vitest + TypeScript/Vite build。
- Desktop CI：Windows + Node 24 + stable Rust + frontend build + `cargo check`。
- keyring + reqwest + Tauri secure commands 已有 Windows `cargo check` 成功记录。
- concurrency 自动取消同分支过时 run。
- 单测覆盖 remote protocol、provider config、public config sanitizer、workflow validation、review assembler、score policy、参考答案隔离等关键边界。

### 当前边界

- Remote workflow 已具备真实模型调用能力，但当前 score policy 未校准，因此不是正式 AI 阅卷分。
- 未在用户真实桌面环境完成 API key 写入/连接测试/一次完整五阶段真实 provider 人工验收。
- 未建立人工批改 benchmark。
- 未做 PDF/图片/OCR 真题导入、能力画像、自适应推荐、整卷模考。

### 下一阶段

1. 跑最终 Frontend/Desktop CI，冻结这一版工程基线；
2. 使用真实桌面环境完成凭据与 provider 端到端验收；
3. 建立人工标注 benchmark：材料候选点、rubric、答案映射、错误 taxonomy、人工分数；
4. 比较模型输出与人工 gold set，优先评估遗漏率/错误归类，再校准 score policy；
5. 只有达到门槛后才把 `calibrationStatus` 从 `uncalibrated` 提升为 `validated`；
6. 再进入 PDF/OCR、能力画像、自适应推荐等扩展能力。
