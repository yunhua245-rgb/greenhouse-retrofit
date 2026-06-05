// Vercel Serverless — Search for a company's official website using AI
// Given a company name, returns the most likely official website URL

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyName } = req.body || {};
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ error: '请提供公司名称' });
  }

  const apiKey = process.env.AI_API_KEY || 'sk-f2a6af8a39d848a5ade70105fb27c208';
  const apiBase = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'deepseek-chat';

  try {
    const prompt = `请帮我查找以下公司的官方网站。

公司名称：${companyName}

要求：
1. 返回该公司的官方独立域名网站URL（不是1688/阿里巴巴/天猫等平台店铺）
2. 如果公司有 .com 和 .cn 两个域名，优先返回 .cn（中文站）
3. 如果完全找不到，返回空字符串
4. 只返回你确定的URL，不要猜测或编造

返回纯JSON格式，不加其他文字：
{"website": "https://www.example.com", "confidence": "high/medium/low"}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!response.ok) {
      return res.status(200).json({ website: '', error: 'AI request failed' });
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({ website: '' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json({
      website: result.website || '',
      confidence: result.confidence || 'low'
    });

  } catch (e) {
    return res.status(200).json({ website: '', error: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
