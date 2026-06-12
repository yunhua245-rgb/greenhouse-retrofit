// Vercel Serverless Function — Upload document for supplier
// Two-step approach to avoid Vercel 4.5MB body limit:
// Step 1 (action: 'get-upload-url'): Returns a signed upload URL for Supabase Storage
// Step 2 (action: 'confirm'): Records the document in supplier_documents table after upload
// Legacy (action: undefined): Direct base64 upload for small files (<4MB)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwbkscwtlluziexacjta.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YmtzY3d0bGx1emlleGFjanRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTczNzYsImV4cCI6MjA5NjczMzM3Nn0.s2YsQeLVIRTOy3V8bSsU4HVASY6bQox_rm9_QAN7m3E';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the user is authenticated
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY }
  });
  if (!userRes.ok) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured: missing service key' });
  }

  const body = req.body || {};
  const action = body.action || 'upload'; // 'get-upload-url', 'confirm', or 'upload' (legacy base64)

  // === Action: get-upload-url ===
  // Returns a signed URL for the client to upload directly to Supabase Storage
  if (action === 'get-upload-url') {
    const { supplier_id, project_slug, filename, mime_type } = body;
    if (!supplier_id || !project_slug || !filename) {
      return res.status(400).json({ error: 'Missing: supplier_id, project_slug, filename' });
    }

    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${project_slug}/${supplier_id}/${timestamp}_${safeName}`;

    // Create signed upload URL using Supabase Storage API
    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/upload/sign/supplier-docs/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ upsert: true })
      }
    );

    if (!signRes.ok) {
      // Fallback: if signed URL not supported, just return the direct path
      // Client will use the direct upload with service key in header
      return res.status(200).json({
        success: true,
        method: 'direct',
        storagePath,
        uploadUrl: `${SUPABASE_URL}/storage/v1/object/supplier-docs/${storagePath}`,
        token: SUPABASE_SERVICE_KEY
      });
    }

    const signData = await signRes.json();
    return res.status(200).json({
      success: true,
      method: 'signed',
      storagePath,
      uploadUrl: `${SUPABASE_URL}/storage/v1${signData.url}`,
      token: signData.token || null
    });
  }

  // === Action: confirm ===
  // After client uploads file to Storage, record it in the DB
  if (action === 'confirm') {
    const { supplier_id, project_slug, filename, storage_path, file_size, mime_type } = body;
    if (!supplier_id || !project_slug || !filename || !storage_path) {
      return res.status(400).json({ error: 'Missing: supplier_id, project_slug, filename, storage_path' });
    }

    // Get project_id
    const projRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?slug=eq.${project_slug}&select=id&limit=1`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY } }
    );
    const projData = await projRes.json();
    const projectId = projData?.[0]?.id;
    if (!projectId) {
      return res.status(400).json({ error: 'Project not found: ' + project_slug });
    }

    // Insert record
    const docRes = await fetch(
      `${SUPABASE_URL}/rest/v1/supplier_documents`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          supplier_id,
          project_id: projectId,
          filename,
          storage_path,
          file_size: file_size || 0,
          mime_type: mime_type || 'application/octet-stream'
        })
      }
    );

    if (!docRes.ok) {
      const errText = await docRes.text().catch(() => '');
      return res.status(500).json({ error: 'Database insert failed', detail: errText.substring(0, 200) });
    }

    const docData = await docRes.json();
    return res.status(200).json({ success: true, document: docData[0] || { filename, storage_path } });
  }

  // === Legacy: direct base64 upload (for small files < 4MB) ===
  const { supplier_id, project_slug, filename, mime_type, file_base64 } = body;

  if (!supplier_id || !project_slug || !filename || !file_base64) {
    return res.status(400).json({ error: 'Missing required fields: supplier_id, project_slug, filename, file_base64' });
  }

  try {
    const fileBuffer = Buffer.from(file_base64, 'base64');
    const fileSize = fileBuffer.length;

    if (fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 50MB)' });
    }

    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${project_slug}/${supplier_id}/${timestamp}_${safeName}`;

    // Upload to Storage
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/supplier-docs/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': mime_type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: fileBuffer
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      return res.status(500).json({ error: 'Storage upload failed', detail: errText.substring(0, 200) });
    }

    // Get project_id
    const projRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?slug=eq.${project_slug}&select=id&limit=1`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY } }
    );
    const projData = await projRes.json();
    const projectId = projData?.[0]?.id;

    if (!projectId) {
      return res.status(400).json({ error: 'Project not found: ' + project_slug });
    }

    // Insert record
    const docRes = await fetch(
      `${SUPABASE_URL}/rest/v1/supplier_documents`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          supplier_id,
          project_id: projectId,
          filename,
          storage_path: storagePath,
          file_size: fileSize,
          mime_type: mime_type || 'application/octet-stream'
        })
      }
    );

    if (!docRes.ok) {
      const errText = await docRes.text().catch(() => '');
      return res.status(500).json({ error: 'Database insert failed', detail: errText.substring(0, 200) });
    }

    const docData = await docRes.json();
    return res.status(200).json({
      success: true,
      document: docData[0] || { filename, storage_path: storagePath }
    });

  } catch (e) {
    return res.status(500).json({ error: 'Upload failed', detail: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
