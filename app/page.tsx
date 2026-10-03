"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpenText, Check, CircleStop, Cloud, Database, History, Languages, Loader2, Mic, NotebookPen, RotateCcw, Save, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Correction = { original: string; natural: string; reason: string; alternatives: string[]; examples: string[] };
type ParsedWord = { word: string; meaning: string; example: string; note?: string };

const correctionRules: Array<Correction & { pattern: RegExp }> = [
  { pattern: /robot knowledges?/gi, original: "robot knowledges", natural: "robotics knowledge", reason: "knowledge 通常不可数；谈领域知识时，robotics 比 robot 更自然。", alternatives: ["knowledge of robotics", "robotics fundamentals"], examples: ["I wish I had built a stronger foundation in robotics.", "I need to improve my knowledge of robot control."] },
  { pattern: /make people'?s life easier/gi, original: "make people's life easier", natural: "make people’s lives easier", reason: "people 对应复数 lives；这是表达科技便利性的常见搭配。", alternatives: ["make life more convenient", "simplify everyday tasks"], examples: ["Online services make people’s lives easier.", "The app simplifies everyday tasks."] },
  { pattern: /order some food/gi, original: "order some food", natural: "order food", reason: "泛指点外卖或点餐时，food 通常不需要 some。", alternatives: ["order takeout", "get food delivered"], examples: ["I usually order food through an app.", "We got takeout delivered to the office."] },
  { pattern: /take some taxis/gi, original: "take some taxis", natural: "take a taxi / book a ride", reason: "描述一次出行通常用单数 a taxi；使用网约车服务时 book a ride 更自然。", alternatives: ["hail a taxi", "get a cab"], examples: ["You can book a ride from your phone.", "We took a taxi to the station."] },
  { pattern: /on internet/gi, original: "on internet", natural: "on the internet", reason: "internet 在这一固定表达中通常带定冠词 the。", alternatives: ["online", "on social media"], examples: ["People behave differently on the internet.", "I found the article online."] },
  { pattern: /in (?:the )?reality world/gi, original: "in reality world", natural: "in real life", reason: "in reality world 是中式组合；对比线上与线下时用 in real life。", alternatives: ["offline", "face to face"], examples: ["We rarely meet in real life.", "Face-to-face conversations feel more personal."] },
  { pattern: /send messagers?|send messengers/gi, original: "send messagers", natural: "send messages", reason: "message 是信息；messenger 指送信的人或通讯应用。", alternatives: ["text someone", "stay in touch by message"], examples: ["We send messages every day.", "I text my family when I arrive."] },
  { pattern: /have never had a contact with/gi, original: "have never had a contact with", natural: "have never had any experience with", reason: "have a contact with 不用于表达从未接触某项活动。", alternatives: ["have never come into contact with", "have never tried"], examples: ["I’ve never had any experience with board games.", "I’ve never tried this kind of game before."] },
  { pattern: /by my code,? by my logic/gi, original: "by my code, by my logic", natural: "using my code and rule-based logic", reason: "表示手段时用 using/with；by my code 不自然。", alternatives: ["with hand-written rules", "through rule-based planning"], examples: ["It is difficult to handle every edge case with hand-written rules.", "The vehicle relies on rule-based planning."] },
  { pattern: /he just wait(?:s|ed)? for his turn to (?:speak out|talk)/gi, original: "he just waits for his turn to speak", natural: "he is only waiting for his turn to talk", reason: "表达‘只等着轮到自己说’时，waiting for his turn to talk 是最自然的固定说法。", alternatives: ["listen only to respond", "not really listen"], examples: ["He listens only to respond, not to understand.", "She was just waiting for her turn to talk."] },
  { pattern: /i totally have about that/gi, original: "I totally have about that", natural: "I feel exactly the same way about that", reason: "have about 不能表达认同；用 feel the same way 或 agree。", alternatives: ["I completely agree", "That’s exactly how I feel"], examples: ["I feel exactly the same way about that.", "That’s exactly how I feel."] },
  { pattern: /each mooncakes/gi, original: "each mooncakes", natural: "each mooncake", reason: "each 后接可数名词单数。", alternatives: ["every mooncake", "the individual mooncakes"], examples: ["Each mooncake has a different filling.", "Every mooncake is individually wrapped."] },
  { pattern: /discuss about/gi, original: "discuss about", natural: "discuss", reason: "discuss 是及物动词，后面直接接讨论对象，不加 about。", alternatives: ["talk about", "have a discussion about"], examples: ["We discussed the test results.", "We had a discussion about the release plan."] },
  { pattern: /return back/gi, original: "return back", natural: "return / go back", reason: "return 已经包含‘回去’的含义，back 重复。", alternatives: ["go back", "come back"], examples: ["I returned to work on Monday.", "I went back to the office after lunch."] },
];

const WORD_BANK: Record<string, Omit<ParsedWord, "word">> = {
  bittersweet: { meaning: "苦乐参半的", example: "Finishing the project felt bittersweet." },
  ecstatic: { meaning: "欣喜若狂的", example: "She was ecstatic when she received the offer." },
  deflated: { meaning: "泄气的、沮丧的", example: "I felt deflated after the test failed again." },
  setback: { meaning: "挫折、暂时阻碍进展的问题", example: "The failed test was a setback, not the end of the project." },
  reciprocity: { meaning: "互惠、相互回应", example: "Healthy relationships depend on trust and reciprocity." },
  sociological: { meaning: "社会学的、从社会学角度的", example: "The book offers a sociological analysis of family life." },
};

function parseTranscript(raw: string): ParsedWord[] {
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const candidates = lines.filter((line) => !/^(Mark|刘怡媛)\s+\d{4}\/\d{1,2}\/\d{1,2}/i.test(line) && !/^\d{1,2}:\d{2}/.test(line) && !/^=\s*/.test(line));
  return [...new Set(candidates)].map((original) => ({ word: original, ...(WORD_BANK[original.toLowerCase()] ?? { meaning: "待补充释义", example: `I learned how to use “${original}” in today’s class.` }) }));
}

function analyzeTranscript(transcript: string) {
  const found: Correction[] = [];
  let revised = transcript;
  for (const rule of correctionRules) {
    const matches = transcript.match(rule.pattern);
    if (!matches) continue;
    found.push({ original: matches[0], natural: rule.natural, reason: rule.reason, alternatives: rule.alternatives, examples: rule.examples });
    revised = revised.replace(rule.pattern, rule.natural);
  }
  return { corrections: found, revised };
}

function Sidebar({ section, onChange }: { section: string; onChange: (value: string) => void }) {
  const items = [
    { id: "coach", label: "口语纠正", icon: Mic }, { id: "history", label: "纠正历史", icon: History },
    { id: "capture", label: "课程记录", icon: NotebookPen }, { id: "review", label: "搭配库", icon: Languages },
  ];
  return <aside className="sidebar"><div className="brand"><span className="brand-mark">Y</span><div><strong>口语练习室</strong><small>SPEAKING STUDIO</small></div></div><nav>{items.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "nav-item active" : "nav-item"} onClick={() => onChange(id)}><Icon size={18}/><span>{label}</span>{id === "coach" && <em>NEW</em>}</button>)}</nav><div className="sidebar-status"><div className="sync-line"><Cloud size={16}/><span>Notion 笔记</span><span className="status-dot"/></div><small>同步目标：English speaking course notes<br/>提交后显示实际同步结果</small></div></aside>;
}

