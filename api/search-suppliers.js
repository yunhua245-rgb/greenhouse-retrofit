// Vercel Serverless — Search suppliers from web search + B2B platforms
// Primary: web search (Bing/Baidu) | Secondary: 1688/Alibaba/MIC | Fallback: AI

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { keywords, platforms } = req.body || {};
  if (!keywords || !keywords.trim()) {
    return res.status(400).json({ error: '请提供搜索关键词' });
  }

  const enabledPlatforms = platforms || ['web', '1688', 'alibaba', 'madeinchina'];
  const searchKeywords = keywords.trim();

  try {
    // Parallel search: web search + platform scrapes (8s timeout each)
    const searchTasks = [];
    const searchNames = [];
    
    if (enabledPlatforms.includes('web')) {
      searchTasks.push(searchWeb(searchKeywords));
      searchNames.push('web');
    }
    if (enabledPlatforms.includes('1688')) {
      searchTasks.push(search1688(searchKeywords));
      searchNames.push('1688');
    }
    if (enabledPlatforms.includes('alibaba')) {
      searchTasks.push(searchAlibaba(searchKeywords));
      searchNames.push('alibaba');
    }
    if (enabledPlatforms.includes('madeinchina')) {
      searchTasks.push(searchMadeInChina(searchKeywords));
      searchNames.push('madeinchina');
    }

    const results = await Promise.allSettled(searchTasks);
    
    // Collect raw results
    let rawSuppliers = [];
    const platformStatus = {};

    results.forEach((r, i) => {
      const pName = searchNames[i];
      if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
        platformStatus[pName] = { success: true, count: r.value.length };
        rawSuppliers = rawSuppliers.concat(r.value);
      } else {
        platformStatus[pName] = { 
          success: false, 
          error: r.reason?.message || 'No results'
        };
      }
    });

    if (rawSuppliers.length === 0) {
      // Fallback: AI generates supplier list
      const aiResults = await aiSearchSuppliers(searchKeywords);
      if (aiResults && aiResults.length > 0) {
        rawSuppliers = aiResults;
        platformStatus['ai_search'] = { success: true, count: aiResults.length, note: 'AI搜索补充' };
      } else {
        return res.status(200).json({
          success: true,
          suppliers: [],
          platformStatus,
          message: '所有搜索方式均未返回结果，建议更换关键词重试。'
        });
      }
    }

    // Dedup by name (remove duplicates from different sources)
    const seen = new Set();
    const deduped = [];
    for (const s of rawSuppliers) {
      const key = (s.name || s.nameEn || '').replace(/\s+/g, '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        deduped.push({ ...s, relevance: s.relevance || 80 });
      }
    }

    return res.status(200).json({
      success: true,
      suppliers: deduped.slice(0, 20),
      platformStatus,
      keywords: searchKeywords,
      total: deduped.length
    });

  } catch (e) {
    return res.status(500).json({
      error: '搜索失败: ' + (e.message || String(e))
    });
  }
};

// --- Web Search (Bing + Baidu) — 主搜索途径 ---
async function searchWeb(keywords) {
  // 并行尝试 Bing 和 Baidu，谁先返回就用谁
  const [bingResults, baiduResults] = await Promise.allSettled([
    searchBing(keywords),
    searchBaidu(keywords)
  ]);

  const allResults = [];
  const seen = new Set();

  const addIfNew = (sup) => {
    const key = (sup.name || sup.nameEn || '').replace(/\s+/g, '').toLowerCase();
    if (key && key.length > 2 && !seen.has(key)) {
      seen.add(key);
      allResults.push(sup);
    }
  };

  if (bingResults.status === 'fulfilled' && bingResults.value) {
    bingResults.value.forEach(addIfNew);
  }
  if (baiduResults.status === 'fulfilled' && baiduResults.value) {
    baiduResults.value.forEach(addIfNew);
  }

  return allResults.slice(0, 20);
}

// --- Bing Search ---
async function searchBing(keywords) {
  const urls = [
    `https://www.bing.com/search?q=${encodeURIComponent(keywords + ' 供应商')}&setlang=zh-cn`,
    `https://www.bing.com/search?q=${encodeURIComponent(keywords + ' 厂家 公司')}&setlang=zh-cn`
  ];

  for (const url of urls) {
    try {
      const html = await fetchWithTimeout(url, 7000, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      });
      if (!html) continue;

      const suppliers = [];
      const seen = new Set();

      // Pattern 1: b_algo (Bing standard result cards)
      const bAlgo = html.match(/<li class="b_algo">[\s\S]*?<h2><a[^>]*href="([^"]*)"[^>]*>(.+?)<\/a><\/h2>[\s\S]*?(?:<p[^>]*>(.+?)<\/p>)?/gi);
      if (bAlgo) {
        for (const block of bAlgo) {
          const hrefMatch = block.match(/href="([^"]+)"/);
          const titleMatch = block.match(/<a[^>]*>(.+?)<\/a>/);
          const snippetMatch = block.match(/<p[^>]*>(.+?)<\/p>/);
          
          const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          const url = hrefMatch ? hrefMatch[1] : '';

          if (title && title.length > 3 && !seen.has(title) && suppliers.length < 15) {
            seen.add(title);
            // 判断是否像是公司/供应商
            const isCompany = /公司|有限|集团|厂|工厂|Co\.,?\s*Ltd|Inc|Corp|supplier|manufacturer|供应商|制造|科技|实业|技术/i.test(title + snippet);
            if (isCompany) {
              suppliers.push({
                name: title,
                nameEn: /[a-zA-Z]{4,}/.test(title) ? title : '',
                product: snippet.substring(0, 100),
                location: '',
                url: url,
                platform: 'web_bing'
              });
            }
          }
        }
      }

      if (suppliers.length > 0) return suppliers;
    } catch (e) {
      continue;
    }
  }
  return [];
}

