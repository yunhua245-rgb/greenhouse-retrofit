# 供应商寻源平台 — 模块化架构规范

> 适用于所有项目（温室 / MODU / 未来新项目）的复用基础。

---

## 一、分层结构

```
┌─ portal.html ─────────────── 项目总览入口 + 协调人名片统一管理
│
├─ {project}-index.html ────── 展示页（客户看） → 由通用模块 + 扩展模块组成
├─ {project}-admin.html ────── 管理后台（内部） → 由通用模块 + 扩展模块组成
│
├─ api/
│   ├─ {project}-data.js ──── 项目数据 CRUD（统一接口规范）
│   ├─ fetch-company.js ───── AI 抓取引擎（共享）
│   ├─ ai-summary.js ─────── AI 摘要提取（共享）
│   ├─ generate-questions.js ─ Quiz 问题生成（扩展模块）
│   └─ save-quiz-answer.js ── Quiz 答案保存（扩展模块）
│
└─ client-edit.html ─────────── 客户自助编辑页（扩展模块）
```

---

## 二、展示页 — 模块清单

### 通用模块（所有项目必须）

| # | 模块 | 功能 | 配置项 |
|---|------|------|--------|
| 1 | **Hero 横幅** | 项目标题 + 副标题 + 状态 badge | `heroGradient`, `projectName`, `badgeText` |
| 2 | **语言切换** | 右上角语言按钮 | `langs: ['zh','en','ru']`, `defaultLang` |
| 3 | **项目状态卡片** | 关键指标一栏展示 | `statusCards: [{label, valueKey, color}]` |
| 4 | **核心需求描述** | 高亮客户需求/背景 | `reqText` (i18n) |
| 5 | **项目信息网格** | 2列网格，key-value | `infoFields: [{key, label, slot}]` |
| 6 | **供应商进展** | 统计条 + 展示区（卡片 or 分栏） | `supplierLayout: 'cards'|'columns'`, `columns: [{id,label,icon,color}]` |
| 7 | **协调人名片** | 头像/姓名/联系/角色说明 | 从 `coordinatorProfile` API 加载 |
| 8 | **底部更新栏** | 最近更新时间 | 自动生成 |

### 扩展模块（按需激活）

| 模块 | 功能 | 典型项目 |
|------|------|----------|
| **寻源方向面板** | 多条 track 的彩色卡片 | MODU（3条）|
| **智能问卷 Quiz** | 单问题模式 + freeform 输入 | 温室 |
| **实施阶段时间线** | 横向进度条 / 里程碑卡片 | 温室 |
| **客户编辑入口** | 跳转 client-edit.html | 温室 |
| **自动翻译** | 用户输入内容实时翻译 | 温室 |
| **甘特图** | 多方向并行进度 | 未来项目 |
| **风险/问题追踪** | 风险列表 | 未来项目 |
| **项目动态日志** | 时间倒序事件流 | 未来项目 |

---

## 三、管理后台 — 模块清单

### 通用模块（所有项目必须）

| # | 模块 | 功能 |
|---|------|------|
| 1 | **Header** | 标题 + 返回 portal 链接 |
| 2 | **统计栏** | 供应商总数 / 各状态数量 |
| 3 | **供应商列表** | 卡片/行展示 + 展开详情 |
| 4 | **新增/编辑表单** | 统一字段集（见下方 Schema） |
| 5 | **AI 抓取** | URL 输入 + 自动补 https + 调用 fetch-company + ai-summary |
| 6 | **数据云端同步** | GitHub JSON 存储 + SHA 校验 |

### 扩展模块（按需激活）

| 模块 | 功能 | 典型项目 |
|------|------|----------|
| **Track 筛选** | 供应商按 track 分类展示/筛选 | MODU |
| **实施阶段管理** | 增/改/删项目阶段 | 温室 |
| **对接记录/日志** | 每条供应商的沟通日志 | 温室 |
| **客户编辑历史** | 查看客户修改记录 | 温室 |
| **数据导出** | JSON/CSV 下载 | MODU |

---

## 四、数据 Schema 规范

### 统一供应商字段

```json
{
  "id": "uuid",
  "name": "中文名",
  "nameEn": "English Name",
  "website": "https://...",
  "location": "城市",
  "contact": "联系人",
  "phone": "电话",
  "email": "邮箱",
  "specialty": "主营业务",
  "status": "new|pending|contacting|quoted|shortlisted|selected|rejected",
  "track": "A|B|C|...",       // 可选，多方向项目使用
  "notes": "备注",
  "addedAt": "ISO date"
}
```

