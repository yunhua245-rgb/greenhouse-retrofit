// Vercel Serverless Function — Extract project requirements from client text via DeepSeek AI
// Input: raw text (email/chat message from client)
// Output: structured project requirements

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const AI_API_KEY = process.env.AI_API_KEY || 'sk-f2a6af8a39d848a5ade70105fb27c208';
  const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat';

  if (!AI_API_KEY) {
    return res.status(500).json({ error: 'AI API key not configured' });
  }

  const systemPrompt = `你是一个专业的跨国采购项目需求分析助手。用户（一位中国采购代理）会粘贴客户发来的消息或邮件内容，你需要从中提取结构化的项目信息。

请严格按照以下JSON格式输出：

{
  "projectName": "项目名称（简洁中文，格式：产品/行业 + 寻源类型，如'温室自动化设备寻源'、'模块化玩具代工厂寻源'）",
  "projectSlug": "项目英文短标识（用于文件名和URL，小写字母+连字符，如'greenhouse'、'modu-toy'、'led-lighting'）",
  "emoji": "代表该项目的emoji（如🌿🧸💡🏭）",
  "themeColor": "建议的主题色hex值（根据行业选择，如农业#148a4e、玩具#e65100、科技#1565c0、工业#455a64）",

  "clientCompany": "客户公司名称（如有）",
  "contactPerson": "联系人姓名+职位（如有）",
  "contactMethod": "联系方式：邮箱/WhatsApp/电话等（如有）",
  "location": "客户所在国家/城市",
  "companyType": "公司类型：生产商/贸易商/终端用户/政府项目（推断）",
  "companyScale": "公司规模（如有线索）",

  "productName": "产品名称/类别（中文）",
  "productUsage": "产品用途/应用场景（中文）",
  "specifications": "详细规格参数（尺寸/材质/功率/型号/标准等）",
  "quantity": "采购数量（首单+年采购量预估）",
  "certifications": "质量/认证要求（CE/ISO/GOST等）",
  "packagingReq": "包装要求（如有提及）",

  "budget": "目标价格/预算范围",
  "currency": "币种（USD/EUR/RUB等）",
  "tradeTerms": "贸易条款偏好（FOB/CIF/DDP/EXW）",
  "paymentTerms": "付款方式偏好",

  "destination": "目的港/收货地址",
  "timeline": "期望交货时间",
  "shippingMethod": "运输方式偏好（海运/空运/铁路）",
  "customsClearance": "是否需要清关协助",

  "supplierType": "供应商类型偏好（工厂直供/贸易商可接受）",
  "supplierRegion": "供应商地区偏好",
  "oemOdm": "OEM/ODM需求（贴牌/定制/现货）",

  "requirements": "核心需求描述（中文，100-200字，概括客户要什么）",
  "sourcingTracks": ["寻源方向1", "寻源方向2", "寻源方向3"],
  "confidence": "提取置信度（high/medium/low）",
  "rawLanguage": "原文语言（如'Russian'、'English'、'Chinese'）"
}

## 规则：
1. 尽可能从原文中提取信息，不要编造。无法确定的字段用空字符串
2. sourcingTracks 最少1个最多5个，代表不同的寻源方向/供应商类别
3. projectSlug 只能包含小写字母和连字符，不超过20字符
4. 如果原文是非中文，所有中文字段必须翻译为中文
5. 价格和数量保留原始数字和单位
6. 贸易条款和付款方式用国际通用缩写

只输出JSON，不要输出其他内容。`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(AI_BASE_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_API_KEY
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请分析以下客户消息，提取项目需求信息：\n\n' + text.substring(0, 5000) }
        ],
        max_tokens: 1500,
        temperature: 0.3
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({ error: 'AI API failed', status: response.status, detail: errText.substring(0, 200) });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, project: parsed });
      } catch(e) {
        return res.status(200).json({ success: false, error: 'AI返回格式异常', raw: content.substring(0, 500) });
      }
    }

    return res.status(200).json({ success: false, error: '无法解析AI结果', raw: content.substring(0, 500) });

  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
};
