import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { BadgeCheck, CircleAlert, KeyRound, RotateCcw, Save, ShieldCheck, Sparkles, TestTube2 } from "lucide-react";
import BenchmarkLabSection from "./BenchmarkLabSection";
import {
  DEFAULT_GRADING_STYLE,
  GRADING_STYLE_MAX_LENGTH,
  GRADING_STYLE_PRESETS,
  gradingStylePreset,
  loadGradingStyleProfile,
  saveGradingStyleProfile,
  type GradingStyleProfile
} from "./grading/gradingStyleSettings";
import {
  loadRemoteProviderConfig,
  resetRemoteProviderConfig,
  saveRemoteProviderConfig
} from "./grading/providerSettings";
import { runProviderSmokeTest, type ProviderSmokeTestReport } from "./grading/providerSmokeTest";
import { saveProviderSmokeGate } from "./grading/providerGate";
import type { ReasoningEffort, RemoteProviderPublicConfig, RemoteProtocol } from "./grading/remote/config";
import { createRemoteModelTransport } from "./grading/remote/transport";
import { tauriProviderSecretStore, tauriSecureRemoteExecutor } from "./grading/remote/tauriExecutor";
import "./providerSettings.css";

const PROTOCOL_LABELS: Record<RemoteProtocol, string> = {
  "openai-responses": "Responses API（优先）",
  "openai-chat-completions": "Chat Completions（兼容）"
};

const REASONING_LABELS: Record<ReasoningEffort, string> = {
  "provider-default": "Provider 默认",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh"
};

type StatusTone = "neutral" | "success" | "error";

