# Supabase 后端迁移指南

## 你需要在 Supabase 上做的事（10分钟）

### 1. 创建 Supabase 项目
1. 打开 https://app.supabase.com
2. 点 "New project"
3. 选择区域（推荐 Southeast Asia = Singapore）
4. 设置数据库密码（记好）
5. 等2分钟项目创建完成

### 2. 导入数据库 Schema
1. 进入项目 → SQL Editor
2. 复制 `supabase/migration.sql` 全部内容
3. 粘贴到 SQL Editor
4. 点 "Run" 执行

### 3. 配置认证（Magic Link 登录）
1. 进入 Authentication → Settings
2. 确保 "Enable email confirmations" = OFF（不启用邮箱确认）
3. Site URL 设置为你的 Vercel 域名
4. 保存

### 4. 获取 API Keys
1. 进入 Settings → API
2. 复制以下值填到 Vercel 环境变量：

| Vercel 环境变量 | Supabase 中的对应值 |
|----------------|-------------------|
| `SUPABASE_URL` | Project URL（形如 https://xxx.supabase.co）|
| `SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_KEY` | service_role secret key |

### 5. 更新前端配置
编辑 `shared/supabase.js` 中的这两行：
```js
const SUPABASE_URL = 'https://你的项目ID.supabase.co';
const SUPABASE_ANON_KEY = '你的anon key';
```

### 6. 部署
推送到 GitHub → Vercel 自动部署。

---

## 迁移了什么

| 原来 | 现在 |
|------|------|
| `data.json` 存 GitHub | PostgreSQL 6张表 |
| GitHub API 读写 | Supabase 直连 |
| 无认证 | Magic Link 邮箱登录 |
| 管理后台公开 | 需要登录才能操作 |
| JSON 文件单点风险 | 数据库 + RLS 权限控制 |

## 没变的部分
- AI 搜索/抓取/摘要（仍用 Vercel API + DeepSeek）
- 展示页外观、三语翻译
- Quiz 生成逻辑
