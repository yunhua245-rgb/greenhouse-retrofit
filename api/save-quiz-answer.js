// Vercel Serverless Function — Save quiz answer to Supabase
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

  const { slot, value, dataFile } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
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

    // Insert quiz history
    await fetch(`${SUPABASE_URL}/rest/v1/quiz_history`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ project_id: projectId, slot, value, created_at: new Date().toISOString() })
    });

    // Upsert project info
    await fetch(`${SUPABASE_URL}/rest/v1/project_info`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ project_id: projectId, key: slot, value, updated_at: new Date().toISOString() })
    });

    return res.status(200).json({ success: true, slot, value });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
