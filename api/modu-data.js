export default async function handler(req, res) {
  const GITHUB_OWNER = 'yunhua245-rgb';
  const GITHUB_REPO = 'greenhouse-retrofit';
  const GITHUB_FILE = 'projects/modu/data.json';
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'modu-sourcing-app'
  };
  if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  if (req.method === 'GET') {
    try {
      const response = await fetch(apiUrl, { headers });
      if (response.status === 404) {
        // File doesn't exist yet, return empty data
        return res.status(200).json({ suppliers: [], _sha: '' });
      }
      if (!response.ok) {
        return res.status(response.status).json({ error: 'GitHub API error' });
      }
      const file = await response.json();
      const content = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      content._sha = file.sha;
      return res.status(200).json(content);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      const { _sha, ...data } = body;
      
      // Get current sha if not provided
      let sha = _sha;
      if (!sha) {
        try {
          const getRes = await fetch(apiUrl, { headers });
          if (getRes.ok) {
            const file = await getRes.json();
            sha = file.sha;
          }
        } catch(e) { /* file may not exist */ }
      }

      const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
      const putBody = {
        message: `Update MODU supplier data [${new Date().toISOString()}]`,
        content,
        branch: 'main'
      };
      if (sha) putBody.sha = sha;

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const err = await putRes.json();
        return res.status(putRes.status).json({ error: err.message || 'Save failed' });
      }

      const result = await putRes.json();
      return res.status(200).json({ success: true, _sha: result.content.sha });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