function Header({ section }: { section: string }) {
  const titles: Record<string, string> = { coach: "口语转录与搭配纠正", history: "纠正历史", capture: "课程记录", review: "搭配库" };
  return <header className="topbar"><div><p>保留你的语气，只修真正影响自然度的地方</p><h1>{titles[section]}</h1></div><button className="avatar" aria-label="用户菜单">YY</button></header>;
}

function CoachView() {
  const [transcript, setTranscript] = useState(""); const [listening, setListening] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]); const [revised, setRevised] = useState("");
  const [analyzed, setAnalyzed] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const recognitionRef = useRef<any>(null);
  const startListening = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setMessage("当前浏览器不支持实时语音识别。建议使用 Chrome，或直接粘贴转录文本。"); return; }
    const recognition = new Recognition(); recognition.lang = "en-US"; recognition.continuous = true; recognition.interimResults = true;
    let committed = transcript.trim() ? `${transcript.trim()} ` : "";
    recognition.onresult = (event: any) => { let interim = ""; for (let i = event.resultIndex; i < event.results.length; i += 1) { const chunk = event.results[i][0].transcript; if (event.results[i].isFinal) committed += `${chunk.trim()} `; else interim += chunk; } setTranscript(`${committed}${interim}`.trim()); };
    recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setMessage("没有识别到清晰语音。可以重新录制或手动修改转录。"); };
    recognition.start(); recognitionRef.current = recognition; setListening(true); setMessage("");
  };
  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };
  const analyze = () => { const result = analyzeTranscript(transcript); setCorrections(result.corrections); setRevised(result.revised); setAnalyzed(true); setMessage(""); };
  const reset = () => { stopListening(); setTranscript(""); setCorrections([]); setRevised(""); setAnalyzed(false); setMessage(""); };
  const save = async () => { setSaving(true); setMessage(""); try { const response = await fetch("/api/speech-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript, revised, corrections }) }); const data = await response.json() as { message?: string; notionSynced?: boolean }; if (!response.ok) throw new Error(data.message || "保存失败"); setMessage(data.notionSynced ? "已保存，并同步到 Notion。" : "Notion 未同步，请检查配置。"); } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。"); } finally { setSaving(false); } };
  return <div className="coach-view"><section className="coach-banner"><div><span><Sparkles size={14}/> COLLOCATION COACH</span><h2>说完再改，不打断表达</h2><p>录下真实交流或粘贴转录。只标出不自然、错误或中式的搭配，并尽量保留你的原意与语气。</p></div><div className="principles"><span><Check size={14}/> 局部修改</span><span><Check size={14}/> 解释原因</span><span><Check size={14}/> 迁移表达</span></div></section><div className="coach-grid"><section className="paper-card transcript-panel"><div className="panel-label"><div><b>1</b><span>录音或粘贴转录</span></div><small>{transcript.split(/\s+/).filter(Boolean).length} words</small></div><div className={listening ? "recording-box live" : "recording-box"}><div className="wave"><i/><i/><i/><i/><i/></div><div><strong>{listening ? "正在听你的英语…" : "实时英语转录"}</strong><small>{listening ? "说完后点击停止，可继续手动修改" : "Chrome 支持最佳；转录完成后仍可编辑"}</small></div><Button onClick={listening ? stopListening : startListening} className={listening ? "stop-button" : "record-button"}>{listening ? <><CircleStop size={17}/>停止</> : <><Mic size={17}/>开始录音</>}</Button></div><Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste or record your English here…\n\nExample: Technology make people's life easier because we can order some food and take some taxis from the phone…" /><div className="action-row"><Button variant="outline" onClick={reset} disabled={!transcript}><RotateCcw size={16}/>清空</Button><Button onClick={analyze} disabled={!transcript.trim()}><WandSparkles size={16}/>分析搭配</Button></div>{message && <p className="save-message">{message}</p>}</section><section className="paper-card results-panel"><div className="panel-label"><div><b>2</b><span>局部纠正与扩展</span></div><small>{corrections.length} 处建议</small></div>{!analyzed ? <div className="empty-preview"><BookOpenText size={31}/><p>纠正结果会显示在这里</p><small>不会为了“高级”而重写整段话</small></div> : corrections.length === 0 ? <div className="no-issues"><Check size={23}/><div><strong>没有发现规则库中的明显搭配问题</strong><p>你仍可以保存转录。更细致的语境判断将在 AI 分析接入后继续增强。</p></div></div> : <div className="correction-list">{corrections.map((item, index) => <article key={`${item.original}-${index}`}><div className="correction-change"><span>{item.original}</span><strong>{item.natural}</strong></div><p><AlertTriangle size={14}/>{item.reason}</p><div className="chips">{item.alternatives.map((alt) => <span key={alt}>{alt}</span>)}</div><ul>{item.examples.map((example) => <li key={example}>{example}</li>)}</ul></article>)}</div>}{analyzed && <div className="revised-box"><span>保留原意的修改版</span><Textarea value={revised} onChange={(e) => setRevised(e.target.value)}/><Button onClick={save} disabled={saving || !revised.trim()} className="wide-button notion-button">{saving ? <Loader2 className="spin" size={16}/> : <Save size={16}/>}保存记录并同步 Notion</Button></div>}</section></div></div>;
}

