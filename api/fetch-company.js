// Vercel Serverless Function — Fetch company website and extract info
// Uses simple heuristics to extract company information from HTML

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
    // Fetch the webpage with timeout via AbortController
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

    // Extract text content (remove scripts, styles, tags)
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

    // Limit text length for processing
    const pageText = text.substring(0, 8000);

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const metaDesc = descMatch ? descMatch[1].trim() : '';

    // Extract meta keywords
    const kwMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i);
    const metaKw = kwMatch ? kwMatch[1].trim() : '';

    // Heuristic extraction
    const result = {
      name: extractCompanyName(pageTitle, pageText),
      location: extractLocation(pageText),
      specialty: extractSpecialty(pageText, metaDesc, metaKw),
      contact: extractContact(html, pageText),
      website: url
    };

    return res.status(200).json({
      success: true,
      data: result,
      raw: {
        title: pageTitle,
        description: metaDesc,
        keywords: metaKw,
        textPreview: pageText.substring(0, 2000)
      }
    });

  } catch (e) {
    return res.status(500).json({
      error: 'Failed to fetch and parse website',
      detail: e.message
    });
  }
};

function extractCompanyName(title, text) {
  // Try from title first
  if (title) {
    // Common patterns: "XX公司 - 官网" or "XX科技有限公司"
    const cleaned = title.replace(/[-_|–—].*?(官网|首页|home|index|welcome).*/i, '').trim();
    const companyMatch = cleaned.match(/([\u4e00-\u9fa5]{2,}(?:集团|公司|科技|农业|设备|机械|有限公司|股份|技术)[\u4e00-\u9fa5]*)/);
    if (companyMatch) return companyMatch[1];
    if (cleaned.length > 2 && cleaned.length < 30) return cleaned;
  }

  // Try from text
  const textMatch = text.match(/([\u4e00-\u9fa5]{2,}(?:智能|自动化|农业|温室|园艺)?[\u4e00-\u9fa5]*(?:科技|设备|机械|集团|技术)(?:有限|股份)?公司)/);
  if (textMatch) return textMatch[1];

  return '';
}

function extractLocation(text) {
  // Look for address patterns
  const addrMatch = text.match(/(?:地址|地点|位于|总部|Address)[：:\s]*([^。，,\n]{5,40})/i);
  if (addrMatch) return addrMatch[1].trim();

  // Look for province/city mentions
  const provinces = ['北京','上海','天津','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','内蒙古','广西','西藏','宁夏','新疆'];
  const cities = ['潍坊','寿光','青岛','济南','杭州','上海','北京','深圳','广州','成都','武汉','南京','苏州','无锡','常州','泰安','聊城','临沂','烟台','威海','淄博','济宁','日照','德州','滨州','东营','菏泽','枣庄','莱芜'];

  for (const city of cities) {
    if (text.includes(city)) {
      // Find the province for this city
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

  // From keywords
  if (keywords) {
    const kws = keywords.split(/[,，;；、]/).map(k => k.trim()).filter(k => k.length > 1 && k.length < 20);
    products.push(...kws.slice(0, 5));
  }

  // From text - look for product-related patterns
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

  // Deduplicate
  const unique = [...new Set(products)].slice(0, 8);
  return unique.join('\n');
}

function extractContact(html, text) {
  const contacts = [];

  // Phone numbers
  const phoneMatches = text.match(/(?:电话|Tel|Phone|联系)[：:\s]*([0-9\-+() ]{7,20})/gi);
  if (phoneMatches) {
    phoneMatches.slice(0, 2).forEach(m => {
      const num = m.replace(/.*[：:\s]/, '').trim();
      if (num.length >= 7) contacts.push(num);
    });
  }

  // Also try standalone phone patterns
  const phonePattern = text.match(/(?:1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})/g);
  if (phonePattern) {
    phonePattern.slice(0, 2).forEach(p => {
      if (!contacts.includes(p)) contacts.push(p);
    });
  }

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (emailMatch) {
    emailMatch.slice(0, 2).forEach(e => {
      if (!contacts.includes(e)) contacts.push(e);
    });
  }

  return contacts.join(' / ');
}

module.exports.config = {
  maxDuration: 20
};
