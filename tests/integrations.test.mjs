import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { connections, connectionCookie, normalizePageId } from "../lib/server/connections.ts";
import { readNotes, saveNotionPage, savePracticeSnapshot, textBlocks } from "../lib/server/notion.ts";
import { GET as connectionStatus, POST as connect } from "../app/api/connections/route.ts";
import { POST as practice } from "../app/api/daily-practice/route.ts";
import { POST as course } from "../app/api/course-notes/route.ts";
import { GET as courseNotes } from "../app/api/course-notes/route.ts";
import { POST as speech } from "../app/api/speech-review/route.ts";

const nativeFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => { globalThis.fetch = nativeFetch; process.env = { ...originalEnv }; });
const config = { notionToken: "test-notion-token", pageId: "a".repeat(32), aiKey: "test-ai-key", model: "gpt-4.1-mini" };
const json = data => Response.json(data);
function request(body, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin, "content-type": "application/json", cookie: connectionCookie(config).split(";")[0] }, body: JSON.stringify(body) });
}
const paragraph = (id, text) => ({ id, type: "paragraph", paragraph: { rich_text: [{ plain_text: text }] } });
const plan = {
  title: "Discussing everyday technology", focus: ["discuss without about", "make people's lives easier"],
  shadowing: { text: "Technology can make people's lives easier. We discussed how online services help us save time. I often book a ride when I need to get to work early. Small improvements make a big difference in real life.", tips: ["注意 lives 的尾音。"] },
  translations: Array.from({ length: 3 }, (_, index) => ({ chinese: `题目${index + 1}`, hint: "discuss", reference: "We discussed the results.", explanation: "discuss 后不加 about。" })),
  conversation: { scenario: "讨论科技", opening: "How does technology help you?", goals: ["使用 discuss", "使用 book a ride"] },
};

