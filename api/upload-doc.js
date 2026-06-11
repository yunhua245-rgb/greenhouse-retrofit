// Vercel Serverless — Document upload endpoint (uses service_role, bypasses RLS)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwbkscwtlluziexacjta.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { supplierId, projectSlug, filename, fileBase64 } = req.body;
    if (!supplierId || !projectSlug || !filename || !fileBase64) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const projRes = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id&slug=eq.${projectSlug}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    if (!projRes.ok) return res.status(500).json({ error: 'Project lookup failed' });
    const projects = await projRes.json();
    if (!projects.length) return res.status(404).json({ error: 'Project not found' });

    const buf = Buffer.from(fileBase64, 'base64');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${projectSlug}/${supplierId}/${Date.now()}_${safeName}`;

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/supplier-docs/${path}`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: buf
    });
    if (!upRes.ok) return res.status(500).json({ error: 'Upload failed' });

    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/supplier_documents`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify({
        supplier_id: supplierId, project_id: projects[0].id,
        filename, storage_path: path, file_size: buf.length, mime_type: 'application/octet-stream'
      })
    });
    if (!insRes.ok) return res.status(500).json({ error: 'DB insert failed' });
    res.status(200).json(await insRes.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
