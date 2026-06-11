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

  const { suppliers, projectInfo, editHistory } = body;

  if (suppliers) {
    await supabaseFetch(`suppliers?project_id=eq.${projectId}`, 'DELETE');
    for (const s of suppliers) {
      const { id, ...row } = s;
      await supabaseFetch('suppliers', 'POST', { ...row, project_id: projectId });
    }
  }

  if (projectInfo) {
    for (const [key, value] of Object.entries(projectInfo)) {
      await supabaseFetch('project_info', 'POST', { project_id: projectId, key, value });
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