test("connection cookie is encrypted, tamper-resistant and never returned in status", async () => {
  const cookie = connectionCookie(config);
  assert.ok(!cookie.includes(config.aiKey)); assert.ok(cookie.includes("HttpOnly"));
  const req = new Request("http://localhost", { headers: { cookie } });
  assert.equal(connections(req).aiKey, config.aiKey);
  const status = await (await connectionStatus(req)).json();
  assert.equal(status.aiConfigured, true); assert.equal(status.aiKey, undefined); assert.equal(status.notionToken, undefined);
  delete process.env.OPENAI_API_KEY;
  assert.equal(connections(new Request("http://localhost", { headers: { cookie: "studio_connections=invalid" } })).aiKey, "");
});
test("production cookie requires a stable encryption secret", () => {
  process.env.NODE_ENV = "production"; delete process.env.CONNECTION_SECRET;
  assert.throws(() => connectionCookie(config), /CONNECTION_SECRET/);
  process.env.CONNECTION_SECRET = "random-testing-secret-".repeat(3);
  assert.ok(connectionCookie(config).includes("Secure"));
});
test("Notion links normalize with queries and invalid IDs are rejected", () => {
  assert.equal(normalizePageId(`https://www.notion.so/Notes-${config.pageId}?v=123`), config.pageId);
  assert.throws(() => normalizePageId("not-a-page"));
});
test("paginated and nested Notion notes are read, daily practice is excluded", async () => {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    if (url.includes("start_cursor=")) return json({ results: [{ id: "daily", type: "child_page", child_page: { title: "Daily Practice · Yesterday" } }], has_more: false });
    if (url.includes("nested")) return json({ results: [paragraph("word", "book a ride")], has_more: false });
    return json({ results: [paragraph("grammar", "discuss is transitive"), { id: "nested", type: "toggle", has_children: true, toggle: { rich_text: [{ plain_text: "Vocabulary" }] } }], has_more: true, next_cursor: "next" });
  };
  const notes = await readNotes(config);
  assert.match(notes.text, /book a ride/); assert.match(notes.text, /discuss/);
  assert.equal(notes.previous.length, 1); assert.ok(!calls.some(url => url.includes("blocks/daily/")));
});
test("long Notion text is preserved and more than 100 blocks use batches", async () => {
  const text = "a".repeat(30500);
  const blocks = textBlocks(text);
  assert.equal(blocks.map(block => block.paragraph.rich_text[0].text.content).join(""), text);
  const bodies = [];
  globalThis.fetch = async (_url, options) => { bodies.push(JSON.parse(options.body)); return json({ id: "saved-page", url: "https://notion.so/saved" }); };
  await saveNotionPage(config, "test", Array.from({ length: 205 }, () => textBlocks("word")[0]));
  assert.deepEqual(bodies.map(body => body.children.length), [100, 100, 5]);
});
test("foreign origins cannot trigger writes or AI calls", async () => {
  globalThis.fetch = () => { throw new Error("must not call upstream"); };
  assert.equal((await practice(request({ action: "generate" }, "https://other.example"))).status, 403);
  assert.equal((await connect(request({ action: "save" }, "https://other.example"))).status, 403);
});
test("generation uses live Notion notes, date and previous topics", async () => {
  let sent;
  globalThis.fetch = async (url, options) => {
    if (url.includes("notion.com")) return json({ results: [paragraph("word", "book a ride: 打车")], has_more: false });
    sent = JSON.parse(options.body); return json({ choices: [{ message: { content: JSON.stringify(plan) } }] });
  };
  const response = await practice(request({ action: "generate", previousTitles: ["Yesterday"] }));
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.sourceLines, 1); assert.equal(data.plan.translations.length, 3);
  const input = JSON.parse(sent.messages[1].content); assert.match(input.notes, /book a ride/); assert.ok(input.previousTitles.includes("Yesterday")); assert.match(input.date, /^\d{4}-\d{2}-\d{2}$/);
});
test("AI translation and conversation corrections are schema validated", async () => {
  globalThis.fetch = async () => json({ choices: [{ message: { content: JSON.stringify({ reply: "What did you discuss?", corrections: [{ original: "discuss about", natural: "discuss", reason: "及物动词", alternatives: ["talk about"], examples: ["We discussed it."] }] }) } }] });
  const reply = await practice(request({ action: "chat", scenario: plan.conversation, turns: [{ role: "assistant", content: plan.conversation.opening }, { role: "user", content: "We discuss about apps." }] }));
  assert.equal(reply.status, 200); assert.equal((await reply.json()).corrections[0].natural, "discuss");
  globalThis.fetch = async () => json({ choices: [{ message: { content: "{}" } }] });
  assert.equal((await practice(request({ action: "grade", question: plan.translations[0], answer: "We discussed it." }))).status, 502);
});
test("practice save includes answers, feedback, entire dialogue and corrections", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, options) => { if (options.method === "GET") return json({ results: [], has_more: false }); bodies.push(JSON.parse(options.body)); return json({ id: "practice-page", url: "https://notion.so/practice" }); };
  const record = { id: "ba8c86ae-8116-43a6-8a58-bc910fe2fddc", date: "2026-10-04", plan, shadowingDone: true, answers: ["We discussed it.", "", ""], grades: [{ natural: "We discussed it.", feedback: "表达自然", corrections: [] }, null, null], turns: [{ role: "assistant", content: plan.conversation.opening }, { role: "user", content: "We discuss about apps.", corrections: [{ original: "discuss about", natural: "discuss", reason: "及物动词", alternatives: [], examples: [] }] }] };
  assert.equal((await practice(request({ action: "save", record }))).status, 200);
  const saved = JSON.stringify(bodies); assert.match(saved, /表达自然/); assert.match(saved, /We discuss about apps/); assert.match(saved, /及物动词/);
});
test("course and speaking records save raw text beyond 1,900 characters", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, options) => { bodies.push(JSON.parse(options.body)); return json({ id: "page", url: "https://notion.so/page" }); };
  const raw = "English course notes. ".repeat(300) + "END_OF_RECORD";
  assert.equal((await course(request({ date: "2026-10-04", raw, words: [{ word: "discuss", meaning: "讨论", example: "We discussed it." }] }))).status, 200);
  assert.equal((await speech(request({ transcript: raw, revised: raw, corrections: [] }))).status, 200);
  assert.equal(JSON.stringify(bodies).split("END_OF_RECORD").length - 1, 3);
});
test("upstream auth and network errors produce useful, non-secret messages", async () => {
  globalThis.fetch = async () => new Response("denied", { status: 401 });
  const response = await practice(request({ action: "generate" }));
  assert.equal(response.status, 502); assert.match((await response.json()).message, /Token 无效/);
  globalThis.fetch = async () => { throw new Error("network failure with secret"); };
  const failure = await course(request({ date: "2026-10-04", raw: "note", words: [{ word: "word", meaning: "词", example: "A word." }] }));
  assert.equal(failure.status, 504); assert.ok(!(await failure.json()).message.includes("secret"));
});
test("retrying an identical practice snapshot reuses the completed page", async () => {
  let savedTitle = "";
  let creates = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "GET") return json({ results: savedTitle ? [{ id: "snapshot-page", type: "child_page", child_page: { title: savedTitle } }] : [], has_more: false });
    const body = JSON.parse(options.body);
    if (options.method === "POST") { creates++; assert.match(body.properties.title.title[0].text.content, /同步中/); return json({ id: "snapshot-page", url: "https://notion.so/snapshot" }); }
    savedTitle = body.properties.title.title[0].text.content;
    return json({ id: "snapshot-page" });
  };
  const blocks = textBlocks("complete dialogue");
  await savePracticeSnapshot(config, "Daily Practice · Today", blocks, "record");
  await savePracticeSnapshot(config, "Daily Practice · Today", blocks, "record");
  assert.equal(creates, 1); assert.ok(!savedTitle.includes("同步中"));
  await savePracticeSnapshot(config, "Daily Practice · Today", textBlocks("updated dialogue"), "record");
  assert.equal(creates, 2);
});
test("missing notes never produce invented exercises", async () => {
  globalThis.fetch = async url => { assert.match(url, /notion.com/); return json({ results: [], has_more: false }); };
  const response = await practice(request({ action: "generate" }));
  assert.equal(response.status, 400); assert.match((await response.json()).message, /还没有/);
});
test("a valid alternative translation receives feedback without false corrections", async () => {
  globalThis.fetch = async () => json({ choices: [{ message: { content: JSON.stringify({ natural: "We talked about the results.", feedback: "talk about 是有效表达。", corrections: [] }) } }] });
  const response = await practice(request({ action: "grade", question: plan.translations[0], answer: "We talked about the results." }));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).corrections, []);
});
test("saving UI credentials validates the page and does not return the tokens", async () => {
  globalThis.fetch = async () => json({ properties: { title: { type: "title", title: [{ plain_text: "English Notes" }] } } });
  const response = await connect(request({ action: "save", notionToken: "replacement-notion", pageId: config.pageId, aiKey: "replacement-ai", model: "gpt-4.1-mini" }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie"); assert.ok(cookie.includes("HttpOnly"));
  const saved = connections(new Request("http://localhost", { headers: { cookie } }));
  assert.equal(saved.aiKey, "replacement-ai"); assert.equal(saved.notionToken, "replacement-notion");
  assert.ok(!JSON.stringify(await response.json()).includes("replacement"));
});

test("testing Notion saves the tested connection and immediately allows reading notes", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.authorization, "Bearer latest-notion");
    assert.ok(url.includes("b".repeat(32)));
    return url.includes("/pages/")
      ? json({ properties: { title: { type: "title", title: [{ plain_text: "Latest Notes" }] } } })
      : json({ results: [paragraph("note", "Read after connecting")], has_more: false });
  };
  const response = await connect(request({ action: "test-notion", notionToken: "latest-notion", pageId: "b".repeat(32), aiKey: "unsaved-ai", model: "unsaved-model" }));
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.notionConfigured, true);
  const cookie = response.headers.get("set-cookie");
  const req = new Request("http://localhost/api/course-notes", { headers: { cookie } });
  assert.equal(connections(req).aiKey, config.aiKey);
  assert.equal(connections(req).model, config.model);
  const notes = await courseNotes(req);
  assert.equal(notes.status, 200);
  assert.match((await notes.json()).text, /Read after connecting/);
});

