// Vercel Serverless — Batch add suppliers to data.json
// Receives an array of supplier objects from search results and appends to suppliers[]

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { suppliers, dataFile } = req.body || {};
  
  if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
    return res.status(400).json({ error: '请提供供应商数组' });
  }

  if (suppliers.length > 20) {
    return res.status(400).json({ error: '单次最多添加20个供应商' });
  }

  // Determine which data file to use (default: data.json for greenhouse project)
  const targetFile = dataFile || 'data.json';

  try {
    // Read current data from GitHub
    const token = process.env.GITHUB_TOKEN;
    const repo = 'yunhua245-rgb/greenhouse-retrofit';
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${targetFile}`;
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'greenhouse-app'
    };

    const getRes = await fetch(githubUrl, { headers });
    if (!getRes.ok) {
      return res.status(500).json({ error: `无法读取 ${targetFile}` });
    }

    const fileInfo = await getRes.json();
    const currentData = JSON.parse(
      Buffer.from(fileInfo.content, 'base64').toString('utf-8')
    );

    // Initialize suppliers array if not exists
    if (!currentData.suppliers) currentData.suppliers = [];

    // Generate unique IDs and add timestamps
    const now = new Date().toISOString();
    const newSuppliers = suppliers.map(s => ({
      id: generateId(),
      name: s.name || '',
      nameEn: s.nameEn || '',
      website: s.officialWebsite || s.url || '',
      platformUrl: s.url || '',
      location: s.location || '',
      specialty: s.specialty || s.product || '',
      track: s.track || '',
      contact: s.contact || '',
      email: s.email || '',
      export: 'unknown',
      status: 'pending',
      notes: `${s.officialWebsite ? '官网: ' + s.officialWebsite : ''}${s.specialty ? ' | 主营: ' + s.specialty : ''}`.replace(/^\s*\|\s*/, ''),
      logs: [{
        time: now,
        text: `已添加供应商`
      }],
      createdAt: now,
      updatedAt: now
    }));

    // Append to suppliers list
    currentData.suppliers = currentData.suppliers.concat(newSuppliers);

    // Save back to GitHub
    const content = Buffer.from(
      JSON.stringify(currentData, null, 2)
    ).toString('base64');

    const putRes = await fetch(githubUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `feat: 批量添加 ${newSuppliers.length} 个供应商`,
        content,
        sha: fileInfo.sha,
        branch: 'main'
      })
    });

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      return res.status(500).json({ 
        error: '保存失败: ' + (errData.message || putRes.status)
      });
    }

    return res.status(200).json({
      success: true,
      added: newSuppliers.length,
      totalSuppliers: currentData.suppliers.length,
      suppliers: newSuppliers.map(s => ({ id: s.id, name: s.name || s.nameEn }))
    });

  } catch (e) {
    return res.status(500).json({
      error: '批量添加失败: ' + (e.message || String(e))
    });
  }
};

function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
}
