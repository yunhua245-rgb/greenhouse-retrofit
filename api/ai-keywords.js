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
1. 输出2-5个最核心的中文搜索关键词，用空格分隔
2. 关键词要精准对应客户需要采购的产品/设备/服务
3. 使用中国供应商常用的产品名称（不要翻译腔）
4. 从客户描述中提取核心需求，而不是简单翻译字段值
5. 只输出关键词本身，不要任何解释

例如：
- 如果客户需要温室自动化改造 → "温室自动控制系统 温室通风设备 温室灌溉系统"
- 如果客户需要LED补光 → "温室LED补光灯 植物生长灯 大棚补光"`;

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
