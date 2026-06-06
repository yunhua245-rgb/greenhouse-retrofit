// Vercel Serverless Function — Save quiz answer to project info
// Merges a single slot answer into projectInfo in data.json

const GITHUB_REPO = 'yunhua245-rgb/greenhouse-retrofit';
const GITHUB_FILE = 'projects/greenhouse/data.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { slot, value } = req.body || {};
  if (!slot || !value) {
    return res.status(400).json({ error: 'slot and value are required' });
  }

  // Allowed slots that can be updated from quiz / client-edit
  const allowedSlots = [
    // === 客户基本信息 ===
    'clientCompany', 'contactPerson', 'contactMethod', 'location', 'companyType', 'companyScale',
    // === 产品需求 ===
    'productName', 'productUsage', 'specifications', 'quantity', 'certifications', 'sampleDrawing', 'packagingReq',
    // === 价格与预算 ===
    'budget', 'currency', 'tradeTerms', 'paymentTerms',
    // === 物流与交期 ===
    'destination', 'timeline', 'shippingMethod', 'customsClearance',
    // === 供应商要求 ===
    'supplierType', 'supplierRegion', 'factoryAudit', 'sampleNeeded', 'oemOdm',
    // === 售后与其他 ===
    'warranty', 'afterSales', 'cooperationIntent', 'freeformNote',
    // === 旧字段兼容 ===
    'area', 'structureType', 'infrastructure', 'crops', 'scope'
  ];
  if (!allowedSlots.includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot: ' + slot });
  }

  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'greenhouse-retrofit-app'
  };

  try {
    // Read current data
    const getRes = await fetch(apiBase, { headers });
    if (!getRes.ok) {
      return res.status(500).json({ error: 'Failed to read data' });
    }
    const fileData = await getRes.json();
    const sha = fileData.sha;
    const currentData = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    // Update projectInfo slot
    if (!currentData.projectInfo) currentData.projectInfo = {};
    currentData.projectInfo[slot] = value;

    // Append to quizHistory for admin tracking
    if (!currentData.quizHistory) currentData.quizHistory = [];
    currentData.quizHistory.push({
      slot,
      value,
      time: new Date().toISOString()
    });

    // Save back
    const content = Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64');
    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Quiz answer: ${slot} = ${value.substring(0, 50)}`,
        content,
        sha
      })
    });

    if (!putRes.ok) {
      const err = await putRes.text().catch(() => '');
      return res.status(500).json({ error: 'Failed to save', detail: err.substring(0, 200) });
    }

    return res.status(200).json({ success: true, slot, value });

  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
};
