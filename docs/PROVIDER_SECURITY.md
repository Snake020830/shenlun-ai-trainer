# Provider 与凭据安全边界

## 1. 基本原则

远程评分 provider 分成两类数据。

### 可普通持久化的公开配置

- provider id / label；
- protocol；
- base URL；
- model；
- timeout；
- reasoning effort；
- `secretRef`；
- 是否启用 remote workflow。

公开配置经 allow-list 清洗后，可以保存到 SQLite `app_meta`；浏览器开发模式使用 localStorage fallback。

### 不允许普通持久化的秘密

- API key；
- bearer token；
- 其他长期访问凭据。

秘密不得写入：

- Git 仓库；
- 普通 SQLite 表；
- localStorage；
- training record；
- StructuredReview；
- console 日志；
- 网络错误信息的可见详情。

老师/机构参考答案不是凭据秘密，可以作为题目数据保存在本地 SQLite；但它必须在正常作答阶段隐藏，并与 Stage 1–4 的模型输入隔离。

## 2. 当前实现

### 前端公开配置

`src/grading/remote/config.ts` 定义：

- `RemoteProviderPublicConfig`；
- `RemoteJsonRequest / RemoteJsonResponse`；
- `RemoteModelTransport`；
- `ReasoningEffort`。

`src/grading/providerSettings.ts` 对持久化对象执行字段白名单。任何临时 `apiKey`、token 或其他额外字段都不会随整个对象进入 SQLite。

### 系统凭据库

桌面端使用 Rust `keyring` crate 的 `v1` 接口：

- Windows：Windows Credential Manager；
- macOS：Keychain Services；
- Linux：Secret Service。

应用服务名固定为 `shenlun-ai-trainer`，用户名位置使用经过限制的 `secretRef`。

前端只有：

- `store_provider_secret`；
- `delete_provider_secret`。

没有“读取 API key 并返回给 JavaScript”的命令。评分请求只传递 `secretRef`，Rust 在真正发请求时从系统凭据库解析明文。

## 3. Rust secure executor

`src-tauri/src/secure_remote.rs` 负责持有凭据并发出网络请求。

安全约束：

1. `secretRef` 仅允许 ASCII 字母、数字、`.`、`-`、`_`，最大 96 字符；
2. secret 长度有上限；
3. URL 禁止嵌入 username/password；
4. 只允许 HTTPS；localhost/127.0.0.1/::1 开发可使用 HTTP；
5. HTTP redirect 被禁用，避免 bearer token 被自动带到另一个目标；
6. 请求超时限制在 1 秒到 300 秒；
7. 响应大小限制为 2 MiB；
8. 非 2xx 错误只返回归一化 HTTP 状态，不把 provider 原始错误 body 回显给 UI；
9. provider 响应必须是 JSON；
10. Rust 不把 API key 放入业务返回对象。

## 4. TypeScript transport

`src/grading/remote/transport.ts` 的 `SecureRemoteExecutor` 只接收：

- URL；
- JSON body；
- `secretRef`；
- timeout。

它不接受明文 key。

`src/grading/remote/tauriExecutor.ts` 是 Tauri bridge：

- 凭据写入/删除走 OS keyring；
- 请求走 Rust `secure_post_json`；
- 浏览器 Vite 模式不能执行这些操作。

## 5. API protocol 与 reasoning 控制

当前支持两个 OpenAI-compatible protocol adapter：

- Responses API；
- Chat Completions。

默认选择 Responses API。请求显式设置 `store: false`，并使用 JSON Schema/JSON Object 形式要求结构化输出。

五阶段评分任务不强制发送 `temperature`。

公开配置中的 `reasoningEffort` 支持：

- `provider-default`；
- `low`；
- `medium`；
- `high`；
- `xhigh`。

安全/兼容策略：

- `provider-default` 表示完全不发送 reasoning effort；
- Responses 模式可发送 `reasoning: { effort }`；
- Chat Completions 兼容模式暂不发送 reasoning 参数，因为 OpenAI-compatible provider 对该字段支持并不统一；
- 设置页在 Chat 模式禁用 reasoning 控件，避免出现“界面配置已生效、请求实际未发送”的假状态。

## 6. 参考答案隔离边界

老师/机构参考答案属于可选题目数据，不属于评分先验真值。

强制规则：

1. 导题时可录入并持久化；
2. 正常作答界面不得展示；
3. `questionPayload()` 不包含 reference answer；
4. Stage 1 材料盲抽不得访问 reference answer；
5. Stage 2 rubric 构造不得访问 reference answer；
6. Stage 3 答案映射不得访问 reference answer；
7. Stage 4 字数/表达审计不得访问 reference answer；
8. Stage 5 才能显式接收 reference answer；
9. Stage 5 只产生差异审计信息，不回写盲抽 rubric，不自动改变本次 score；
10. reference cross-check 结果可以进入 StructuredReview snapshot，以便当前批改和历史复盘审计。

已有自动化回归测试使用唯一标记验证：Stage 1–4 请求体中不出现参考答案内容，Stage 5 才明确出现。

## 7. 模型调用与评分规则分离

Transport 只负责“向模型请求结构化 JSON”。

它不得自行决定：

- 评分点是什么；
- 题型分类规则；
- 如何合并材料；
- 机构答案优先级；
- 分数计算纪律。

这些由 `rules/`、五阶段 grading workflow、runtime validators 和 score policy 决定。

## 8. Fail-closed 规则

以下任一情况发生时，本次 remote grading 必须停止，不生成训练记录：

- provider 未启用；
- 桌面 secure executor 不可用；
- 凭据缺失；
- URL/公开配置不合法；
- HTTP 请求失败；
- provider 返回无效 JSON；
- material/rubric/mapping 引用关系不合法；
- error taxonomy 出现未知代码；
- 模型篡改字数上限或 charCount 与真实答案不一致；
- StructuredReview 分数越界、满分不匹配或结构非法；
- reference cross-check 输出结构非法。

## 9. 当前验证与剩余门槛

已实现并有 CI/单测覆盖：

- secret backend；
- Rust 网络层；
- URL/timeout/redirect/response-size 安全限制；
- provider 公共配置 allow-list；
- reasoning effort 协议编码；
- review/artifact schema validation；
- API key 不进入业务数据库的架构边界；
- 参考答案 Stage 1–4 隔离与 Stage 5 注入；
- Stage 5 差异不自动改分；
- Windows Tauri/Rust `cargo check` 已验证 keyring + reqwest 工程可编译。

在把 remote AI 称为“正式评分”之前仍需：

- 在真实桌面运行中人工验证系统凭据写入/删除与连接测试；
- 对实际 provider 做错误信息脱敏检查；
- 建立人工批改标注集；
- 校准 score policy；
- 评估材料抽取遗漏率、rubric 质量、答案映射准确率、错误分类准确率和最终评分一致性；
- 将 `calibrationStatus` 从 `uncalibrated` 提升到 `validated` 后，才允许把分数解释为正式 AI 评分。
