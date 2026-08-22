import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { CircleAlert, KeyRound, RotateCcw, Save, ShieldCheck, TestTube2 } from "lucide-react";
import {
  loadRemoteProviderConfig,
  resetRemoteProviderConfig,
  saveRemoteProviderConfig
} from "./grading/providerSettings";
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

export default function ProviderSettingsPage() {
  const desktop = isTauri();
  const [config, setConfig] = useState<RemoteProviderPublicConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: "neutral",
    text: "远程评分默认关闭。"
  });

  useEffect(() => {
    let cancelled = false;
    loadRemoteProviderConfig()
      .then(value => { if (!cancelled) setConfig(value); })
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
    setConfig(current => current ? { ...current, [key]: value } : current);
  }

  async function savePublicConfig() {
    if (!config || busy) return;
    setBusy("config");
    try {
      await saveRemoteProviderConfig(config);
      setStatus({ tone: "success", text: config.enabled ? "公开配置已保存，远程评分已启用。" : "公开配置已保存，当前仍使用本地模拟评分。" });
    } catch (error) {
      console.error("Failed to save provider config.", error);
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "配置保存失败。" });
    } finally {
      setBusy(null);
    }
  }

  async function saveCredential() {
    if (!config || !desktop || !apiKey.trim() || busy) return;
    setBusy("credential");
    try {
      await tauriProviderSecretStore.save(config.secretRef, apiKey.trim());
      setApiKey("");
      setStatus({ tone: "success", text: "API 凭据已保存到系统凭据库；应用不会回读或回显明文。" });
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
      setStatus({ tone: "success", text: `连接成功${response.model ? ` · ${response.model}` : ""}。这只验证网络与结构化输出，不代表评分质量已验证。` });
    } catch (error) {
      console.error("Provider connection test failed.", error);
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "连接测试失败。" });
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
        <p className="eyebrow">设置 · 评分引擎</p>
        <h1>把模型接入和评分方法分开管理</h1>
        <p>模型只负责执行五阶段结构化任务；评分规则、结果校验和历史快照由应用控制。</p>
      </div>
      <div className="security-chip"><ShieldCheck size={18}/><span>{desktop ? "系统凭据库可用" : "浏览器开发模式"}</span></div>
    </header>

    <div className={`provider-status provider-status-${status.tone}`}><CircleAlert size={16}/><span>{status.text}</span></div>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>远程 AI 批改</h2><p>显式启用后，提交答案会走五阶段 remote workflow；关闭时继续使用 V0.1 mock。</p></div><label className="switch-row"><input type="checkbox" checked={config.enabled} disabled={!desktop} onChange={event => patch("enabled", event.target.checked)}/><span>{config.enabled ? "已启用" : "未启用"}</span></label></div>
      {!desktop && <div className="settings-warning">浏览器 Vite 模式不能启用远程评分，因为 API 凭据不会暴露给页面 JavaScript。请在 Tauri 桌面版中配置。</div>}
      <div className="settings-warning strong">当前远程 workflow 的诊断分使用 <code>equal-rubric-diagnostic@0.1.0</code>，状态为 <strong>uncalibrated</strong>。它可以验证方法与流程，但不能解释为正式申论阅卷分。</div>

      <div className="settings-grid">
        <label className="field"><span>协议</span><select value={config.protocol} onChange={event => patch("protocol", event.target.value as RemoteProtocol)}>{Object.entries(PROTOCOL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>模型</span><input value={config.model} onChange={event => patch("model", event.target.value)} placeholder="例如：支持结构化 JSON 的模型名"/></label>
        <label className="field"><span>推理强度</span><select value={config.reasoningEffort} disabled={!responsesMode} onChange={event => patch("reasoningEffort", event.target.value as ReasoningEffort)}>{Object.entries(REASONING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>{responsesMode ? "通过 Responses API 的 reasoning.effort 发送；Provider 默认表示完全不传该参数。" : "Chat Completions 兼容模式暂不发送 reasoning 参数，避免兼容服务因未知字段失败。"}</small></label>
        <label className="field"><span>请求超时（毫秒）</span><input type="number" min="1000" max="300000" step="1000" value={config.timeoutMs} onChange={event => patch("timeoutMs", Number(event.target.value))}/></label>
        <label className="field field-wide"><span>API Base URL</span><input value={config.baseUrl} onChange={event => patch("baseUrl", event.target.value)} placeholder="https://provider.example.com/v1/"/><small>必须使用 HTTPS；仅 localhost 开发允许 HTTP。不要在 URL 中嵌入用户名、密码或 token。</small></label>
        <label className="field"><span>配置名称</span><input value={config.label} onChange={event => patch("label", event.target.value)} /></label>
      </div>
      <div className="settings-actions"><button className="primary" disabled={busy !== null} onClick={savePublicConfig}><Save size={16}/>{busy === "config" ? "保存中…" : "保存公开配置"}</button><button className="secondary" disabled={busy !== null} onClick={resetConfig}><RotateCcw size={16}/>恢复默认配置</button></div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>API 凭据</h2><p>明文只在你输入并点击保存时短暂存在于页面状态，随后由 Rust 写入操作系统凭据库。</p></div><KeyRound size={22}/></div>
      <div className="credential-row"><label className="field field-grow"><span>新 API Key</span><input type="password" autoComplete="new-password" value={apiKey} disabled={!desktop} onChange={event => setApiKey(event.target.value)} placeholder={desktop ? "粘贴后保存；保存成功会立即清空" : "仅桌面版可保存"}/></label><button className="primary" disabled={!desktop || !apiKey.trim() || busy !== null} onClick={saveCredential}>{busy === "credential" ? "写入中…" : "保存到系统凭据库"}</button><button className="secondary danger-soft" disabled={!desktop || busy !== null} onClick={deleteCredential}>删除凭据</button></div>
      <div className="secret-note">应用没有“读取并显示 API Key”的接口。训练数据库只保存公开配置和 <code>{config.secretRef}</code> 这一凭据引用。</div>
    </section>

    <section className="settings-section settings-test-section">
      <div><h2>连通性检查</h2><p>发送一个极小的结构化 JSON 请求，只验证凭据、URL、模型和 JSON 输出链路。</p></div>
      <button className="secondary" disabled={!desktop || !readyForRemote || busy !== null} onClick={testConnection}><TestTube2 size={16}/>{busy === "test" ? "测试中…" : "测试连接"}</button>
    </section>
  </main>;
}