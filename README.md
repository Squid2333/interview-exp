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

建表脚本可重复执行，不会清空已有数据。此前执行过旧版建表 SQL 的项目也需执行一次，以补充 `sequence_id` 排序字段、`is_favorite` 收藏字段和分类表。随后打开 <http://127.0.0.1:3000>。

题库保存在 Supabase 中，备份应使用 PostgreSQL 导出或 Supabase 的备份功能。原来的 `data/interview.db` 会保留，但不会自动迁移到云端；不要删除需要保留的本地数据。

## 部署到 Vercel

1. 自行把代码推到 GitHub，再在 Vercel 中导入仓库，Framework 选择 Next.js。
2. 在 Vercel 项目设置中配置 `DATABASE_URL`、下文的 3 个登录环境变量、需要时配置 `DATABASE_SSL_CA`，以及 AI 环境变量。
3. 生产与预览环境分别选择变量适用范围。预览环境会使用它所配置的数据库，建议避免连接生产题库。
4. 构建命令使用 `npm run build`，输出目录保持 Next.js 默认；环境变量修改后重新部署。

Vercel 构建不执行建表，数据库需先初始化。所有数据库和 AI 密钥只由服务端读取；`.env`、`.env.*`（除了 `.env.example`）和 `data/` 都已忽略，不能提交到 GitHub。

## 配置登录

应用使用 Supabase Auth 邮箱密码登录，页面和每个题库 / AI 接口均检查身份。未登录返回 `401`，已登录但非指定账号返回 `403`；配置缺失时不会开放题库。会话由 HttpOnly Cookie 保存，服务端校验用户，自动刷新过期会话。

1. 在 Supabase **Authentication → Users → Add user → Create new user** 创建你的邮箱账号，设置密码并勾选 **Auto Confirm**。登录密码与数据库密码是两回事。
2. 确保 **Authentication → Sign In / Providers → Email** 已开启。关闭允许新用户注册的选项；项目不提供注册入口。
3. 在 **Settings → API Keys** 复制 **Publishable key**（旧版 `anon` key 也支持），项目 URL 可从 Connect / API 页面获取。不要使用 `secret` 或 `service_role` key。
4. 在本地 `.env` 或 `.env.local` 中填写，并在 Vercel 同样配置：

```dotenv
SUPABASE_URL=https://你的项目编号.supabase.co
SUPABASE_PUBLISHABLE_KEY=你的PublishableKey
APP_OWNER_EMAIL=1767257028@qq.com
```

修改后重启应用 / 重新部署。打开首页会进入登录页，使用上面创建的邮箱和密码登录；右上角可退出。配置邮箱必须是你控制的且已确认的账号。当前采用密码登录，不需要 OAuth 回调地址，也不提供邮件重置；忘记密码时可在 Supabase 管理台重设。

这是共享单人题库，指定账号可访问已有全部数据，暂不支持多用户。表的 RLS 已开启且未开放浏览器访问；服务端 `postgres` 连接具有管理权限，接口鉴权负责限制访问。

### 验证登录

登录集成测试使用本地模拟认证服务和虚拟账号，不需要真实密码：

```bash
npx playwright install chromium
npm run build
npm run test:auth
```

也可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定本机 Chrome 的可执行文件路径。测试覆盖接口访问限制、登录失败重试、会话 Cookie、会话刷新和退出，并生成桌面与手机截图到 `/tmp/interview-auth/`。

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

1. 点“批量导入题目”，每行输入一道题，单次最多 150 道。系统会去掉相同题目，并把新题放入“待掌握”。原来的“待做”和“学习中”统一归入待掌握，已有数据无需迁移。
2. 打开题目，按需生成参考答案。生成、编辑答案或追问后题目仍留在待掌握，确认掌握后再移出。生成结果会保存；编辑或重新生成时会保留历史版本在数据库中。列表标题旁的图标可收起或展开题目列表。
3. 在“追问讨论”里继续提问。AI 只收到当前题目、当前答案和最近 12 条对话；明确表达的不懂之处会提取为薄弱点备注。
4. 用“还需巩固”或“已掌握”记录复习结果。前者安排 1 天后复习，后者按 3、6、12 天等间隔安排，最长 60 天。
5. 点题目详情右上角的星标收藏或取消收藏，在左侧“我的收藏”集中查看。收藏保存在 Supabase 中，与学习状态、复习日期相互独立，收藏操作不会改变题目排序。

知识分类初始包含 Java、Spring、数据库、Redis、计算机网络、操作系统、算法、前端、系统设计和其他。点侧栏“知识分类”旁的设置按钮可新增、重命名、删除分类；手机和平板先点顶部菜单按钮打开侧栏，也可以直接点题目列表旁的分类设置按钮。改名会同步更新该分类下的题目；删除后题目转到“其他”，答案、笔记和学习状态保留。“其他”不能改名或删除。AI 批量导入时从当前分类中选择并生成标签；没有配置 AI 时使用关键词分类，题目中直接出现自定义分类名时也会识别。分类保存在 Supabase，重新执行建表脚本不会恢复已删除的初始分类。

AI 生成内容可能出错，尤其是涉及版本差异的技术题。建议把确认过的答案手动编辑保存。题目文本和对话会发送到你配置的模型服务；应用不会把整个题库一次性发送出去。

## 当前范围

这是单人版本，开发服务器仅监听 `127.0.0.1`。已支持 Supabase 数据持久化和指定账号登录，暂未实现多用户数据隔离和自动迁移本地 SQLite 数据。
