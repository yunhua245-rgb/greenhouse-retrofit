// Vercel Serverless Function — AI Summary via NetEase AI Gateway
// Proxies AI calls from frontend to avoid CORS issues

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { textContent, title, description, keywords } = req.body || {};
  if (!textContent) {
    return res.status(400).json({ error: 'textContent is required' });
  }

  // AI API Configuration
  const AI_BASE_URL = 'https://aigw.netease.com/v1';
  const AI_API_KEY = 'xwr0fg2y3yc6b4y3.kjqqwez7e1hqn86mr45ew3vvcvrui0l2';
  const AI_MODEL = 'claude-opus-4-6';

  const contextText = [
    title ? `网页标题: ${title}` : '',
    description ? `网页描述: ${description}` : '',
    keywords ? `关键词: ${keywords}` : '',
    `网页正文摘要:\n${textContent.substring(0, 4000)}`
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `你是一个专业的供应商信息分析助手。用户正在为俄罗斯客户寻找中国的温室自动化改造设备供应商。

你需要根据提供的公司网页内容，生成两段总结，严格按照JSON格式输出：

{
  "notes": "（给采购经理看的备注）",
  "specialty": "（给买家看的产品介绍）"
}

## notes 的要求（给采购经理自己看，管理用）：
- 用中文
- 尽量保留原文信息，整理清楚
- 内容包括：公司全称、成立时间、所在地、主要业务领域、核心产品列表、公司规模/资质（如有）
- 必须真实准确，只基于网页内容，不要编造
- 格式简洁清晰，分条列出

## specialty 的要求（给买家看，展示在供应商评估页面）：
- 用中文
- 围绕"温室自动化改造"这个需求，查找并总结该公司能提供的相关服务和产品
- 总结这个公司在温室/农业自动化方面的优势项
- 不要泄露公司具体名称（用"该供应商"代替）
- 不要泄露联系方式
- 必须基于网页真实内容，不要编造
- 如果该公司与温室/农业自动化无关，如实说明"该供应商主营业务与温室自动化改造无直接关联"
- 控制在150字以内

只输出JSON，不要输出其他内容。`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(AI_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_API_KEY
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请分析以下公司网页内容：\n\n' + contextText }
        ],
        max_tokens: 1000,
        temperature: 0.3
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({
        error: 'AI API request failed',
        status: response.status,
        detail: errText.substring(0, 200)
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from AI response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({
          success: true,
          notes: parsed.notes || '',
          specialty: parsed.specialty || ''
        });
      } catch(e) {
        return res.status(200).json({
          success: true,
          notes: content,
          specialty: ''
        });
      }
    }

    return res.status(200).json({
      success: true,
      notes: content,
      specialty: ''
    });

  } catch (e) {
    return res.status(500).json({
      error: 'AI call failed',
      detail: e.message || String(e)
    });
  }
};