export default function ProviderSettingsPage({ onQuestionsChanged }: {
  onQuestionsChanged?: () => Promise<void> | void;
}) {
  const desktop = isTauri();
  const [config, setConfig] = useState<RemoteProviderPublicConfig | null>(null);
  const [gradingStyle, setGradingStyle] = useState<GradingStyleProfile>({ ...DEFAULT_GRADING_STYLE });
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [smokeReport, setSmokeReport] = useState<ProviderSmokeTestReport | null>(null);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: "neutral",
    text: "远程评分默认关闭。"
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadRemoteProviderConfig(), loadGradingStyleProfile()])
      .then(([providerConfig, style]) => { if (!cancelled) { setConfig(providerConfig); setGradingStyle(style); } })
      .catch(error => {
        console.error("Failed to load remote provider config.", error);
        if (!cancelled) setStatus({ tone: "error", text: "无法读取评分引擎配置。" });
      });
    return () => { cancelled = true; };
  }, []);

  const readyForRemote = useMemo(() => Boolean(
    config?.baseUrl.trim() && config?.model.trim() && config?.secretRef.trim()
  ), [config]);

  function patch<K extends keyof RemoteProviderPublicConfig>(key: K, value: RemoteProviderPublicConfig[K]) {
    setSmokeReport(null);
    setConfig(current => current ? { ...current, [key]: value } : current);
  }

  async function savePublicConfig() {
    if (!config || busy) return;
    setBusy("config");
    try {
      await saveRemoteProviderConfig(config);
      setStatus({ tone: "success", text: config.enabled ? "配置已保存，远程 AI 批改已启用。" : "配置已保存；完整批改链自检通过前可以继续保持关闭。" });
    } catch (error) {
      console.error("Failed to save provider config.", error);
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "配置保存失败。" });
    } finally {
      setBusy(null);
    }
  }

  async function saveGradingStyle() {
    if (busy) return;
    setBusy("style");
    try {
      const saved = await saveGradingStyleProfile(gradingStyle);
      setGradingStyle(saved);
      setStatus({ tone: "success", text: `批改 Skill“${saved.name}”已保存，将从下一次 AI 批改开始生效。` });
    } catch (error) {
      console.error("Failed to save grading style.", error);
      setStatus({ tone: "error", text: "批改 Skill 保存失败。" });
    } finally {
      setBusy(null);
    }
  }

  function selectGradingPreset(id: "default" | "yuan-dong" | "bailu") {
    setGradingStyle(gradingStylePreset(id));
  }

  function editGradingStyle(patch: Partial<Pick<GradingStyleProfile, "name" | "prompt">>) {
    setGradingStyle(current => ({
      ...current,
      ...patch,
      presetId: "custom",
      name: patch.name ?? (current.presetId === "default" ? "自定义风格" : current.name)
    }));
  }

  async function saveCredential() {
    if (!config || !desktop || !apiKey.trim() || busy) return;
    setBusy("credential");
    try {
      await tauriProviderSecretStore.save(config.secretRef, apiKey.trim());
      setApiKey("");
      setSmokeReport(null);
      setStatus({ tone: "success", text: "API 凭据已保存到系统凭据库。下一步运行“完整自检并启用”。" });
    } catch (error) {
      console.error("Failed to save provider credential.", error);
      setStatus({ tone: "error", text: "凭据保存失败，请检查系统凭据服务。" });
    } finally {
      setBusy(null);
    }
  }

  async function deleteCredential() {
    if (!config || !desktop || busy) return;
    setBusy("delete");
    try {
      await tauriProviderSecretStore.delete(config.secretRef);
      setApiKey("");
      setSmokeReport(null);
      setStatus({ tone: "success", text: "系统凭据已删除。" });
    } catch (error) {
      console.error("Failed to delete provider credential.", error);
      setStatus({ tone: "error", text: "无法删除凭据；它可能尚未保存或系统凭据服务不可用。" });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (!config || !desktop || !readyForRemote || busy) return;
    setBusy("test");
    try {
      const testConfig = { ...config, enabled: true };
      const transport = createRemoteModelTransport(testConfig, tauriSecureRemoteExecutor);
      const response = await transport.completeJson<{ ok: boolean }>({
        schemaName: "shenlun_provider_connection_test_v01",
        instructions: "这是连接测试。只返回符合 JSON schema 的对象，不要添加解释。",
        input: "请返回 ok=true。",
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        }
      });
      if (response.data?.ok !== true) throw new Error("Provider returned an unexpected test payload.");
      setStatus({ tone: "success", text: `连接成功${response.model ? ` · ${response.model}` : ""}。这只验证网络与结构化输出；还需要运行完整批改链自检。` });
    } catch (error) {
      console.error("Provider connection test failed.", error);
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "连接测试失败。" });
    } finally {
      setBusy(null);
    }
  }

  async function runFullSmokeAndEnable() {
    if (!config || !desktop || !readyForRemote || busy) return;
    setBusy("smoke");
    setSmokeReport(null);
    setStatus({ tone: "neutral", text: "正在运行真实负载批改链自检：材料盲抽 → rubric → 答案映射 → 字数审计。该过程会发送 4 个结构化 AI 请求。" });
    try {
      const report = await runProviderSmokeTest(config, gradingStyle.prompt);
      const enabledConfig: RemoteProviderPublicConfig = { ...config, enabled: true };
      await saveProviderSmokeGate(enabledConfig, report);
      await saveRemoteProviderConfig(enabledConfig);
      setConfig(enabledConfig);
      setSmokeReport(report);
      setStatus({
        tone: "success",
        text: `完整批改链通过 · ${report.model}。远程 AI 批改已启用；之后正式答题会走 Shenlun Grader Skill。`
      });
    } catch (error) {
      console.error("Full grading provider smoke test failed.", error);
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "完整批改链自检失败。远程 AI 批改未自动启用。" });
    } finally {
      setBusy(null);
    }
  }

  async function resetConfig() {
    if (busy) return;
    setBusy("reset");
    try {
      await resetRemoteProviderConfig();
      const fresh = await loadRemoteProviderConfig();
      setConfig(fresh);
      setApiKey("");
      setSmokeReport(null);
      setStatus({ tone: "success", text: "公开配置已恢复默认值。系统凭据不会被自动删除。" });
    } catch (error) {
      console.error("Failed to reset provider config.", error);
      setStatus({ tone: "error", text: "无法恢复默认配置。" });
    } finally {
      setBusy(null);
    }
  }

  if (!config) {
    return <main className="page page-wide provider-settings-page"><div className="settings-loading">正在读取评分引擎配置…</div></main>;
  }

  const responsesMode = config.protocol === "openai-responses";

  return <main className="page page-wide provider-settings-page">
    <header className="page-header compact">
      <div>
        <p className="eyebrow">设置 · AI 批改</p>
        <h1>接入模型后先跑完整自检，再用于正式训练</h1>
        <p>模型执行五阶段结构化任务；评分规则、结果校验和历史快照由应用控制。</p>
      </div>
      <div className="security-chip"><ShieldCheck size={18}/><span>{desktop ? "系统凭据库可用" : "浏览器开发模式"}</span></div>
    </header>

    <div className={`provider-status provider-status-${status.tone}`}><CircleAlert size={16}/><span>{status.text}</span></div>

    <section className="settings-section provider-quick-start">
      <div className="settings-section-heading">
        <div><h2>首次启用</h2><p>① 填写 Base URL 和模型；② 保存 API Key；③ 运行完整自检。自检通过后应用会自动启用远程 AI 批改。</p></div>
        <span className={`provider-ready-chip ${config.enabled ? "active" : ""}`}>{config.enabled ? "AI 批改已启用" : "AI 批改未启用"}</span>
      </div>
      <div className="provider-quick-fields">
        <label className="field"><span>API Base URL</span><input value={config.baseUrl} onChange={event => patch("baseUrl", event.target.value)} placeholder="https://provider.example.com/v1/"/></label>
        <label className="field"><span>模型</span><input value={config.model} onChange={event => patch("model", event.target.value)} placeholder="模型名"/></label>
      </div>
      <div className="provider-smoke-actions">
        <button className="secondary" disabled={!desktop || !readyForRemote || busy !== null} onClick={testConnection}><TestTube2 size={16}/>{busy === "test" ? "测试中…" : "快速测试连接"}</button>
        <button className="primary" disabled={!desktop || !readyForRemote || busy !== null} onClick={runFullSmokeAndEnable}><BadgeCheck size={16}/>{busy === "smoke" ? "真实负载自检中…" : "完整自检并启用 AI 批改"}</button>
      </div>
      <small className="provider-smoke-note">完整自检会使用一则中等长度、包含多个独立要点的内置申论题发送 4 个结构化请求，更接近真实小题的 Stage 1—4 负载；不写入训练记录，也不进入 Human Gold。通过仍只代表模型能够稳定执行当前批改 Skill，不代表诊断分已经完成真实阅卷校准。</small>
      {smokeReport && <div className="provider-smoke-report"><BadgeCheck size={16}/><div><strong>完整批改链已通过</strong><span>{smokeReport.model} · candidates {smokeReport.materialCandidateCount} · rubric {smokeReport.rubricCount} · mappings {smokeReport.mappingCount}</span><small>{smokeReport.skillVersion} · {smokeReport.scoreInterpretation}</small></div></div>}
    </section>

    <section className="settings-section grading-style-section">
      <div className="settings-section-heading">
        <div><h2>批改 Skill 与反馈风格</h2><p>选择一个预设作为起点，也可以直接修改名称和提示词。保存后会加入材料抽取、得分点构造、答案映射和表达审计。</p></div>
        <Sparkles size={22}/>
      </div>
      <div className="grading-style-presets">
        {GRADING_STYLE_PRESETS.map(preset => <button key={preset.presetId} className={gradingStyle.presetId === preset.presetId ? "active" : ""} onClick={() => selectGradingPreset(preset.presetId as "default" | "yuan-dong" | "bailu")}>
          <strong>{preset.name}</strong><span>{preset.presetId === "default" ? "保持系统原有严谨反馈" : preset.presetId === "yuan-dong" ? "直接、实战、强调失分位置" : "温和、清晰、强调可执行改法"}</span>
        </button>)}
      </div>
      <div className="grading-style-editor">
        <label className="field"><span>风格名称</span><input value={gradingStyle.name} maxLength={40} onChange={event => editGradingStyle({ name: event.target.value })} placeholder="例如：我的考场批改风格"/></label>
        <label className="field"><span>自定义批改提示词</span><textarea value={gradingStyle.prompt} maxLength={GRADING_STYLE_MAX_LENGTH} onChange={event => editGradingStyle({ prompt: event.target.value })} placeholder="写明希望重点检查什么、反馈语气如何、建议应怎样表达……"/><small>{gradingStyle.prompt.length} / {GRADING_STYLE_MAX_LENGTH} 字</small></label>
      </div>
      <div className="grading-style-guardrail"><ShieldCheck size={16}/><span>自定义提示词可以调整侧重点和表达风格，但不能取消材料事实边界、题型规则、结构化输出与评分校验。历史批改快照不会被改写。</span></div>
      <div className="settings-actions"><button className="primary" disabled={busy !== null || !gradingStyle.name.trim()} onClick={saveGradingStyle}><Save size={16}/>{busy === "style" ? "保存中…" : "保存批改 Skill"}</button><button className="secondary" disabled={busy !== null} onClick={() => selectGradingPreset("default")}><RotateCcw size={16}/>恢复内置风格</button></div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>API 凭据</h2><p>把 Key 保存到操作系统凭据库后，再运行上面的完整自检。明文不会保存到训练数据库。</p></div><KeyRound size={22}/></div>
      <div className="credential-row"><label className="field field-grow"><span>新 API Key</span><input type="password" autoComplete="new-password" value={apiKey} disabled={!desktop} onChange={event => setApiKey(event.target.value)} placeholder={desktop ? "粘贴后保存；保存成功会立即清空" : "仅桌面版可保存"}/></label><button className="primary" disabled={!desktop || !apiKey.trim() || busy !== null} onClick={saveCredential}>{busy === "credential" ? "写入中…" : "保存到系统凭据库"}</button><button className="secondary danger-soft" disabled={!desktop || busy !== null} onClick={deleteCredential}>删除凭据</button></div>
      <div className="secret-note">应用没有“读取并显示 API Key”的接口。训练数据库只保存公开配置和 <code>{config.secretRef}</code> 这一凭据引用。</div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>高级模型配置</h2><p>通常只需填写上面的 Base URL、模型和 API Key。这里用于 provider 兼容性或推理强度调整。</p></div><label className="switch-row"><input type="checkbox" checked={config.enabled} disabled={!desktop} onChange={event => patch("enabled", event.target.checked)}/><span>{config.enabled ? "已启用" : "未启用"}</span></label></div>
      {!desktop && <div className="settings-warning">浏览器 Vite 模式不能启用远程评分，因为 API 凭据不会暴露给页面 JavaScript。请在 Tauri 桌面版中配置。</div>}
      <div className="settings-warning strong">当前诊断分使用 <code>equal-rubric-diagnostic@0.1.0</code>，状态为 <strong>uncalibrated</strong>。它主要用于要点覆盖、漏点、分类和表达诊断，不能解释为官方阅卷等值分。</div>

      <div className="settings-grid">
        <label className="field"><span>协议</span><select value={config.protocol} onChange={event => patch("protocol", event.target.value as RemoteProtocol)}>{Object.entries(PROTOCOL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>推理强度</span><select value={config.reasoningEffort} disabled={!responsesMode} onChange={event => patch("reasoningEffort", event.target.value as ReasoningEffort)}>{Object.entries(REASONING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>{responsesMode ? "支持 reasoning.effort 的 Responses provider 可选择 High；兼容性不确定时保留 Provider 默认。" : "Chat Completions 兼容模式暂不发送 reasoning 参数。"}</small></label>
        <label className="field"><span>请求超时（毫秒）</span><input type="number" min="1000" max="300000" step="1000" value={config.timeoutMs} onChange={event => patch("timeoutMs", Number(event.target.value))}/><small>DeepSeek 实战请求内部至少保留 240 秒兼容窗口；其他 provider 按此配置执行。</small></label>
        <label className="field"><span>配置名称</span><input value={config.label} onChange={event => patch("label", event.target.value)} /></label>
      </div>
      <div className="settings-actions"><button className="primary" disabled={busy !== null} onClick={savePublicConfig}><Save size={16}/>{busy === "config" ? "保存中…" : "保存模型配置"}</button><button className="secondary" disabled={busy !== null} onClick={resetConfig}><RotateCcw size={16}/>恢复默认配置</button></div>
    </section>

    <BenchmarkLabSection onQuestionsChanged={onQuestionsChanged} />
  </main>;
}
