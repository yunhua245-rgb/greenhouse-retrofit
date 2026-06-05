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
1. 输出2-5组关键词，每组格式为"产品名 特点"，组之间用空格分隔
2. 产品名：客户要采购的核心产品/设备大类（2-4个字）
3. 特点：该产品最核心的特征、用途、或客户特殊需求（2-4个字）
4. "产品名+特点"组合起来要能精准定位到目标供应商
5. 从客户描述中提取核心需求，而不是简单翻译字段值
6. 只输出关键词本身，不要任何解释

例如：
- 温室自动化改造项目 → "温室 自动化 温室 通风 温室 灌溉"
- 注塑玩具代工项目 → "注塑 玩具 模具 丹麦 代工 小批量"
- LED植物灯采购 → "补光灯 温室 植物灯 LED"`;

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
