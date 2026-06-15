// Vercel Serverless Function — MODU data store via Supabase

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const PROJECT_SLUG = 'modu';

  if (req.method === 'GET') {
    try {
      const data = await readFullData(PROJECT_SLUG);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { _sha, ...data } = body;
      await writeFullData(PROJECT_SLUG, data);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

async function supabaseFetchUpsert(table, body, onConflict) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (onConflict) url += `?on_conflict=${onConflict}`;
  const headers = supabaseHeaders();
  headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Supabase UPSERT ${table}: ${r.status} ${err}`);
  }
  return { data: await r.json().catch(() => []) };
}

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

async function readFullData(slug) {
  const project = await supabaseFetch(`projects?slug=eq.${slug}&limit=1`, 'GET');
  const projectId = project?.data?.[0]?.id;
  if (!projectId) throw new Error('Project not found: ' + slug);

  const [suppliers, infoRows, editHistory] = await Promise.all([
    supabaseFetch(`suppliers?project_id=eq.${projectId}&order=created_at.desc`, 'GET'),
    supabaseFetch(`project_info?project_id=eq.${projectId}`, 'GET'),
    supabaseFetch(`edit_history?project_id=eq.${projectId}&order=created_at.desc`, 'GET')
  ]);

  const projectInfo = {};
  (infoRows?.data || []).forEach(row => { projectInfo[row.key] = row.value; });

  return {
    suppliers: suppliers?.data || [],
    projectInfo,
    editHistory: editHistory?.data || [],
    lastUpdated: Date.now()
  };
}

async function writeFullData(slug, body) {
  const project = await supabaseFetch(`projects?slug=eq.${slug}&limit=1`, 'GET');
  const projectId = project?.data?.[0]?.id;
  if (!projectId) throw new Error('Project not found: ' + slug);

  const { suppliers, projectInfo, editHistory, syncSuppliers } = body;

  // Suppliers: only sync when explicitly opted-in via syncSuppliers flag
  // Uses UPSERT by name: existing suppliers get updated, new ones get inserted
  if (syncSuppliers && Array.isArray(suppliers) && suppliers.length > 0) {
    const { data: existing } = await supabaseFetch(`suppliers?project_id=eq.${projectId}&select=id,name`, 'GET');
    const existingMap = {};
    (existing || []).forEach(s => { existingMap[s.name] = s.id; });

    for (const s of suppliers) {
      const { id, createdAt, updatedAt, created_at, updated_at, project_id: _pid, ...rest } = s;
      const row = { ...rest, project_id: projectId };
      if (createdAt) row.updated_at = typeof createdAt === 'number' ? new Date(createdAt).toISOString() : createdAt;
      if (updatedAt) row.updated_at = typeof updatedAt === 'number' ? new Date(updatedAt).toISOString() : updatedAt;
      Object.keys(row).forEach(k => { if (row[k] === undefined) delete row[k]; });

      const existingId = existingMap[s.name];
      if (existingId) {
        await supabaseFetch(`suppliers?id=eq.${existingId}`, 'PATCH', row);
      } else {
        await supabaseFetch('suppliers', 'POST', row);
      }
    }
  }

  if (projectInfo) {
    for (const [key, value] of Object.entries(projectInfo)) {
      // UPSERT: update if (project_id, key) exists, insert otherwise
      await supabaseFetchUpsert('project_info', { project_id: projectId, key, value, updated_at: new Date().toISOString() }, 'project_id,key');
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
