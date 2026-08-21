# Provider 与凭据安全边界

## 1. 基本原则

远程评分 provider 分成两类数据：

### 可普通持久化的公开配置

- provider id / label；
- protocol；
- base URL；
- model；
- timeout；
- `secretRef`。

这些信息未来可以存入 SQLite。

### 不允许普通持久化的秘密

- API key；
- bearer token；
- 其他长期访问凭据。

秘密不得写入：

- Git 仓库；
- `.env` 示例中的真实值；
- 普通 SQLite 表；
- training record；
- StructuredReview；
- console 日志；
- 网络错误信息的可见详情。

## 2. 当前代码边界

`src/grading/remote/config.ts` 只定义：

- `RemoteProviderPublicConfig`；
- `SecretResolver`；
- `RemoteModelTransport`。

UI 未来只能保存 public config，并通过 `secretRef` 引用秘密。

在凭据后端完成之前：

- remote provider 默认关闭；
- 不提供“把 API key 填进普通表单后存 SQLite”的临时方案；
- 不从 React 页面直接拼 Authorization header。

## 3. Tauri 桌面端候选方案

优先评估 Tauri 官方 Stronghold plugin：

- 使用独立 vault 保存 secrets/keys；
- 桌面端支持 Windows/macOS/Linux；
- 需要明确 vault password 的来源与派生策略；
- 需要单独配置 capability permissions。

官方文档：

`https://v2.tauri.app/plugin/stronghold/`

在决定密码派生与恢复策略前，不把 Stronghold 依赖直接加入正式运行时。

## 4. Transport 规则

远程 transport 必须：

1. 在真正发请求时才解析 `secretRef`；
2. 请求结束后不把 key 写入任何业务对象；
3. 只允许 HTTPS，localhost 开发可例外使用 HTTP；
4. 设置超时；
5. 不自动无限重试；
6. HTTP 错误对 UI 返回归一化错误，不回显 Authorization、完整响应头或潜在敏感 payload；
7. provider 的原始返回必须先解析、校验，再进入 `StructuredReview`；
8. 校验失败时 fail closed，不生成训练历史。

## 5. 模型调用与评分规则分离

Transport 只负责“向模型请求结构化 JSON”。

它不得自行决定：

- 评分点是什么；
- 题型分类规则；
- 如何合并材料；
- 机构答案优先级；
- 分数计算纪律。

这些由 `rules/` 和 grading workflow 决定。

## 6. 上线前安全门槛

真实 remote provider 启用前至少完成：

- secret backend；
- capability 最小权限；
- 错误信息脱敏；
- provider 配置校验；
- network timeout/cancel；
- review schema validation；
- 人工测试确认 key 不出现在 SQLite、日志和历史记录；
- 明确删除/更换凭据的流程。