// --- Baidu Search ---
async function searchBaidu(keywords) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(keywords + ' 供应商 公司')}&ie=utf-8`;

  try {
    const html = await fetchWithTimeout(url, 7000, {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Accept': 'text/html,application/xhtml+xml'
    });
    if (!html) return [];

    const suppliers = [];
    const seen = new Set();

    // 百度搜索结果
    const resultBlocks = html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi);
    if (resultBlocks) {
      for (const block of resultBlocks) {
        const titleMatch = block.match(/<a[^>]*>(.*?)<\/a>/);
        const snippetMatch = block.match(/<span class="content-right_[^"]*">(.*?)<\/span>/);
        const hrefMatch = block.match(/href="(https?:\/\/[^"]+)"/);
        
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        if (title && title.length > 3 && !seen.has(title) && suppliers.length < 15) {
          seen.add(title);
          const isCompany = /公司|有限|集团|厂|工厂|供应商|制造|科技|实业|技术/i.test(title + snippet);
          if (isCompany) {
            suppliers.push({
              name: title,
              nameEn: '',
              product: snippet.substring(0, 100),
              location: '',
              url: hrefMatch ? hrefMatch[1] : '',
              platform: 'web_baidu'
            });
          }
        }
      }
    }

    // fallback: 简单提取标题
    if (suppliers.length === 0) {
      const titleLinks = html.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.{4,50})<\/a>/gi);
      if (titleLinks) {
        for (const link of titleLinks) {
          const text = link.replace(/<[^>]+>/g, '').trim();
          if (/公司|有限|集团|厂|工厂|供应商/.test(text) && !seen.has(text) && suppliers.length < 15) {
            seen.add(text);
            suppliers.push({
              name: text,
              nameEn: '',
              product: '',
              location: '',
              url: '',
              platform: 'web_baidu'
            });
          }
        }
      }
    }

    return suppliers;
  } catch (e) {
    return [];
  }
}

// --- 1688 Search ---
async function search1688(keywords) {
  const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keywords)}&n=y&netType=1%2C11`;
  
  try {
    const html = await fetchWithTimeout(url, 8000, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.1688.com/'
    });

    if (!html) return [];

    // Parse 1688 search results
    const suppliers = [];
    
    // Try JSON data embedded in page (1688 often embeds data in script)
    const dataMatch = html.match(/window\.__INIT_DATA__\s*=\s*({[\s\S]*?});\s*<\/script>/);
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1]);
        const offers = data?.data?.offerList || data?.offerResultData?.offerList || [];
        offers.slice(0, 10).forEach(offer => {
          suppliers.push({
            name: offer.company?.name || '',
            product: offer.information?.subject || '',
            location: offer.company?.address || '',
            url: offer.information?.detailUrl || '',
            platform: '1688',
            price: offer.tradePrice?.price || ''
          });
        });
      } catch(e) {}
    }

    // Fallback: regex parsing
    if (suppliers.length === 0) {
      // Extract company cards from HTML
      const cardMatches = html.matchAll(/class="[^"]*company-name[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
      for (const m of cardMatches) {
        const companyUrl = m[1];
        const companyName = m[2].replace(/<[^>]+>/g, '').trim();
        if (companyName && suppliers.length < 10) {
          suppliers.push({
            name: companyName,
            product: '',
            location: '',
            url: companyUrl,
            platform: '1688'
          });
        }
      }
      
      // Alternative pattern for newer 1688 layout
      if (suppliers.length === 0) {
        const altMatches = html.matchAll(/title="([^"]{4,60}(?:公司|厂|工厂|有限))"/gi);
        for (const m of altMatches) {
          if (suppliers.length < 10) {
            suppliers.push({
              name: m[1].trim(),
              product: '',
              location: '',
              url: '',
              platform: '1688'
            });
          }
        }
      }
    }

    return suppliers;
  } catch (e) {
    return [];
  }
}

