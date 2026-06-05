export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectInfo } = req.body;
  if (!projectInfo) {
    return res.status(400).json({ error: 'Missing projectInfo' });
  }

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_KEY) {
    return res.status(500).json({ error: 'No API key' });
  }

  // Build context from all available project info
  const infoStr = Object.entries(projectInfo)
    .filter(([k, v]) => v && v.trim && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `你是一个供应商寻源专家。根据以下客户项目信息，生成最适合在中国B2B平台（1688、阿里巴巴国际站、中国制造网）上搜索供应商的中文关键词。

客户项目信息：
${infoStr}

要求：
1. 输出6-10个中文搜索关键词，用空格分隔，供用户挑选
2. 关键词分为两种格式混合输出：
   - 短对格式："产品名 特点"（如"温室 自动化"、"注塑 代工"）
   - 长复合词格式：完整产品名称（如"温室自动控制系统"、"LED植物生长灯"）
3. 两种格式都要有，覆盖面要广，便于用户筛选不同精度供应商
4. 关键词要精准对应客户需要采购的产品/设备/服务
5. 使用中国供应商常用的产品名称（不要翻译腔）
6. 从客户描述中提取核心需求，而不是简单翻译字段值
7. 只输出关键词本身，不要任何解释或编号

例如：
- 温室自动化改造项目 → "温室 自动化 温室自动控制系统 温室 通风 温室通风设备 温室 灌溉 智能温室 连栋温室改造 农业物联网"
- 注塑玩具代工项目 → "注塑 玩具 注塑加工厂 模具 丹麦 玩具注塑代工 小批量 代工 塑料模具 精密注塑"`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3
      })
    });

    const data = await response.json();
    const keywords = data.choices?.[0]?.message?.content?.trim();

    if (keywords) {
      return res.status(200).json({ success: true, keywords });
    } else {
      return res.status(200).json({ success: false, error: 'No AI response' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
