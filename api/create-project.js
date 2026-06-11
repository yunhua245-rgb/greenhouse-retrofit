// Vercel Serverless Function — Create a new sourcing project in Supabase

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

  const { project } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
  if (!project || !project.projectSlug || !project.projectName) {
    return res.status(400).json({ error: 'project data with projectSlug and projectName is required' });
  }

  const slug = project.projectSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 20);
  const themeColor = project.themeColor || '#4a3f8a';

  try {
    // Check if project already exists
    const checkR = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?slug=eq.${slug}&limit=1`,
      { headers: supabaseHeaders() }
    );
    const existing = await checkR.json();
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Project already exists', slug });
    }

    // Create project
    const createR = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        slug,
        name: project.projectName,
        name_en: project.projectNameEn || '',
        theme_color: themeColor
      })
    });
    const created = await createR.json();
    const projectId = created?.[0]?.id;

    if (!projectId) {
      return res.status(500).json({ error: 'Failed to create project' });
    }

    // Insert project info fields
    const infoFields = [
      'clientCompany', 'contactPerson', 'contactMethod', 'location', 'companyType', 'companyScale',
      'productName', 'productUsage', 'specifications', 'quantity', 'certifications', 'packagingReq',
      'budget', 'currency', 'tradeTerms', 'paymentTerms',
      'destination', 'timeline', 'shippingMethod', 'customsClearance',
      'supplierType', 'supplierRegion', 'oemOdm',
      'requirements', 'sourcingTracks'
    ];

    for (const key of infoFields) {
      const val = project[key] || '';
      if (val) {
        await fetch(`${SUPABASE_URL}/rest/v1/project_info`, {
          method: 'POST',
          headers: supabaseHeaders(),
          body: JSON.stringify({ project_id: projectId, key, value: String(val) })
        });
      }
    }

    // Store composite fields
    if (project.productCategory || project.productName) {
      await fetch(`${SUPABASE_URL}/rest/v1/project_info`, {
        method: 'POST',
        headers: supabaseHeaders(),
        body: JSON.stringify({ project_id: projectId, key: 'productName', value: project.productName || project.productCategory || '' })
      });
    }

    return res.status(200).json({
      success: true,
      slug,
      projectId,
      project: { name: project.projectName, slug }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
