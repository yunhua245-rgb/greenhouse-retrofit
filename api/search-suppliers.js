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