function HistoryView() { return <div className="empty-page"><History size={34}/><h2>纠正历史</h2><p>保存后的真实口语转录会出现在这里，方便你回看反复出现的搭配问题。</p></div>; }

function CaptureView() {
  const [raw, setRaw] = useState(""); const [preview, setPreview] = useState<ParsedWord[]>([]); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const parse = () => { setPreview(parseTranscript(raw)); setMessage(""); };
  const save = async () => { setSaving(true); setMessage(""); try { const response = await fetch("/api/course-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), raw, words: preview }) }); const data = await response.json() as { message?: string; notionSynced?: boolean }; if (!response.ok) throw new Error(data.message || "保存失败"); setMessage(data.notionSynced ? "已保存并同步到 Notion。" : "Notion 未同步，请检查配置。"); } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。"); } finally { setSaving(false); } };
  return <div className="capture-view"><section className="capture-intro"><span><Database size={18}/></span><div><h2>把课后聊天记录整理成词汇笔记</h2><p>清除姓名与时间戳、合并重复项；写入前由你确认。</p></div></section><div className="capture-grid"><section className="paper-card input-panel"><div className="panel-label"><div><b>1</b><span>粘贴课堂原始记录</span></div><small>{raw.length} 字符</small></div><Textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'Mark 2026/9/29 23:10:05\nbittersweet\n\nMark 2026/9/29 23:10:31\necstatic\n\n...'} /><Button onClick={parse} disabled={!raw.trim()} className="wide-button"><Sparkles size={16}/>整理并预览</Button></section><section className="paper-card preview-panel"><div className="panel-label"><div><b>2</b><span>检查整理结果</span></div><small>{preview.length} 个词条</small></div>{preview.length === 0 ? <div className="empty-preview"><NotebookPen size={30}/><p>整理后的词汇会显示在这里</p><small>写入 Notion 前可以修改和检查</small></div> : <div className="word-preview">{preview.map((item, index) => <div key={`${item.word}-${index}`}><div className="word-top"><strong>{item.word}</strong><span>{item.meaning}</span></div><p>{item.example}</p>{item.note && <small>{item.note}</small>}</div>)}</div>}<Button onClick={save} disabled={!preview.length || saving} className="wide-button notion-button">{saving ? <Loader2 className="spin" size={16}/> : <Save size={16}/>}确认保存并同步 Notion</Button>{message && <p className="save-message">{message}</p>}</section></div></div>;
}

