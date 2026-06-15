// Vercel Serverless Function — Greenhouse data store via Supabase
// Data persisted in Supabase PostgreSQL

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const PROJECT_SLUG = 'greenhouse';

  if (req.method === 'GET') {
    try {
      const data = await readFullData(PROJECT_SLUG);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read data', detail: e.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await writeFullData(PROJECT_SLUG, body);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to write data', detail: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { action, profile } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
      if (action === 'updateProfile' && profile) {
        await supabaseFetch('coordinator_profiles?limit=1', 'GET');
        // Use upsert on the first coordinator profile
        const { data: existing } = await supabaseFetch('coordinator_profiles?limit=1', 'GET');
        if (existing && existing.length > 0) {
          await supabaseFetch(`coordinator_profiles?id=eq.${existing[0].id}`, 'PATCH', { ...profile, updated_at: new Date().toISOString() });
        } else {
          await supabaseFetch('coordinator_profiles', 'POST', profile);
        }
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to update', detail: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Helper: UPSERT via Supabase REST API (merge-duplicates on unique constraint)
async function supabaseFetchUpsert(table, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = supabaseHeaders();
  headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Supabase UPSERT ${table}: ${r.status} ${err}`);
  }
  return { data: await r.json().catch(() => []) };
}

// Helper: call Supabase REST API
async function supabaseFetch(path, method, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const opts = { method, headers: supabaseHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path}: ${r.status} ${err}`);
  }
  if (method === 'GET' || opts.headers['Prefer'] === 'return=representation') {
    return { data: await r.json().catch(() => []) };
  }
  return { data: [] };
}

// Read all data for a project, returning the legacy format
async function readFullData(slug) {
  const project = await supabaseFetch(`projects?slug=eq.${slug}&limit=1`, 'GET');
  const projectId = project?.data?.[0]?.id;
  if (!projectId) throw new Error('Project not found: ' + slug);

  const [suppliers, infoRows, coordinator, phases, editHistory, quizHistory] = await Promise.all([
    supabaseFetch(`suppliers?project_id=eq.${projectId}&order=created_at.desc`, 'GET'),
    supabaseFetch(`project_info?project_id=eq.${projectId}`, 'GET'),
    supabaseFetch('coordinator_profiles?limit=1', 'GET'),
    supabaseFetch(`phases?project_id=eq.${projectId}&order=sort_order.asc`, 'GET'),
    supabaseFetch(`edit_history?project_id=eq.${projectId}&order=created_at.desc`, 'GET'),
    supabaseFetch(`quiz_history?project_id=eq.${projectId}&order=created_at.desc`, 'GET')
  ]);

  const projectInfo = {};
  (infoRows?.data || []).forEach(row => { projectInfo[row.key] = row.value; });

  return {
    suppliers: suppliers?.data || [],
    projectInfo,
    coordinatorProfile: coordinator?.data?.[0] || {},
    phases: phases?.data || [],
    editHistory: editHistory?.data || [],
    quizHistory: quizHistory?.data || [],
    lastUpdated: Date.now()
  };
}

// Write full data for a project (legacy format)
async function writeFullData(slug, body) {
  const project = await supabaseFetch(`projects?slug=eq.${slug}&limit=1`, 'GET');
  const projectId = project?.data?.[0]?.id;
  if (!projectId) throw new Error('Project not found: ' + slug);

  const { suppliers, projectInfo, coordinatorProfile, phases, editHistory, syncSuppliers } = body;

  // Suppliers: only sync when explicitly opted-in via syncSuppliers flag
  // This prevents accidental mass deletion from client-edit or other PUT calls
  if (syncSuppliers && Array.isArray(suppliers) && suppliers.length > 0) {
    await supabaseFetch(`suppliers?project_id=eq.${projectId}`, 'DELETE');
    for (const s of suppliers) {
      const { id, createdAt, updatedAt, ...rest } = s;
      const row = { ...rest, project_id: projectId };
      // Map camelCase timestamps to snake_case if present
      if (createdAt) row.created_at = typeof createdAt === 'number' ? new Date(createdAt).toISOString() : createdAt;
      if (updatedAt) row.updated_at = typeof updatedAt === 'number' ? new Date(updatedAt).toISOString() : updatedAt;
      await supabaseFetch('suppliers', 'POST', row);
    }
  }

  if (projectInfo) {
    for (const [key, value] of Object.entries(projectInfo)) {
      // UPSERT: update if (project_id, key) exists, insert otherwise
      await supabaseFetchUpsert('project_info', { project_id: projectId, key, value, updated_at: new Date().toISOString() });
    }
  }

  if (coordinatorProfile) {
    const { data: existing } = await supabaseFetch('coordinator_profiles?limit=1', 'GET');
    if (existing && existing.length > 0) {
      await supabaseFetch(`coordinator_profiles?id=eq.${existing[0].id}`, 'PATCH', { ...coordinatorProfile, updated_at: new Date().toISOString() });
    } else {
      await supabaseFetch('coordinator_profiles', 'POST', coordinatorProfile);
    }
  }

  if (phases) {
    await supabaseFetch(`phases?project_id=eq.${projectId}`, 'DELETE');
    for (const p of phases) {
      const { id, ...row } = p;
      await supabaseFetch('phases', 'POST', { ...row, project_id: projectId });
    }
  }

  if (editHistory) {
    for (const e of editHistory) {
      const { id, ...row } = e;
      await supabaseFetch('edit_history', 'POST', { ...row, project_id: projectId });
    }
  }
}

module.exports.config = { maxDuration: 30 };
