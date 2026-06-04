// Vercel Serverless Function — Fetch company website and extract basic info
// AI summary is done client-side to avoid IP restrictions on AI gateway

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
    // Fetch the webpage
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

    // Extract text content
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

    // Heuristic extraction for basic fields
    const contactInfo = extractContact(html, pageText);
    const result = {
      name: extractCompanyName(pageTitle, pageText),
      location: extractLocation(pageText),
      contact: contactInfo.phones,
      email: contactInfo.emails,
      website: url
    };

    return res.status(200).json({
      success: true,
      data: result,
      raw: {
        title: pageTitle,
        description: metaDesc,
        keywords: metaKw,
        textContent: pageText
      }
    });

  } catch (e) {
    return res.status(500).json({
      error: 'Failed to fetch website',
      detail: e.message || String(e),
      code: e.code || ''
    });
  }
};

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
  // Try to find explicit address first
  const addrMatch = text.match(/(?:地址|地点|位于|总部|Address|address)[：:\s]*([^。，,\n]{5,60})/i);
  if (addrMatch) {
    const addr = addrMatch[1].trim();
    // Try to extract province+city from address
    const provCityMatch = addr.match(/([\u4e00-\u9fa5]{2,5}(?:省|自治区|市))([\u4e00-\u9fa5]{2,6}(?:市|区|县))?/);
    if (provCityMatch) {
      const result = '中国' + (provCityMatch[1] || '') + (provCityMatch[2] || '');
      return result;
    }
    return addr;
  }

  // Try country + international patterns
  const intlMatch = text.match(/(?:headquarter|based in|located in|location)[:\s]*([A-Za-z, ]{3,40})/i);
  if (intlMatch) return intlMatch[1].trim();

  const provinces = ['北京','上海','天津','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','内蒙古','广西','西藏','宁夏','新疆'];
  const cities = ['潍坊','寿光','青岛','济南','杭州','上海','北京','深圳','广州','成都','武汉','南京','苏州','无锡','常州','泰安','聊城','临沂','烟台','威海','淄博','济宁','日照','德州','滨州','东营','菏泽','枣庄','莱芜'];
  
  for (const city of cities) {
    if (text.includes(city)) {
      // Look around the city mention for province info
      const idx = text.indexOf(city);
      const context = text.substring(Math.max(0, idx - 30), idx + 30);
      for (const prov of provinces) {
        if (context.includes(prov)) return '中国' + prov + (prov.endsWith('省') ? '' : '省') + city + '市';
      }
      // Search broader for province
      for (const prov of provinces) {
        if (text.includes(prov)) return '中国' + prov + (prov.endsWith('省') || prov.endsWith('市') ? '' : '省') + city + '市';
      }
      return '中国' + city + '市';
    }
  }
  for (const prov of provinces) {
    if (text.includes(prov)) return '中国' + prov;
  }
  return '';
}

function extractContact(html, text) {
  const phones = [];
  const emails = [];

  // Extract phones
  const phoneMatches = text.match(/(?:电话|Tel|Phone|联系)[：:\s]*([0-9\-+() ]{7,20})/gi);
  if (phoneMatches) {
    phoneMatches.slice(0, 3).forEach(m => {
      const num = m.replace(/.*[：:\s]/, '').trim();
      if (num.length >= 7 && !phones.includes(num)) phones.push(num);
    });
  }
  const phonePattern = text.match(/(?:1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})/g);
  if (phonePattern) {
    phonePattern.slice(0, 3).forEach(p => {
      if (!phones.includes(p)) phones.push(p);
    });
  }

  // Extract emails
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (emailMatch) {
    emailMatch.slice(0, 3).forEach(e => {
      if (!emails.includes(e)) emails.push(e);
    });
  }

  return {
    phones: phones.join('\n'),
    emails: emails.join('\n')
  };
}

module.exports.config = {
  maxDuration: 20
};
