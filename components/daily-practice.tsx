"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpenText, Check, CircleStop, Loader2, MessageCircle, Mic, Save, Send, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type ConnectionStatus } from "@/lib/client-api";
import { type Grade, type Plan, type PracticeRecord, PracticeRecordSchema, type Turn, shanghaiDate } from "@/lib/practice";
import { speechRecognition, type Recognition } from "@/lib/speech";

type Draft = { record: PracticeRecord; input?: string; savedContent?: string; url?: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试。";
export function DailyPractice() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [storageKey, setStorageKey] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [listening, setListening] = useState(false);
  const [rate, setRate] = useState(0.85);
  const [source, setSource] = useState("");
  const [today, setToday] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const chatInput = draft?.input || "";
  const setChatInput = (value: string | ((current: string) => string)) => setDraft(current => current ? { ...current, input: typeof value === "function" ? value(current.input || "") : value } : null);
  useEffect(() => {
    const initial = window.setTimeout(() => setToday(shanghaiDate()), 0);
    const timer = window.setInterval(() => setToday(shanghaiDate()), 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!today) return;
    let active = true;
    api<ConnectionStatus>("/api/connections", undefined, "GET").then(data => {
      if (!active) return;
      setStatus(data);
      const key = `studio-practice:${data.pageId}:${today}`;
      setStorageKey(key);
      setDraft(null);
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "null") as Draft | null;
        setDraft(stored && PracticeRecordSchema.safeParse(stored.record).success ? stored : null);
      } catch { setMessage("无法恢复练习记录，仍可生成新练习。"); }
    }).catch(error => { if (active) setMessage(errorText(error)); });
    return () => { active = false; recognition.current?.abort(); window.speechSynthesis?.cancel(); };
  }, [today]);
  useEffect(() => {
    if (!draft || !storageKey) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify(draft)); }
      catch { setMessage("浏览器存储已满或不可用，请及时同步到 Notion。"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draft, storageKey]);
  const update = (transform: (record: PracticeRecord) => PracticeRecord) => setDraft(current => current ? { ...current, record: transform(current.record) } : null);
  const generate = async () => {
    setBusy("generate"); setMessage("");
    try {
      const previousTitles: string[] = [];
      try { for (let index = 0; index < localStorage.length; index++) { const key = localStorage.key(index); if (key?.startsWith(`studio-practice:${status?.pageId}:`)) { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved?.record?.plan?.title) previousTitles.push(saved.record.plan.title); } } } catch { /* Generation works without browser storage. */ }
      const data = await api<{ date: string; plan: Plan; sourceLines: number; truncated: boolean }>("/api/daily-practice", { action: "generate", previousTitles: previousTitles.slice(-14) });
      const record: PracticeRecord = { id: crypto.randomUUID(), date: data.date, plan: data.plan, shadowingDone: false, answers: data.plan.translations.map(() => ""), grades: data.plan.translations.map(() => null), turns: [{ role: "assistant", content: data.plan.conversation.opening }] };
      setStorageKey(`studio-practice:${status?.pageId}:${data.date}`); setDraft({ record }); setChatInput("");
      setSource(`来自 ${data.sourceLines} 段 Notion 笔记${data.truncated ? "（内容较多，本次使用部分笔记）" : ""}`);
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(""); }
  };
  const grade = async (index: number) => {
    if (!draft) return;
    setBusy(`grade-${index}`); setMessage("");
    try {
      const result = await api<Grade>("/api/daily-practice", { action: "grade", question: draft.record.plan.translations[index], answer: draft.record.answers[index] });
      update(record => ({ ...record, grades: record.grades.map((item, position) => position === index ? result : item) }));
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(""); }
  };
  const send = async () => {
    if (!draft || !chatInput.trim()) return;
    const content = chatInput.trim();
    const turns: Turn[] = [...draft.record.turns, { role: "user", content }];
    setBusy("chat"); setMessage("");
    try {
      const result = await api<{ reply: string; corrections: NonNullable<Turn["corrections"]> }>("/api/daily-practice", { action: "chat", scenario: draft.record.plan.conversation, turns });
      turns[turns.length - 1].corrections = result.corrections;
      update(record => ({ ...record, turns: [...turns, { role: "assistant", content: result.reply }] })); setChatInput("");
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(""); }
  };
  const save = async () => {
    if (!draft) return;
    setBusy("save"); setMessage("");
    const content = JSON.stringify(draft.record);
    try {
      const result = await api<{ url: string }>("/api/daily-practice", { action: "save", record: draft.record });
      setDraft(current => current ? { ...current, savedContent: content, url: result.url } : null); setMessage("练习、翻译反馈和完整对话已同步到 Notion。");
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(""); }
  };
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) { setMessage("当前浏览器不支持语音播放。"); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-US"; utterance.rate = rate;
    utterance.onerror = () => setMessage("语音播放失败，请检查浏览器语音设置。"); window.speechSynthesis.speak(utterance);
  };
  const dictate = () => {
    if (listening) { recognition.current?.stop(); return; }
    const Constructor = speechRecognition();
    if (!Constructor) { setMessage("浏览器不支持语音转录，请使用 Chrome 或输入英语回复。"); return; }
    const instance = new Constructor(); instance.lang = "en-US"; instance.continuous = true; instance.interimResults = false;
    instance.onresult = event => { for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) setChatInput(current => `${current} ${event.results[index][0].transcript}`.trim().slice(0, 2000)); };
    instance.onend = () => setListening(false); instance.onerror = () => { setListening(false); setMessage("录音失败，请检查麦克风权限或手动输入。"); };
    try { instance.start(); recognition.current = instance; setListening(true); } catch { setMessage("无法启动麦克风，请稍后重试。"); }
  };
  const record = draft?.record;
  const synced = draft && draft.savedContent === JSON.stringify(draft.record);
  return <div className="daily-view">
    <section className="coach-banner"><div><span><BookOpenText size={15}/> DAILY PRACTICE · {record?.date || today || "今日"}</span><h2>把学过的表达，变成会用的英语</h2><p>每天从你的 Notion 笔记生成新任务：跟读 → 翻译 → 情景对话。当天进度自动保存在此浏览器。</p></div></section>
    {!status ? <p className="save-message" role="status">{message || "正在加载连接状态…"}</p> : !status.notionConfigured || !status.aiConfigured ? <section className="paper-card setup-prompt"><h2>先连接笔记和 AI</h2><p>生成练习需要 Notion 课程页面和 OpenAI API Key。</p><Link href="/settings">前往连接设置 →</Link></section> : null}
    {!record && <section className="paper-card practice-start"><BookOpenText size={34}/><h2>开始今天的练习</h2><p>生成后可反复练习同一组题目；下一天进入时会开始新的一组。</p><Button disabled={Boolean(busy) || !status?.notionConfigured || !status?.aiConfigured} onClick={generate}>{busy === "generate" && <Loader2 className="spin" size={16}/>}从 Notion 生成今日练习</Button></section>}
    {record && <>
      <section className="paper-card practice-summary"><div><h2>{record.plan.title}</h2><p>{source || "今日练习 · 已恢复本地进度"}</p><div className="chips">{record.plan.focus.map(item => <span key={item}>{item}</span>)}</div></div><div className="practice-actions"><span>{Number(record.shadowingDone) + record.grades.filter(Boolean).length + Number(record.turns.length > 1)} / {record.plan.translations.length + 2} 项</span><Button disabled={Boolean(busy) || listening || Boolean(synced) || !status?.notionConfigured} onClick={save}>{busy === "save" ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} {synced ? "已同步" : "同步练习到 Notion"}</Button>{draft?.url && <a href={draft.url} target="_blank" rel="noreferrer">查看 Notion 记录 ↗</a>}</div></section>
      <section className="paper-card shadowing-card"><div className="panel-label"><div><b>1</b><span>影子跟读</span></div><small>先听，再同步模仿节奏</small></div><p className="shadowing-text" lang="en">{record.plan.shadowing.text}</p><ul className="practice-tips">{record.plan.shadowing.tips.map(tip => <li key={tip}>{tip}</li>)}</ul><div className="practice-toolbar"><label htmlFor="speech-rate">语速 <select id="speech-rate" value={rate} onChange={event => setRate(Number(event.target.value))}><option value={0.65}>慢速</option><option value={0.85}>练习速度</option><option value={1}>正常速度</option></select></label><Button variant="outline" onClick={() => speak(record.plan.shadowing.text)}><Volume2 size={16}/>播放短文</Button><Button variant="outline" onClick={() => window.speechSynthesis?.cancel()}><CircleStop size={16}/>停止播放</Button><Button variant={record.shadowingDone ? "secondary" : "default"} disabled={Boolean(busy)} onClick={() => update(current => ({ ...current, shadowingDone: !current.shadowingDone }))}><Check size={16}/>{record.shadowingDone ? "已完成跟读" : "标记跟读完成"}</Button></div></section>
      <section className="paper-card translation-card"><div className="panel-label"><div><b>2</b><span>语法与 Collocation 翻译</span></div><small>接受多种自然表达</small></div><div className="translation-list">{record.plan.translations.map((question, index) => <article key={question.chinese}><h3>{index + 1}. {question.chinese}</h3><p className="field-help">提示：{question.hint}</p><label className="sr-only" htmlFor={`translation-${index}`}>第 {index + 1} 题英语翻译</label><Textarea id={`translation-${index}`} lang="en" value={record.answers[index] || ""} maxLength={1500} disabled={Boolean(busy)} placeholder="Write your translation in English…" onChange={event => update(current => ({ ...current, answers: current.answers.map((value, position) => position === index ? event.target.value : value), grades: current.grades.map((value, position) => position === index ? null : value) }))}/><div className="action-row"><Button disabled={Boolean(busy) || !record.answers[index]?.trim()} onClick={() => grade(index)}>{busy === `grade-${index}` && <Loader2 className="spin" size={16}/>}检查翻译</Button></div>{record.grades[index] && <div className="translation-feedback"><strong>{record.grades[index]!.natural}</strong><p>{record.grades[index]!.feedback}</p>{record.grades[index]!.corrections.map((item, position) => <p key={position}><del>{item.original}</del> → <b>{item.natural}</b><br/>{item.reason}</p>)}</div>}<details><summary>查看参考答案</summary><p lang="en">{question.reference}</p><p>{question.explanation}</p></details></article>)}</div></section>
      <section className="paper-card conversation-card"><div className="panel-label"><div><b>3</b><span>与 AI 情景对话</span></div><MessageCircle size={18}/></div><p>{record.plan.conversation.scenario}</p><ul className="practice-tips">{record.plan.conversation.goals.map(goal => <li key={goal}>{goal}</li>)}</ul><div className="chat-log" aria-live="polite">{record.turns.map((turn, index) => <article className={`chat-turn ${turn.role}`} key={index}><div className="chat-speaker">{turn.role === "user" ? "我" : "AI 教练"}{turn.role === "assistant" && <button aria-label="播放这条 AI 回复" onClick={() => speak(turn.content)}><Volume2 size={15}/></button>}</div><p lang="en">{turn.content}</p>{turn.corrections?.map((item, position) => <div className="chat-correction" key={position}><del>{item.original}</del> → <strong>{item.natural}</strong><p>{item.reason}</p><small>{item.alternatives.join(" / ")}</small>{item.examples.map(example => <p key={example} lang="en">{example}</p>)}</div>)}{turn.role === "user" && turn.corrections?.length === 0 && <small className="natural-message">表达自然，继续交流！</small>}</article>)}</div><label htmlFor="chat-input">你的英语回复</label><Textarea id="chat-input" value={chatInput} disabled={Boolean(busy)} maxLength={2000} placeholder="Type or record your response…" onChange={event => setChatInput(event.target.value)}/><div className="action-row"><Button variant="outline" disabled={Boolean(busy) || record.turns.length >= 59} onClick={dictate}>{listening ? <CircleStop size={16}/> : <Mic size={16}/>} {listening ? "停止录音" : "语音输入"}</Button><Button disabled={Boolean(busy) || listening || !chatInput.trim() || record.turns.length >= 59} onClick={send}>{busy === "chat" ? <Loader2 className="spin" size={16}/> : <Send size={16}/>}发送并纠错</Button></div>{record.turns.length >= 59 && <p className="field-help">本次对话已达 29 轮，请同步到 Notion 保存。</p>}</section>
    </>}
    <p className="save-message" role="status">{busy === "generate" ? "正在读取课程笔记并生成练习，请稍候…" : message}</p>
  </div>;
}
