// Vercel Serverless Function — Fetch company website + AI summary
// 1. Fetches webpage HTML and extracts text
// 2. Uses heuristics for basic field extraction (name, location, contact)
// 3. Calls AI (OpenAI-compatible API) for intelligent summary:
//    - notes: for admin (company overview, products, factual)
//    - specialty: for buyer (relevant services & advantages, no company name)

const AI_BASE_URL = 'https://aigw.netease.com/v1';
const AI_API_KEY = 'xwr0fg2y3yc6b4y3.kjqqwez7e1hqn86mr45ew3vvcvrui0l2';
const AI_MODEL = 'claude-opus-4-6';

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

  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Step 1: Fetch the webpage
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `Failed to fetch: HTTP ${response.status}` });
    }

    const html = await response.text();

    // Step 2: Extract text content
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const pageText = text.substring(0, 6000);

    // Extract title & meta
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const metaDesc = descMatch ? descMatch[1].trim() : '';
    const kwMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i);
    const metaKw = kwMatch ? kwMatch[1].trim() : '';

    // Step 3: Heuristic extraction for basic fields
    const basicResult = {
      name: extractCompanyName(pageTitle, pageText),
      location: extractLocation(pageText),
      contact: extractContact(html, pageText),
      website: url
    };

    // Step 4: AI summary (parallel: notes for admin + specialty for buyer)
    let aiNotes = '';
    let aiSpecialty = '';
    let aiError = null;

    try {
      const aiResult = await callAISummary(pageText, pageTitle, metaDesc, metaKw, url);
      aiNotes = aiResult.notes || '';
      aiSpecialty = aiResult.specialty || '';
    } catch (e) {
      aiError = e.message || 'AI summary failed';
      // Fallback to heuristic specialty
      aiSpecialty = extractSpecialty(pageText, metaDesc, metaKw);
    }

    return res.status(200).json({
      success: true,
      data: {
        ...basicResult,
        specialty: aiSpecialty,
        notes: aiNotes
      },
      aiUsed: !aiError,
      aiError: aiError,
      raw: {
        title: pageTitle,
        description: metaDesc,
        keywords: metaKw,
        textPreview: pageText.substring(0, 1500)
      }
    });

  } catch (e) {
    return res.status(500).json({
      error: 'Failed to fetch and parse website',
      detail: e.message || String(e),
      code: e.code || '',
      cause: e.cause ? String(e.cause) : ''
    });
  }
};

// AI Summary — calls OpenAI-compatible API
async function callAISummary(pageText, title, desc, keywords, url) {
  const contextText = [
    title ? `网页标题: ${title}` : '',
    desc ? `网页描述: ${desc}` : '',
    keywords ? `关键词: ${keywords}` : '',
    `网页正文摘要:\n${pageText}`
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `你是一个专业的供应商信息分析助手。用户正在为俄罗斯客户寻找中国的温室自动化改造设备供应商。

你需要根据提供的公司网页内容，生成两段总结，严格按照JSON格式输出：

{
  "notes": "（给采购经理看的备注）",
  "specialty": "（给买家看的产品介绍）"
}

## notes 的要求（给我自己看，管理用）：
- 用中文
- 尽量保留原文信息，整理清楚
- 内容包括：公司全称、成立时间、所在地、主要业务领域、核心产品列表、公司规模/资质（如有）
- 必须真实准确，不要编造
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

  const userPrompt = `请分析以下公司网页内容：\n\n${contextText}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.3
    }),
    signal: controller.signal
  });

  clearTimeout(timeout);

  if (!aiRes.ok) {
    const errBody = await aiRes.text().catch(() => '');
    throw new Error(`AI API error: HTTP ${aiRes.status} - ${errBody.substring(0, 200)}`);
  }

  const aiData = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || '';

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        notes: parsed.notes || '',
        specialty: parsed.specialty || ''
      };
    } catch (e) {
      // If JSON parsing fails, try to extract manually
      return { notes: content, specialty: '' };
    }
  }

  return { notes: content, specialty: '' };
}

