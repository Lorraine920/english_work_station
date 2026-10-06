"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Plug, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ConnectionStatus } from "@/lib/client-api";

const DRAFT_KEY = "studio-connection-draft";
type Draft = { notionToken: string; pageId: string; aiKey: string; model: string };
function readDraft(): Partial<Draft> {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
    return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
      ["notionToken", "pageId", "aiKey", "model"].includes(key) && typeof item === "string"
    ));
  } catch { return {}; }
}

export function ConnectionSettings() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [notionToken, setNotionToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsMessage, setModelsMessage] = useState("");
  const [modelsRetry, setModelsRetry] = useState(0);
  const edit = (field: keyof Draft, value: string) => {
    const draft = { notionToken, pageId, aiKey, model, [field]: value };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* Storage may be disabled. */ }
    ({ notionToken: setNotionToken, pageId: setPageId, aiKey: setAiKey, model: setModel })[field](value);
    if (field === "aiKey") { setModels([]); setModelsMessage(""); }
  };
  const refresh = async () => {
    const data = await api<ConnectionStatus>("/api/connections", undefined, "GET");
    setStatus(data); setPageId(data.pageId); setModel(data.model);
  };
  useEffect(() => {
    let active = true;
    api<ConnectionStatus>("/api/connections", undefined, "GET").then(data => {
      if (active) {
        const draft = readDraft();
        setStatus(data); setNotionToken(draft.notionToken ?? ""); setAiKey(draft.aiKey ?? "");
        setPageId(draft.pageId ?? data.pageId); setModel(draft.model ?? data.model); setReady(true);
      }
    }).catch(() => {
      if (active) {
        const draft = readDraft();
        setNotionToken(draft.notionToken ?? ""); setAiKey(draft.aiKey ?? "");
        setPageId(draft.pageId ?? ""); setModel(draft.model ?? "gpt-4.1-mini");
        setReady(true); setMessage("无法加载连接状态，请重试。");
      }
    });
    return () => { active = false; };
  }, []);
  const aiConfigured = Boolean(status?.aiConfigured);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setModels([]); setModelsMessage("");
      if (!ready || (!aiKey.trim() && !aiConfigured)) { setModelsLoading(false); return; }
      setModelsLoading(true);
      try {
        const data = await api<{ models: string[] }>("/api/connections", { action: "models", aiKey });
        if (active) {
          setModels(data.models);
          if (!data.models.length) setModelsMessage("未找到适用于文字练习的模型，可手动填写模型名称。");
        }
      } catch (error) {
        if (active) setModelsMessage(error instanceof Error ? error.message : "无法加载模型列表。");
      } finally { if (active) setModelsLoading(false); }
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [aiKey, aiConfigured, ready, modelsRetry]);
  const run = async (action: "save" | "test-notion" | "test-ai" | "read" | "clear") => {
    setBusy(action); setMessage("");
    try {
      if (action === "read") {
        const data = await api<{ text: string; lineCount: number; truncated: boolean }>("/api/course-notes", undefined, "GET");
        setNotes(data.text); setMessage(`已读取 ${data.lineCount} 段笔记${data.truncated ? "，内容较多，当前仅展示部分" : ""}。`);
      } else if (action === "clear") {
        const data = await api<{ message: string }>("/api/connections", undefined, "DELETE");
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be disabled. */ }
        setNotionToken(""); setAiKey(""); setNotes(""); setModels([]); setModelsMessage(""); await refresh(); window.dispatchEvent(new Event("studio-connections")); setMessage(data.message);
      } else {
        const payload = action === "test-notion" ? { action, notionToken, pageId }
          : action === "test-ai" ? { action, aiKey, model }
          : { action, notionToken, pageId, aiKey, model };
        const data = await api<ConnectionStatus & { message: string }>("/api/connections", payload);
        setStatus(data); setNotes(""); window.dispatchEvent(new Event("studio-connections"));
        setMessage(data.message);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "连接失败"); }
    finally { setBusy(""); }
  };
  return <div className="settings-view">
    <section className="coach-banner"><div><span><Plug size={15}/> CONNECTIONS</span><h2>让课程笔记成为每天的练习</h2><p>连接 Notion，读取课程中的词汇、语法和搭配；接入 AI，生成练习并纠正你的英语。</p></div></section>
    <div className="settings-grid">
      <section className="paper-card settings-card"><h2><Plug size={20}/> Notion 连接</h2><p className="connection-status">{status?.notionConfigured ? <><Check size={15}/> 已配置</> : "尚未配置"}</p>
        <label htmlFor="notion-token">Integration Token</label><Input id="notion-token" type="password" autoComplete="off" disabled={!ready || Boolean(busy)} value={notionToken} onChange={event => edit("notionToken", event.target.value)} placeholder={status?.notionConfigured ? "已保存；留空保留原 Token" : "ntn_… 或 secret_…"}/>
        <label htmlFor="notion-page">课程笔记页面链接 / Page ID</label><Input id="notion-page" disabled={!ready || Boolean(busy)} value={pageId} onChange={event => edit("pageId", event.target.value)} placeholder="https://www.notion.so/…"/>
        <p className="field-help">在 Notion 页面菜单 → Connections 中添加你的 integration，并允许读取和插入内容。课程记录和每日练习会保存为此页面下的子页面。</p>
        <div className="action-row"><Button variant="outline" disabled={!ready || Boolean(busy)} onClick={() => run("test-notion")}>测试 Notion</Button><Button variant="outline" disabled={Boolean(busy) || !status?.notionConfigured} onClick={() => run("read")}>读取已保存连接的笔记</Button></div>
      </section>
      <section className="paper-card settings-card"><h2><KeyRound size={20}/> AI 连接</h2><p className="connection-status">{status?.aiConfigured ? <><Check size={15}/> 已配置</> : "尚未配置"}</p>
        <label htmlFor="ai-key">OpenAI API Key</label><Input id="ai-key" type="password" autoComplete="off" disabled={!ready || Boolean(busy)} value={aiKey} onChange={event => edit("aiKey", event.target.value)} placeholder={status?.aiConfigured ? "已保存；留空保留原 Key" : "sk-…"}/>
        <label htmlFor="ai-model-select">选择模型</label>
        <select id="ai-model-select" className="model-select" value={models.includes(model) ? model : ""} disabled={Boolean(busy) || modelsLoading || !models.length} onChange={event => edit("model", event.target.value)}>
          <option value="" disabled>{modelsLoading ? "正在加载模型…" : models.length ? "请选择模型" : "输入 Key 后加载模型"}</option>
          {models.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        {modelsMessage && <p className="field-help" role="status">{modelsMessage}</p>}
        <div className="action-row"><Button variant="outline" disabled={!ready || Boolean(busy) || modelsLoading || (!aiKey.trim() && !aiConfigured)} onClick={() => setModelsRetry(value => value + 1)}>刷新模型列表</Button></div>
        <label htmlFor="ai-model">当前模型 / 手动填写</label><Input id="ai-model" disabled={!ready || Boolean(busy)} value={model} onChange={event => edit("model", event.target.value)} placeholder="gpt-4.1-mini"/>
        <p className="field-help">模型列表按此 Key 加载，筛选文字模型；选定后可测试确认调用权限。用于生成跟读短文、翻译题和对话纠错。AI 会收到课程笔记和练习内容；测试 AI 也会产生一次小额 API 请求。</p>
        <div className="action-row"><Button variant="outline" disabled={!ready || Boolean(busy) || !model.trim()} onClick={() => run("test-ai")}>测试 AI</Button></div>
      </section>
    </div>
    <section className="paper-card settings-footer"><p>最近输入会在当前标签页保留，切换界面或刷新不会丢失。点击保存连接或测试成功后，密钥加密保存 30 天；留空保留已保存密钥。关闭标签页后仍可使用已保存连接。本地开发重启后可能需要重新连接。</p><div className="action-row"><Button variant="outline" disabled={!ready || Boolean(busy) || modelsLoading} onClick={() => run("clear")}>清除浏览器连接</Button><Button disabled={!ready || Boolean(busy) || !model.trim()} onClick={() => run("save")}>{busy ? <Loader2 className="spin" size={16}/> : <Save size={16}/>}保存连接</Button></div><p className="save-message" role="status">{busy ? "正在处理…" : message}</p></section>
    {notes && <section className="paper-card notes-preview"><h2>Notion 笔记预览</h2><pre>{notes}</pre></section>}
  </div>;
}