function ReviewView() { const collocations = [["make people’s lives easier", "让人们的生活更便利", "Technology can make people’s lives easier."], ["book a ride", "预约车辆 / 打车", "You can book a ride from your phone."], ["listen only to respond", "只为回应而听", "He listens only to respond, not to understand."], ["wait for your turn to talk", "等着轮到自己讲话", "She was waiting for her turn to talk."], ["using rule-based logic", "使用基于规则的逻辑", "The system handles the case using rule-based logic."], ["in real life", "在现实生活中", "We rarely meet in real life."]]; return <div className="review-view"><div className="flashcards">{collocations.map(([word, meaning, example]) => <article key={word} className="flashcard"><span>可迁移搭配</span><h3>{word}</h3><p>{meaning}</p><small>{example}</small></article>)}</div></div>; }

export default function Home() { const [section, setSection] = useState("coach"); const content = useMemo(() => ({ coach: <CoachView/>, history: <HistoryView/>, capture: <CaptureView/>, review: <ReviewView/> })[section] ?? <CoachView/>, [section]); return <main className="app-shell"><Sidebar section={section} onChange={setSection}/><section className="workspace"><Header section={section}/><div className="mobile-tabs"><Tabs value={section} onValueChange={setSection}><TabsList><TabsTrigger value="coach">纠正</TabsTrigger><TabsTrigger value="history">历史</TabsTrigger><TabsTrigger value="capture">记录</TabsTrigger><TabsTrigger value="review">搭配</TabsTrigger></TabsList><TabsContent value={section}/></Tabs></div><div className="page-content">{content}</div></section></main>; }