test("testing AI saves only its key and model despite an incomplete Notion draft", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer latest-ai");
    assert.equal(JSON.parse(options.body).model, "gpt-4.1");
    return json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  const response = await connect(request({ action: "test-ai", aiKey: "latest-ai", model: "gpt-4.1", pageId: "incomplete", notionToken: "unsaved-notion" }));
  assert.equal(response.status, 200);
  const saved = connections(new Request("http://localhost", { headers: { cookie: response.headers.get("set-cookie") } }));
  assert.equal(saved.aiKey, "latest-ai"); assert.equal(saved.model, "gpt-4.1");
  assert.equal(saved.notionToken, config.notionToken); assert.equal(saved.pageId, config.pageId);
});

test("models use the supplied key or saved key, filter incompatible families and never expose credentials", async () => {
  const keys = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/models");
    keys.push(options.headers.authorization);
    return json({ data: ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1", "o3-mini", "gpt-image-1", "gpt-4o-realtime-preview", "gpt-4o-audio-preview", "gpt-5-pro", "gpt-5-codex", "o3-deep-research", "text-embedding-3-small"].map(id => ({ id })) });
  };
  for (const aiKey of ["latest-ai", ""]) {
    const response = await connect(request({ action: "models", aiKey, pageId: "incomplete" }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual((await response.json()).models, ["gpt-4.1", "gpt-4.1-mini", "o3-mini"]);
  }
  assert.deepEqual(keys, ["Bearer latest-ai", `Bearer ${config.aiKey}`]);
});

test("failed tests never overwrite saved credentials and model errors hide upstream secrets", async () => {
  globalThis.fetch = async () => new Response("upstream-secret", { status: 401 });
  for (const action of ["test-notion", "test-ai", "models"]) {
    const response = await connect(request({ action, notionToken: "bad-notion", aiKey: "bad-ai" }));
    assert.equal(response.status, 502); assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!JSON.stringify(await response.json()).includes("upstream-secret"));
  }
});