// Heuristic extraction functions (fallback)
function extractCompanyName(title, text) {
  if (title) {
    const cleaned = title.replace(/[-_|–—].*?(官网|首页|home|index|welcome).*/i, '').trim();
    const companyMatch = cleaned.match(/([\u4e00-\u9fa5]{2,}(?:集团|公司|科技|农业|设备|机械|有限公司|股份|技术)[\u4e00-\u9fa5]*)/);
    if (companyMatch) return companyMatch[1];
    if (cleaned.length > 2 && cleaned.length < 30) return cleaned;
  }
  const textMatch = text.match(/([\u4e00-\u9fa5]{2,}(?:智能|自动化|农业|温室|园艺)?[\u4e00-\u9fa5]*(?:科技|设备|机械|集团|技术)(?:有限|股份)?公司)/);
  if (textMatch) return textMatch[1];
  return '';
}

function extractLocation(text) {
  const addrMatch = text.match(/(?:地址|地点|位于|总部|Address)[：:\s]*([^。，,\n]{5,40})/i);
  if (addrMatch) return addrMatch[1].trim();
  const provinces = ['北京','上海','天津','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','内蒙古','广西','西藏','宁夏','新疆'];
  const cities = ['潍坊','寿光','青岛','济南','杭州','上海','北京','深圳','广州','成都','武汉','南京','苏州','无锡','常州','泰安','聊城','临沂','烟台','威海','淄博','济宁','日照','德州','滨州','东营','菏泽','枣庄','莱芜'];
  for (const city of cities) {
    if (text.includes(city)) {
      const context = text.substring(Math.max(0, text.indexOf(city) - 20), text.indexOf(city) + 20);
      for (const prov of provinces) {
        if (context.includes(prov)) return prov + city;
      }
      return city;
    }
  }
  for (const prov of provinces) {
    if (text.includes(prov)) return prov;
  }
  return '';
}

function extractSpecialty(text, desc, keywords) {
  const products = [];
  if (keywords) {
    const kws = keywords.split(/[,，;；、]/).map(k => k.trim()).filter(k => k.length > 1 && k.length < 20);
    products.push(...kws.slice(0, 5));
  }
  const productPatterns = [
    /(?:主营|主要产品|产品|业务)[：:\s]*([\s\S]{5,100}?)(?:[。\n])/,
    /(?:专业|专注)[从于]*([\s\S]{5,80}?)(?:[。，,\n])/,
    /(?:提供|生产|制造|研发)([\s\S]{5,80}?)(?:等|[。\n])/
  ];
  for (const pat of productPatterns) {
    const m = text.match(pat);
    if (m) {
      const items = m[1].split(/[,，、;；]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 30);
      products.push(...items.slice(0, 5));
      break;
    }
  }
  const unique = [...new Set(products)].slice(0, 8);
  return unique.join('\n');
}

function extractContact(html, text) {
  const contacts = [];
  const phoneMatches = text.match(/(?:电话|Tel|Phone|联系)[：:\s]*([0-9\-+() ]{7,20})/gi);
  if (phoneMatches) {
    phoneMatches.slice(0, 2).forEach(m => {
      const num = m.replace(/.*[：:\s]/, '').trim();
      if (num.length >= 7) contacts.push(num);
    });
  }
  const phonePattern = text.match(/(?:1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})/g);
  if (phonePattern) {
    phonePattern.slice(0, 2).forEach(p => {
      if (!contacts.includes(p)) contacts.push(p);
    });
  }
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (emailMatch) {
    emailMatch.slice(0, 2).forEach(e => {
      if (!contacts.includes(e)) contacts.push(e);
    });
  }
  return contacts.join(' / ');
}

module.exports.config = {
  maxDuration: 30
};
