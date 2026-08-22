# V0.1 日常可用版 Feature Freeze 门槛

V0.1 的目标不是“功能最多”，而是：能够稳定完成 **选真题 → 读材料 → 作答 → AI 诊断批改 → 历史复盘**。

达到下列门槛后停止新增主功能，进入真实备考使用。

## A. 近10年真题库

- [ ] 桌面版扫描主公开来源成功。
- [ ] 正式范围为滚动最近10年；2026 年对应 2017—2026。
- [ ] “批量校验近10年”能串行完成，不因单套卷失败中断全部任务。
- [ ] 同一整卷的普通版 / 回忆版 / 站友版只校验推荐版本，不重复批量导入。
- [ ] parser warning 的卷保持阻断，不混入正式题库。
- [ ] “导入已校验整卷”执行前有一次明确用户确认。
- [ ] 导入时重新抓取和解析；网页变化导致结构不再通过时自动跳过。
- [ ] 一卷拆成多道训练题，每道题保留整卷完整材料。
- [ ] 已入库题可查看来源 URL 和回忆版标识。
- [ ] 五类题型均有足量真实题：概括归纳 / 综合分析 / 提出对策 / 贯彻执行 / 文章写作。

## B. Shenlun Grader Skill

- [ ] 日常 `提交批改` 已经走 `ShenlunGraderSkill`，不是直接绕过 Skill 调 provider。
- [ ] Skill preflight 能阻断空题干、空材料、空答案、非法分值和非法字数。
- [ ] Remote provider 必须返回完整五阶段 artifacts。
- [ ] Stage 1 candidate 为空时 fail closed。
- [ ] Stage 2 rubric 为空时 fail closed。
- [ ] Stage 3 mapping 数量与 rubric 不一致时 fail closed。
- [ ] Stage 4 模型字符数与本地字符数不一致时 fail closed。
- [ ] Stage 4 wordLimit 与题目元数据不一致时 fail closed。
- [ ] Skill 版本、score interpretation 和 warnings 随 review snapshot 持久化。
- [ ] 未校准 remote score 明确标记为 `ai-diagnostic-uncalibrated`。
- [ ] 公开网页答案不能自动进入 Human Gold。

## C. Remote AI 实机

- [ ] 在真实 Windows / Tauri 中保存 API key 成功。
- [ ] API key 不可被 UI 读取回显。
- [ ] Responses-compatible 模型完成 Stage 1→5 全链调用。
- [ ] 如果模型支持 reasoning effort，优先以 `high` 做正式批改验收；不支持 reasoning 参数的兼容服务使用 `provider-default`。
- [ ] 单阶段失败时整次批改失败，不伪造成功结果。
- [ ] 至少各跑 1 道：概括、分析、对策、贯彻执行、作文。

## D. 真实答案回归池

- [ ] 从用户实际训练记录自动选取 10—20 条真实答案。
- [ ] 优先公开真题，排除 builtin demo。
- [ ] 同一道题只选最新有效作答。
- [ ] 题型尽量轮转均衡。
- [ ] 至少覆盖 4 种题型且总数 ≥ 10，才标记 `readyForSmokeReplay=true`。
- [ ] 模型生成的答案不得冒充真实回归样本或 Human Gold。

## E. 作答体验

- [ ] 材料正文清晰，字号控制真实生效。
- [ ] 多材料导航适合完整长材料。
- [ ] 高亮 / 下划线 / 单项删除稳定。
- [ ] 字符锚点自由画笔经 resize、17→22px、切材料、重开专项验收。
- [ ] 稿纸输入后网格仍可见，长答案滚动不明显漂移。
- [ ] 草稿、计时、标注、笔迹退出重开后仍存在。

## F. 最终门禁

- [ ] Frontend CI：tests + TypeScript/Vite build 通过。
- [ ] Desktop CI：frontend build + `cargo check` + Windows Preview installer 通过。
- [ ] 用 Preview 安装包完成一次真实 Windows 全流程验收。
- [ ] PR 保持 Draft，直到以上门槛完成。

## Feature Freeze 后

冻结后不再为了“看起来完整”增加：PDF/OCR、云同步、能力雷达图、自动学习计划、多设备、更多笔刷、社区、排名等。

后续开发只来源于真实训练中的明确痛点：

`实际做题 → 发现问题 → 修复 → 回归测试 → 继续使用`。
