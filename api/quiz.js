// Vercel Serverless Function — Quiz (merged: generate-questions + save-quiz-answer)
// Dispatch by body.action: "generate" | "save-answer"

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabaseHeaders = () => ({
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
  const action = body.action || 'generate'; // default for backward compat

  if (action === 'save-answer') {
    return handleSaveAnswer(body, res);
  }
  // Default: generate questions
  return handleGenerateQuestions(body, res);
};

// ======================== Generate Questions ========================
async function handleGenerateQuestions(body, res) {
  const { missingSlots, existingInfo, lang } = body;
  if (!missingSlots || missingSlots.length === 0) {
    return res.status(400).json({ error: 'No missing slots provided' });
  }

  const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com';
  const AI_API_KEY = process.env.AI_API_KEY || 'sk-f2a6af8a39d848a5ade70105fb27c208';
  const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat';

  const slotDescriptions = {
    clientCompany: { zh: '公司名称', en: 'Company name', ru: 'Название компании' },
    contactPerson: { zh: '联系人', en: 'Contact person', ru: 'Контактное лицо' },
    contactMethod: { zh: '联系方式', en: 'Contact method', ru: 'Способ связи' },
    location: { zh: '所在国家/城市', en: 'Country/City', ru: 'Страна/Город' },
    companyType: { zh: '公司类型', en: 'Company type', ru: 'Тип компании' },
    companyScale: { zh: '公司规模', en: 'Company scale', ru: 'Масштаб компании' },
    productName: { zh: '产品名称/类别', en: 'Product name', ru: 'Название продукта' },
    productUsage: { zh: '用途/应用场景', en: 'Usage/Application', ru: 'Назначение' },
    specifications: { zh: '规格参数', en: 'Specifications', ru: 'Характеристики' },
    quantity: { zh: '采购数量', en: 'Quantity', ru: 'Количество' },
    certifications: { zh: '认证要求', en: 'Certifications', ru: 'Сертификация' },
    sampleDrawing: { zh: '样品/图纸', en: 'Samples/Drawings', ru: 'Образцы/Чертежи' },
    packagingReq: { zh: '包装要求', en: 'Packaging requirements', ru: 'Требования к упаковке' },
    budget: { zh: '目标价格/预算', en: 'Target price/Budget', ru: 'Бюджет' },
    currency: { zh: '币种', en: 'Currency', ru: 'Валюта' },
    tradeTerms: { zh: '贸易条款', en: 'Trade terms', ru: 'Условия торговли' },
    paymentTerms: { zh: '付款方式', en: 'Payment terms', ru: 'Условия оплаты' },
    destination: { zh: '目的港/收货地', en: 'Destination port', ru: 'Порт назначения' },
    timeline: { zh: '期望交期', en: 'Expected timeline', ru: 'Сроки' },
    shippingMethod: { zh: '运输方式', en: 'Shipping method', ru: 'Способ доставки' },
    customsClearance: { zh: '清关协助', en: 'Customs clearance', ru: 'Таможенное оформление' },
    supplierType: { zh: '供应商类型', en: 'Supplier type', ru: 'Тип поставщика' },
    supplierRegion: { zh: '地区偏好', en: 'Preferred region', ru: 'Предпочтительный регион' },
    factoryAudit: { zh: '验厂需求', en: 'Factory audit', ru: 'Аудит фабрики' },
    sampleNeeded: { zh: '打样需求', en: 'Sample needed', ru: 'Образцы нужны' },
    oemOdm: { zh: 'OEM/ODM模式', en: 'OEM/ODM mode', ru: 'OEM/ODM режим' },
    warranty: { zh: '质保要求', en: 'Warranty', ru: 'Гарантия' },
    afterSales: { zh: '售后支持', en: 'After-sales support', ru: 'Послепродажное обслуживание' },
    cooperationIntent: { zh: '合作意向', en: 'Cooperation intent', ru: 'Намерения о сотрудничестве' },
    area: { zh: '温室面积', en: 'Greenhouse area', ru: 'Площадь теплицы' },
    structureType: { zh: '温室结构类型', en: 'Greenhouse structure type', ru: 'Тип конструкции' },
    infrastructure: { zh: '现有基础设施', en: 'Existing infrastructure', ru: 'Существующая инфраструктура' },
    crops: { zh: '种植作物', en: 'Current crops', ru: 'Выращиваемые культуры' },
    scope: { zh: '需要自动化的系统', en: 'Systems to automate', ru: 'Системы для автоматизации' },
  };

  const langName = { en: 'English', ru: 'Russian', zh: 'Chinese' }[lang] || 'English';

  let contextStr = '';
  if (existingInfo && Object.keys(existingInfo).length > 0) {
    contextStr = '\n\nAlready known project info:\n' + Object.entries(existingInfo)
      .filter(([k, v]) => v)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
  }

  const slotsToAsk = missingSlots.slice(0, 3);

  const systemPrompt = `You are helping a greenhouse owner provide project information for an automation retrofit. 
Generate multiple-choice questions to collect missing information.

Rules:
- Output STRICTLY valid JSON array, nothing else
- Each question object: {"slot": "slotKey", "question": "...", "options": ["A", "B", "C", "D"]}
- Questions should be in ${langName}
- Options should be realistic, practical choices for a greenhouse project
- 4 options per question
- Options should be concise (under 30 chars each)
- Make questions conversational and friendly
- Consider the context of an existing greenhouse being retrofitted with automation${contextStr}`;

  const userMsg = `Generate questions for these missing fields:\n${slotsToAsk.map(s => `- ${s} (${(slotDescriptions[s] || {})[lang] || s})`).join('\n')}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

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
          { role: 'user', content: userMsg }
        ],
        max_tokens: 800,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({ error: 'AI request failed', status: response.status, detail: errText.substring(0, 200) });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const questions = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, questions });
      } catch(e) {
        return res.status(200).json({ success: false, error: 'Failed to parse AI response', raw: content });
      }
    }

    return res.status(200).json({ success: false, error: 'No valid JSON in response', raw: content });

  } catch (e) {
    return res.status(500).json({ error: 'AI call failed', detail: e.message || String(e) });
  }
}

// ======================== Save Quiz Answer ========================
async function handleSaveAnswer(body, res) {
  const { slot, value, dataFile } = body;
  const slug = (dataFile && dataFile.includes('modu')) ? 'modu' : 'greenhouse';

  if (!slot || !value) {
    return res.status(400).json({ error: 'slot and value are required' });
  }

  const allowedSlots = [
    'clientCompany', 'contactPerson', 'contactMethod', 'location', 'companyType', 'companyScale',
    'productName', 'productUsage', 'specifications', 'quantity', 'certifications', 'sampleDrawing', 'packagingReq',
    'budget', 'currency', 'tradeTerms', 'paymentTerms',
    'destination', 'timeline', 'shippingMethod', 'customsClearance',
    'supplierType', 'supplierRegion', 'factoryAudit', 'sampleNeeded', 'oemOdm',
    'warranty', 'afterSales', 'cooperationIntent', 'freeformNote',
    'area', 'structureType', 'infrastructure', 'crops', 'scope'
  ];
  if (!allowedSlots.includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot: ' + slot });
  }

  try {
    const project = await fetch(`${SUPABASE_URL}/rest/v1/projects?slug=eq.${slug}&limit=1`, {
      headers: supabaseHeaders()
    }).then(r => r.json());
    const projectId = project?.[0]?.id;
    if (!projectId) return res.status(500).json({ error: 'Project not found: ' + slug });

    await fetch(`${SUPABASE_URL}/rest/v1/quiz_history`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ project_id: projectId, slot, value, created_at: new Date().toISOString() })
    });

    await fetch(`${SUPABASE_URL}/rest/v1/project_info`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ project_id: projectId, key: slot, value, updated_at: new Date().toISOString() })
    });

    return res.status(200).json({ success: true, slot, value });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
}

module.exports.config = { maxDuration: 30 };
