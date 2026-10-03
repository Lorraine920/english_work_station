# English Speaking Studio

英语口语转录、搭配纠正、课程词汇整理与 Notion 同步工具。此版本已经从 ChatGPT Sites 运行环境迁移为标准 Next.js 项目，可直接放入 GitHub 并部署到 Vercel。

## 已包含

- 浏览器英语语音转录（Chrome 支持最佳）
- 不自然、中式或错误搭配的局部纠正
- 原因说明、可迁移搭配和例句
- 保留原意的轻量修改版
- 课堂聊天记录清理与词汇预览
- 将口语纠正和词汇笔记写入 Notion
- 每日练习：从 Notion 课程笔记生成跟读短文、语法与搭配翻译题、AI 情景对话
- 浏览器播放英语短文、调节语速，以及对话语音输入
- 翻译反馈、逐轮对话纠错、自动恢复当天进度，以及练习结果同步 Notion
- 连接设置：输入 Notion Token / 页面链接和 OpenAI API Key，测试连接并预览笔记

## 本地启动

需要 Node.js 20.9 或更高版本，以及 pnpm。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 http://localhost:3000。

## 连接 Notion

1. 在 Notion 的 My integrations 页面创建一个 internal integration，并复制 token。
2. 打开目标页面 `English speaking course notes`，通过页面菜单 Connections 把该 integration 加入页面。
3. 打开网站的“连接设置”（`/settings`），填写 Token 和页面链接（或 Page ID），点击“测试 Notion”后“保存连接”。integration 需要读取和插入内容的权限。
4. 填写 OpenAI API Key，默认模型为 `gpt-4.1-mini`。点击“测试 AI”验证模型权限，然后保存。密钥输入框留空表示保留已保存的密钥。

密钥经服务端 AES-GCM 加密后保存在 HttpOnly Cookie 中，有效期 30 天，不会写入 localStorage 或返回给页面。生产环境必须设置至少 32 字符的 `CONNECTION_SECRET`，所有实例使用同一个值；可用 `openssl rand -hex 32` 生成。本地开发未设置此变量时使用临时密钥，重启后需要重新连接。

也可在 `.env.local` 或部署环境中设置 `NOTION_TOKEN`、`NOTION_PAGE_ID`、`OPENAI_API_KEY`、`OPENAI_MODEL` 作为服务器默认连接。使用共享服务器密钥的部署应仅供自己或授权用户访问。清除浏览器连接不会删除这些环境变量。

不要提交 `.env.local`。项目的 `.gitignore` 已排除密钥文件，但保留 `.env.example`。

## 每日练习

1. 先在“课程记录”保存课程原文和词汇，或直接在 Notion 课程页面添加文字笔记。
2. 打开“每日练习”（`/practice`），点击“从 Notion 生成今日练习”。每天以上海时区为准，刷新或重新进入会恢复当天题目；下一天会显示新练习入口。
3. 播放短文并调节语速，模仿朗读后标记完成。浏览器语音功能需要系统支持；麦克风输入需要 HTTPS 或 localhost。
4. 完成翻译并点击“检查翻译”。AI 接受符合原意的自然表达，不只匹配参考答案。
5. 用文本或语音与 AI 对话，每轮回复显示语法与搭配纠错。本次最多 29 轮；输入草稿和已完成对话保存在此浏览器中。
6. 点击“同步练习到 Notion”，保存题目、答案、反馈、跟读状态、完整对话及纠错。修改后的进度会产生新的存档快照，重复同步相同快照复用原页面。

读取笔记支持分页、嵌套块和课程子页面，跳过本站生成的每日练习，避免把练习反馈反复当成课程材料。为控制延迟，每次最多读取 20 批块、向 AI 提供 35,000 字符，超过时页面会提示仅使用部分笔记。当前支持文字块、表格文字和子页面；不读取附件、PDF 或数据库记录内容。AI 会收到这些笔记和用户提交的练习内容，并产生 API 费用。

当天题目和练习进度保存在当前浏览器，跨设备回看请使用 Notion 存档。关闭网页时不会后台生成题目；下一天打开练习页面后可生成新题。

## 检查

```bash
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm test
pnpm build
```

测试使用 Node.js 24 的内置测试运行器和 TypeScript 加载钩子，不会请求真实 Notion / AI 服务。若运行环境限制 Turbopack 所需的进程或端口，可使用 `pnpm build --webpack`。

## 推送到 GitHub

```bash
git add .
git commit -m "Import English Speaking Studio"
git push -u origin master
```

如果默认分支不是 `master`，请将最后一个命令中的分支名替换为实际名称。

## 部署到 Vercel

1. 在 Vercel 中导入 GitHub 仓库 `english_work_station`。
2. Framework Preset 选择 Next.js，其他构建设置保留默认值。
3. 在 Project Settings → Environment Variables 添加 `CONNECTION_SECRET`（至少 32 字符）。可以在网站设置中输入个人 Notion / AI 密钥，也可为私有部署配置服务器默认连接。
4. 点击 Deploy。此后每次推送 GitHub，Vercel 会自动重新部署。

## 数据说明

当前迁移版把正式记录直接保存到 Notion，不再使用原 ChatGPT Site 的专用数据库。纠正历史页面目前仍是占位页面；如果之后需要站内检索和统计，可以接入 Vercel Postgres、Supabase 或 Neon。

接口实现参考：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat)、[Notion 读取块](https://developers.notion.com/reference/get-block-children)、[Notion 请求限制](https://developers.notion.com/reference/request-limits)。
