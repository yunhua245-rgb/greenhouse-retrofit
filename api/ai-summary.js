// Vercel Serverless Function — AI Summary via DeepSeek API
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

  const { textContent, title, description, keywords, url } = req.body || {};
  if (!textContent) {
    return res.status(400).json({ error: 'textContent is required' });
  }

  // AI API Configuration — DeepSeek Official API
  // Register at platform.deepseek.com to get $5 free credit
  const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com';
  const AI_API_KEY = process.env.AI_API_KEY || 'sk-f2a6af8a39d848a5ade70105fb27c208';
  const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat';

  if (!AI_API_KEY) {
    return res.status(500).json({
      error: 'AI API key not configured',
      detail: 'Please provide DeepSeek API key'
    });
  }

  const contextText = [
    url ? `公司网址: ${url}` : '',
    title ? `网页标题: ${title}` : '',
    description ? `网页描述: ${description}` : '',
    keywords ? `关键词: ${keywords}` : '',
    `网页正文摘要:\n${textContent.substring(0, 4000)}`
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `你是一个专业的供应商信息分析助手。用户正在为俄罗斯客户寻找中国的温室自动化改造设备供应商。

你需要根据提供的公司网页内容，生成总结信息，严格按照JSON格式输出：

{
  "nameEn": "（公司英文名称）",
  "nameCn": "（公司中文名称）",
  "location": "（公司所在地，格式：国家+省/州+城市，如'中国山东省潍坊市'或'Netherlands, South Holland, Westland'）",
  "phones": "（电话号码，多个用换行\\n分隔）",
  "emails": "（邮箱地址，多个用换行\\n分隔）",
  "notes": "（给采购经理看的备注）",
  "specialty": "（给买家看的产品介绍）"
}

## nameEn 和 nameCn 的要求：
- nameEn：公司英文名称或英文品牌名，如"XAG"、"Dayu Irrigation"、"Netafim"
  - 如果公司有明确英文品牌名，用品牌名（如XAG而不是"Guangzhou Xag Co., Ltd."）
  - 如果没有英文品牌名但有英文全称，用英文全称
  - 如果完全没有英文信息，将中文名做合理的英文翻译
- nameCn：公司中文全称，如"广州极飞科技股份有限公司"、"大禹节水集团股份有限公司"
  - 重要：即使网页内容是英文版，如果你能从品牌名/域名确认这是一家中国公司，请用你的知识补充正确的中文全称
  - 如果是非中国公司或确实无法确认中文名，用英文名填入nameCn（保持跟nameEn一致）
  - 不要编造不确定的中文名

## location 的要求：
- 尽量精确到：国家 + 省/州 + 城市
- 中国公司用中文（如"中国山东省潍坊市"、"中国广东省深圳市"）
- 非中国公司用英文（如"Netherlands, South Holland, Westland"）
- 如果网页是英文版但你能确认这是中国公司，请根据你的知识补充公司总部所在地
- 如果确实无法确认地址信息，输出空字符串 ""

## notes 的要求（给采购经理自己看，管理用）：
- 用中文
- 尽量保留原文信息，整理清楚
- 内容包括：公司全称、成立时间、所在地（精确到省市）、主要业务领域、核心产品列表、公司规模/资质（如有）
- 必须真实准确，只基于网页内容，不要编造
- 格式简洁清晰，分条列出

## specialty 的要求（给买家看，展示在供应商评估页面）：
- 用中文
- 围绕"温室自动化改造"这个需求，查找并总结该公司能提供的相关服务和产品
- 总结这个公司在温室/农业自动化方面的优势项
- **严禁泄露公司具体名称**（用"该供应商"代替）
- **严禁泄露联系方式**
- **严禁泄露具体产品型号、系列编号**（如"ABC-3000"、"XY Pro Max"等）——买家可以用型号反搜到公司。只描述产品类别和功能特点，不写型号
- 必须基于网页真实内容，不要编造
- 如果该公司与温室/农业自动化无关，如实说明"该供应商主营业务与温室自动化改造无直接关联"
- 控制在150字以内

## phones 的要求：
- 提取网页中出现的所有电话号码（座机、手机、400热线等）
- 多个号码用换行符 \\n 分隔
- 保留原始格式（如 400-780-3131、020-39218499、17558864609）
- 重要：如果网页内容是英文版（可能是境外服务器访问导致），但你能从公司名称/品牌名/域名确认这是一家中国公司，请根据你的知识补充该公司的中国区官方客服电话（如400热线、总机等）
- 如果确实无法确认任何电话号码，输出空字符串 ""

## emails 的要求：
- 提取网页中出现的所有邮箱地址
- 多个邮箱用换行符 \\n 分隔
- 重要：如果网页是英文版但你能确认公司身份，可以根据域名推断常见的业务邮箱格式（如 info@域名、sales@域名、contact@域名），但需要用你确信的官方邮箱
- 如果确实无法确认任何邮箱，输出空字符串 ""

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
          nameEn: parsed.nameEn || '',
          nameCn: parsed.nameCn || '',
          location: parsed.location || '',
          phones: parsed.phones || '',
          emails: parsed.emails || '',
          notes: parsed.notes || '',
          specialty: parsed.specialty || ''
        });
      } catch(e) {
        return res.status(200).json({
          success: true,
          nameEn: '',
          nameCn: '',
          location: '',
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
