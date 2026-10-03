"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Plug, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ConnectionStatus } from "@/lib/client-api";

export function ConnectionSettings() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [notionToken, setNotionToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const refresh = async () => {
    const data = await api<ConnectionStatus>("/api/connections", undefined, "GET");
    setStatus(data); setPageId(data.pageId); setModel(data.model);
  };
  useEffect(() => {
    let active = true;
    api<ConnectionStatus>("/api/connections", undefined, "GET").then(data => {
      if (active) { setStatus(data); setPageId(data.pageId); setModel(data.model); }
    }).catch(() => { if (active) setMessage("无法加载连接状态，请重试。"); });
    return () => { active = false; };
  }, []);
  const run = async (action: "save" | "test-notion" | "test-ai" | "read" | "clear") => {
    setBusy(action); setMessage("");
    try {
      if (action === "read") {
        const data = await api<{ text: string; lineCount: number; truncated: boolean }>("/api/course-notes", undefined, "GET");
        setNotes(data.text); setMessage(`已读取 ${data.lineCount} 段笔记${data.truncated ? "，内容较多，当前仅展示部分" : ""}。`);
      } else if (action === "clear") {
        const data = await api<{ message: string }>("/api/connections", undefined, "DELETE");
        setNotionToken(""); setAiKey(""); setNotes(""); await refresh(); window.dispatchEvent(new Event("studio-connections")); setMessage(data.message);
      } else {
        const data = await api<{ message: string }>("/api/connections", { action, notionToken, pageId, aiKey, model });
        if (action === "save") { setNotionToken(""); setAiKey(""); setNotes(""); await refresh(); window.dispatchEvent(new Event("studio-connections")); }
        setMessage(data.message);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "连接失败"); }
    finally { setBusy(""); }
  };
  return <div className="settings-view">
    <section className="coach-banner"><div><span><Plug size={15}/> CONNECTIONS</span><h2>让课程笔记成为每天的练习</h2><p>连接 Notion，读取课程中的词汇、语法和搭配；接入 AI，生成练习并纠正你的英语。</p></div></section>
    <div className="settings-grid">
      <section className="paper-card settings-card"><h2><Plug size={20}/> Notion 连接</h2><p className="connection-status">{status?.notionConfigured ? <><Check size={15}/> 已配置</> : "尚未配置"}</p>
        <label htmlFor="notion-token">Integration Token</label><Input id="notion-token" type="password" autoComplete="off" value={notionToken} onChange={event => setNotionToken(event.target.value)} placeholder={status?.notionConfigured ? "已保存；留空保留原 Token" : "ntn_… 或 secret_…"}/>
        <label htmlFor="notion-page">课程笔记页面链接 / Page ID</label><Input id="notion-page" value={pageId} onChange={event => setPageId(event.target.value)} placeholder="https://www.notion.so/…"/>
        <p className="field-help">在 Notion 页面菜单 → Connections 中添加你的 integration，并允许读取和插入内容。课程记录和每日练习会保存为此页面下的子页面。</p>
        <div className="action-row"><Button variant="outline" disabled={Boolean(busy)} onClick={() => run("test-notion")}>测试 Notion</Button><Button variant="outline" disabled={Boolean(busy) || !status?.notionConfigured} onClick={() => run("read")}>读取已保存连接的笔记</Button></div>
      </section>
      <section className="paper-card settings-card"><h2><KeyRound size={20}/> AI 连接</h2><p className="connection-status">{status?.aiConfigured ? <><Check size={15}/> 已配置</> : "尚未配置"}</p>
        <label htmlFor="ai-key">OpenAI API Key</label><Input id="ai-key" type="password" autoComplete="off" value={aiKey} onChange={event => setAiKey(event.target.value)} placeholder={status?.aiConfigured ? "已保存；留空保留原 Key" : "sk-…"}/>
        <label htmlFor="ai-model">模型名称</label><Input id="ai-model" value={model} onChange={event => setModel(event.target.value)} placeholder="gpt-4.1-mini"/>
        <p className="field-help">用于生成跟读短文、翻译题和对话纠错。AI 会收到课程笔记和练习内容；测试 AI 也会产生一次小额 API 请求。</p>
        <div className="action-row"><Button variant="outline" disabled={Boolean(busy)} onClick={() => run("test-ai")}>测试 AI</Button></div>
      </section>
    </div>
    <section className="paper-card settings-footer"><p>密钥加密保存于此浏览器的安全 Cookie，有效期 30 天。留空保留已保存密钥。本地开发重启后可能需要重新连接。</p><div className="action-row"><Button variant="outline" disabled={Boolean(busy)} onClick={() => run("clear")}>清除浏览器连接</Button><Button disabled={Boolean(busy) || !model.trim()} onClick={() => run("save")}>{busy ? <Loader2 className="spin" size={16}/> : <Save size={16}/>}保存连接</Button></div><p className="save-message" role="status">{busy ? "正在处理…" : message}</p></section>
    {notes && <section className="paper-card notes-preview"><h2>Notion 笔记预览</h2><pre>{notes}</pre></section>}
  </div>;
}
