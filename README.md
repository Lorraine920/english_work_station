# English Speaking Studio

英语口语转录、搭配纠正、课程词汇整理与 Notion 同步工具。此版本已经从 ChatGPT Sites 运行环境迁移为标准 Next.js 项目，可直接放入 GitHub 并部署到 Vercel。

## 已包含

- 浏览器英语语音转录（Chrome 支持最佳）
- 不自然、中式或错误搭配的局部纠正
- 原因说明、可迁移搭配和例句
- 保留原意的轻量修改版
- 课堂聊天记录清理与词汇预览
- 将口语纠正和词汇笔记写入 Notion

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
3. 在 `.env.local` 中填写 `NOTION_TOKEN` 和 `NOTION_PAGE_ID`。

不要提交 `.env.local`。项目的 `.gitignore` 已排除密钥文件，但保留 `.env.example`。

## 推送到 GitHub

```bash
git add .
git commit -m "Import English Speaking Studio"
git push -u origin main
```

如果默认分支不是 `main`，请将最后一个命令中的分支名替换为实际名称。

## 部署到 Vercel

1. 在 Vercel 中导入 GitHub 仓库 `english-speaking-studio`。
2. Framework Preset 选择 Next.js，其他构建设置保留默认值。
3. 在 Project Settings → Environment Variables 添加 `NOTION_TOKEN` 和 `NOTION_PAGE_ID`。
4. 点击 Deploy。此后每次推送 GitHub，Vercel 会自动重新部署。

## 数据说明

当前迁移版把正式记录直接保存到 Notion，不再使用原 ChatGPT Site 的专用数据库。纠正历史页面目前仍是占位页面；如果之后需要站内检索和统计，可以接入 Vercel Postgres、Supabase 或 Neon。
