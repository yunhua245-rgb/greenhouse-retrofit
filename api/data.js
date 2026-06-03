// Vercel Serverless Function — JSON data store via GitHub API
// Data persisted in GitHub repo file: data.json

const GITHUB_REPO = 'yunhua245-rgb/greenhouse-retrofit';
const GITHUB_FILE = 'data.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'greenhouse-retrofit-app'
  };

  if (req.method === 'GET') {
    try {
      const response = await fetch(apiBase, { headers });
      if (response.ok) {
        const fileData = await response.json();
        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).send(content);
      }
      return res.status(404).json({ error: 'Data not found' });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read data', detail: e.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      // First get current file SHA
      const getRes = await fetch(apiBase, { headers });
      let sha = null;
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      }

      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const content = Buffer.from(body).toString('base64');

      const putBody = {
        message: 'Update data ' + new Date().toISOString(),
        content: content,
        ...(sha && { sha })
      };

      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody)
      });

      if (putRes.ok) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({ success: true });
      } else {
        const errData = await putRes.json();
        return res.status(500).json({ error: 'Failed to save', detail: errData });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Failed to write data', detail: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = {
  maxDuration: 30
};