### 统一项目数据结构

```json
{
  "suppliers": [...],
  "projectInfo": { ... },       // 展示页信息网格数据
  "coordinatorProfile": { ... }, // 从 portal.html 统一管理
  "phases": [...],              // 扩展：实施阶段
  "editHistory": [...]          // 扩展：客户编辑历史
}
```

### API 接口规范

```
GET  /api/{project}-data     → 返回完整项目数据
POST /api/{project}-data     → 局部更新
  body: { action: 'addSupplier' | 'updateSupplier' | 'deleteSupplier' | 'updateProfile' | ... }
```

---

## 五、CSS 设计系统 — 统一换色

两个项目 **70%+ 的 CSS 结构相同**，差异仅为主色。规范：

```css
/* 项目主题色变量 — 新建项目只需改这里 */
:root {
  --primary: #148a4e;        /* 温室=绿, MODU=橙#e65100 */
  --primary-light: #e8f5ee;  /* 温室=浅绿, MODU=#fff3e0 */
  --primary-dark: #0a6e3a;   /* 温室=深绿, MODU=#bf360c */
  --hero-gradient: linear-gradient(135deg, #0a3d1f, #148a4e);
}
```

**共享 CSS 类**（不变的结构）：
- `.section`, `.section-header`, `.section-icon`, `.section-title`
- `.status-strip`, `.st-card`, `.st-label`, `.st-value`
- `.info-grid`, `.info-item`, `.info-label`, `.info-value`
- `.eval-summary`, `.eval-stat`
- `.badge`, `.badge-green`, `.badge-amber`, `.badge-blue`
- `.coordinator-card`, `.contact-chip`
- `.role-grid`, `.role-item`
- `.update-bar`

---

## 六、i18n 引擎规范

所有页面使用相同机制：

```js
// 1. HTML 标记
<div data-i18n="key">默认文本</div>

// 2. 字典对象
const i18n = { zh: {...}, en: {...}, ru: {...} };

// 3. 切换函数（通用）
function switchLang(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[lang][key]) el.textContent = i18n[lang][key];
  });
  // ... refresh dynamic content
}
```

---

## 七、新建项目 Checklist

创建新项目时，按此步骤：

1. **创建数据文件** `api/{project}-data.js` — 复制模板，改数据文件名
2. **创建展示页** `{project}-index.html` — 从模板复制，配置：
   - 主题色（改 CSS 变量）
   - 启用哪些模块
   - i18n 字典内容
   - 项目信息字段定义
3. **创建管理后台** `{project}-admin.html` — 从模板复制，配置：
   - 表单字段（是否有 track）
   - 启用哪些扩展模块
4. **注册到 portal.html** — 添加项目卡片 + 链接
5. **部署** — push 即自动部署

---

## 八、当前状态对比

| 功能 | 温室 ✅ | MODU ✅ | 差异说明 |
|------|---------|---------|----------|
| Hero + 语言切换 | ✅ | ✅ | 颜色不同 |
| 项目状态卡 | ✅ | ✅ | 字段不同 |
| 核心需求 | ✅ | ✅ | — |
| 项目信息网格 | ✅ 动态 | ✅ 静态 | MODU 待改为动态 |
| 寻源方向面板 | ❌ | ✅ | MODU 独有 |
| 供应商进展 | ✅ 卡片 | ✅ 三栏 | 布局方式不同 |
| 协调人名片 | ✅ | ✅ | 统一来源 |
| Quiz | ✅ | ❌ | 温室独有 |
| 实施阶段 | ✅ | ❌ | 温室独有 |
| 客户编辑入口 | ✅ | ❌ | 温室独有 |
| 底部更新栏 | ✅ | ✅ | — |
| Admin 供应商 CRUD | ✅ | ✅ | — |
| Admin AI 抓取 | ✅ | ✅ | 共享同一引擎 |
| Admin Track 筛选 | ❌ | ✅ | MODU 独有 |
| Admin 实施阶段管理 | ✅ | ❌ | 温室独有 |
| Admin 对接日志 | ✅ | ❌ | 温室独有 |

---

## 九、后续优化方向

- [ ] 抽取公共 CSS 为 `shared.css`，各项目只 import + 覆盖变量
- [ ] 抽取 `i18n-engine.js` 为独立模块
- [ ] 抽取 `renderCoordinator()` 为独立组件
- [ ] 统一 API handler 为一个通用文件 + 项目配置 map
- [ ] 建立项目模板文件 `template-index.html` / `template-admin.html`