// --- Alibaba.com Search ---
async function searchAlibaba(keywords) {
  const url = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(keywords)}&viewtype=G`;
  
  try {
    const html = await fetchWithTimeout(url, 8000, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.alibaba.com/'
    });

    if (!html) return [];

    const suppliers = [];

    // Parse Alibaba search results - look for supplier info in cards
    // Pattern: company name in supplier links
    const companyMatches = html.matchAll(/class="[^"]*search-card-e-company[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of companyMatches) {
      const name = m[1].replace(/<[^>]+>/g, '').trim();
      if (name && name.length > 2 && suppliers.length < 10) {
        suppliers.push({
          name,
          nameEn: name,
          product: '',
          location: '',
          url: '',
          platform: 'alibaba'
        });
      }
    }

    // Alternative: look for data-company attributes
    if (suppliers.length === 0) {
      const altMatches = html.matchAll(/(?:company[_-]?name|supplier[_-]?name)["']?\s*[:=]\s*["']([^"']{3,80})["']/gi);
      for (const m of altMatches) {
        if (suppliers.length < 10 && !m[1].includes('class') && !m[1].includes('{')) {
          suppliers.push({
            name: '',
            nameEn: m[1].trim(),
            product: '',
            location: '',
            url: '',
            platform: 'alibaba'
          });
        }
      }
    }

    // Try embedded JSON data
    if (suppliers.length === 0) {
      const jsonMatch = html.match(/"normalList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (jsonMatch) {
        try {
          const list = JSON.parse(jsonMatch[1]);
          list.slice(0, 10).forEach(item => {
            suppliers.push({
              name: '',
              nameEn: item.supplier?.companyName || item.companyName || '',
              product: item.title || '',
              location: item.supplier?.country || '',
              url: item.productDetailUrl || '',
              platform: 'alibaba'
            });
          });
        } catch(e) {}
      }
    }

    return suppliers;
  } catch (e) {
    return [];
  }
}

// --- Made-in-China Search ---
async function searchMadeInChina(keywords) {
  const url = `https://www.made-in-china.com/products-search/hot-china-products/${encodeURIComponent(keywords)}.html`;
  
  try {
    const html = await fetchWithTimeout(url, 8000, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.made-in-china.com/'
    });

    if (!html) return [];

    const suppliers = [];

    // Parse Made-in-China results
    const companyMatches = html.matchAll(/class="[^"]*comp-name[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of companyMatches) {
      const link = m[1];
      const name = m[2].replace(/<[^>]+>/g, '').trim();
      if (name && suppliers.length < 10) {
        suppliers.push({
          name: '',
          nameEn: name,
          product: '',
          location: 'China',
          url: link.startsWith('http') ? link : 'https://www.made-in-china.com' + link,
          platform: 'madeinchina'
        });
      }
    }

    // Alternative pattern
    if (suppliers.length === 0) {
      const altMatches = html.matchAll(/<a[^>]*class="[^"]*supplier[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
      for (const m of altMatches) {
        const name = m[2].replace(/<[^>]+>/g, '').trim();
        if (name && name.length > 3 && suppliers.length < 10) {
          suppliers.push({
            name: '',
            nameEn: name,
            product: '',
            location: 'China',
            url: m[1].startsWith('http') ? m[1] : 'https://www.made-in-china.com' + m[1],
            platform: 'madeinchina'
          });
        }
      }
    }

    // Try product title + company extraction
    if (suppliers.length === 0) {
      const prodMatches = html.matchAll(/title="([^"]{5,120})"\s+class="[^"]*product-name/gi);
      const compMatches = [...html.matchAll(/(?:Co\.|Ltd|Factory|Manufacturing|Inc)[^<]{0,50}/gi)];
      // If we found product titles, make entries
      let idx = 0;
      for (const m of prodMatches) {
        if (suppliers.length >= 10) break;
        suppliers.push({
          name: '',
          nameEn: compMatches[idx] ? compMatches[idx][0].trim() : '',
          product: m[1].trim(),
          location: 'China',
          url: '',
          platform: 'madeinchina'
        });
        idx++;
      }
    }

    return suppliers;
  } catch (e) {
    return [];
  }
}

// --- AI Fallback: Search suppliers using DeepSeek ---
async function aiSearchSuppliers(keywords) {
  const apiKey = process.env.AI_API_KEY || 'sk-f2a6af8a39d848a5ade70105fb27c208';
  const apiBase = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'deepseek-chat';

  const prompt = `你是一个供应商搜索助手。请根据以下产品关键词，列出可能的中国供应商/制造商。

搜索关键词：${keywords}

请搜索 1688、阿里巴巴国际站、中国制造网 等 B2B 平台上的相关供应商。

返回JSON数组格式，每个供应商包含：
- name: 中文公司名（如果知道）
- nameEn: 英文公司名（如果知道）
- product: 主营产品
- location: 所在地
- url: 公司主页或店铺链接（如果知道）
- platform: 来源平台（1688/alibaba/madeinchina/other）
- specialty: 核心能力简述

只返回JSON数组，不加其他文字。如果找不到，返回空数组 []。
最多返回10家。`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!response.ok) return [];

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const suppliers = JSON.parse(jsonMatch[0]);
    return suppliers.filter(s => s.name || s.nameEn).map(s => ({
      ...s,
      platform: s.platform || 'ai_search'
    }));
  } catch (e) {
    return [];
  }
}

// --- Utility: Fetch with timeout ---
async function fetchWithTimeout(url, timeoutMs, headers = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      headers: {
        ...headers,
        'Cookie': 'locale=zh_CN; language=zh-CN'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

module.exports.config = {
  maxDuration: 30
};
