# 知题 · 秋招题库

一个使用 Next.js 和 Supabase PostgreSQL 的个人技术面试题库。可以批量导入问题、自动分类、按需生成答案、围绕题目追问，并把明确说出的薄弱点保存在题目下。

## 启动

需要 Node.js 22 或更新版本。

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 中填写 `DATABASE_URL`，使用 Supabase **Connect → Direct → Transaction Pooler** 提供的连接串（端口 `6543`）。替换密码占位符，密码中的特殊字符需要 URL 编码。也支持已有的 `.env`；如果两者都存在，Next.js 优先读取 `.env.local`。

连接使用 TLS 并验证证书。项目根目录的 `prod-ca-2021.crt` 是从 Supabase 下载的公开 CA 证书，会随 Vercel API 一起打包，可以提交到 GitHub。也可以用 `DATABASE_SSL_CA` 覆盖证书：填完整 PEM 内容，多行证书可以放在引号内，也支持用 `\n` 表示换行。不要关闭证书验证。

在 Supabase SQL Editor 中执行 `supabase/schema.sql`，或在本机执行：

```bash
npm run db:setup
npm run db:check
npm run dev
```

建表脚本可重复执行，不会清空已有数据。此前执行过旧版建表 SQL 的项目也需执行一次，以补充 `sequence_id` 排序字段。随后打开 <http://127.0.0.1:3000>。

题库保存在 Supabase 中，备份应使用 PostgreSQL 导出或 Supabase 的备份功能。原来的 `data/interview.db` 会保留，但不会自动迁移到云端；不要删除需要保留的本地数据。

## 部署到 Vercel

1. 自行把代码推到 GitHub，再在 Vercel 中导入仓库，Framework 选择 Next.js。
2. 在 Vercel 项目设置中配置 `DATABASE_URL`、需要时配置 `DATABASE_SSL_CA`，以及下文中的 AI 环境变量。
3. 生产与预览环境分别选择变量适用范围。预览环境会使用它所配置的数据库，建议避免连接生产题库。
4. 构建命令使用 `npm run build`，输出目录保持 Next.js 默认；环境变量修改后重新部署。

Vercel 构建不执行建表，数据库需先初始化。所有数据库和 AI 密钥只由服务端读取；`.env`、`.env.*`（除了 `.env.example`）和 `data/` 都已忽略，不能提交到 GitHub。

当前仍是共享单人题库，没有应用登录和接口访问控制。正式公开部署前需添加账户验证，或使用覆盖所有部署和 API 的 Vercel Deployment Protection（可用方式取决于套餐）。表的 RLS 已开启且未开放浏览器访问；服务端 `postgres` 连接具有管理权限，RLS 不能替代应用接口鉴权。

## 配置 AI

在 `.env.local` 中设置以下变量，然后重启应用：

```dotenv
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=你的密钥
AI_MODEL_FAST=gpt-4.1-mini
AI_MODEL_QUALITY=gpt-4.1
AI_DAILY_REQUEST_LIMIT=120
```

`AI_BASE_URL` 可以换成支持 `POST /chat/completions` 的兼容服务地址，模型名应填写该服务实际提供的模型。轻量模型用于分类和薄弱点提取，高质量模型用于答案与追问。密钥只由服务端读取，不会返回到网页。请勿把 `.env.local` 提交到版本库。

未配置 AI 时仍可使用批量导入、关键词分类、题目管理、手动备注和复习功能。生成答案与追问会提示配置 AI。

## 使用方式

1. 点“批量导入题目”，每行输入一道题，单次最多 150 道。系统会去掉相同题目，并把新题放入“待做”。
2. 打开题目，按需生成参考答案。生成结果会保存；编辑或重新生成时会保留历史版本在数据库中。
3. 在“追问讨论”里继续提问。AI 只收到当前题目、当前答案和最近 12 条对话；明确表达的不懂之处会提取为薄弱点备注。
4. 用“还需巩固”或“已掌握”记录复习结果。前者安排 1 天后复习，后者按 3、6、12 天等间隔安排，最长 60 天。

AI 生成内容可能出错，尤其是涉及版本差异的技术题。建议把确认过的答案手动编辑保存。题目文本和对话会发送到你配置的模型服务；应用不会把整个题库一次性发送出去。

## 当前范围

这是单人版本，开发服务器仅监听 `127.0.0.1`。数据已支持 Supabase 持久化，暂未实现 Supabase Auth、多用户数据隔离和自动迁移本地 SQLite 数据。
