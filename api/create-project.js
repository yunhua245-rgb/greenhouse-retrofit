// Vercel Serverless Function — Create a new sourcing project
// Creates project data file on GitHub and returns project info

const GITHUB_REPO = 'yunhua245-rgb/greenhouse-retrofit';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { project } = req.body || {};
  if (!project || !project.projectSlug || !project.projectName) {
    return res.status(400).json({ error: 'project data with projectSlug and projectName is required' });
  }

  const slug = project.projectSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 20);
  const dataFile = `${slug}-data.json`;

  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'greenhouse-retrofit-app'
  };

  // Check if project already exists
  try {
    const checkUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${dataFile}`;
    const checkRes = await fetch(checkUrl, { headers });
    if (checkRes.ok) {
      return res.status(409).json({ error: '项目已存在', slug });
    }
  } catch(e) {}

  // Create initial project data
  const projectData = {
    projectInfo: {
      name: project.projectName,
      slug: slug,
      // 客户基本信息
      clientCompany: project.clientCompany || '',
      contactPerson: project.contactPerson || '',
      contactMethod: project.contactMethod || '',
      location: project.location || '',
      companyType: project.companyType || '',
      companyScale: project.companyScale || '',
      // 产品需求
      productName: project.productName || project.productCategory || '',
      productUsage: project.productUsage || '',
      specifications: project.specifications || '',
      quantity: project.quantity || '',
      certifications: project.certifications || '',
      packagingReq: project.packagingReq || '',
      // 价格与预算
      budget: project.budget || '',
      currency: project.currency || '',
      tradeTerms: project.tradeTerms || '',
      paymentTerms: project.paymentTerms || '',
      // 物流与交期
      destination: project.destination || '',
      timeline: project.timeline || '',
      shippingMethod: project.shippingMethod || '',
      customsClearance: project.customsClearance || '',
      // 供应商要求
      supplierType: project.supplierType || '',
      supplierRegion: project.supplierRegion || '',
      oemOdm: project.oemOdm || '',
      // 综合信息
      requirements: project.requirements || '',
      sourcingTracks: project.sourcingTracks || [],
      themeColor: project.themeColor || '#4a3f8a',
      emoji: project.emoji || '📦',
      status: 'active',
      createdAt: new Date().toISOString(),
      // 兼容旧字段
      clientInfo: project.clientInfo || project.clientCompany || '',
      clientCountry: project.clientCountry || project.location || '',
      productCategory: project.productCategory || project.productName || '',
    },
    suppliers: [],
    quizHistory: [],
    editHistory: []
  };

  // Create data file on GitHub
  try {
    const createUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${dataFile}`;
    const content = Buffer.from(JSON.stringify(projectData, null, 2)).toString('base64');
    
    const createRes = await fetch(createUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `feat: 新建项目 ${project.projectName}`,
        content,
        branch: 'main'
      })
    });

    if (!createRes.ok) {
      const err = await createRes.text().catch(() => '');
      return res.status(500).json({ error: 'Failed to create project file', detail: err.substring(0, 200) });
    }

    // Also update the projects registry in data.json (add to projects array)
    try {
      const registryUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/projects.json`;
      let projects = [];
      let registrySha = null;

      const getRes = await fetch(registryUrl, { headers });
      if (getRes.ok) {
        const fileData = await getRes.json();
        registrySha = fileData.sha;
        projects = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
      }

      projects.push({
        slug,
        name: project.projectName,
        emoji: project.emoji || '📦',
        themeColor: project.themeColor || '#4a3f8a',
        clientInfo: project.clientInfo || '',
        status: 'active',
        createdAt: new Date().toISOString()
      });

      const regContent = Buffer.from(JSON.stringify(projects, null, 2)).toString('base64');
      const regPayload = {
        message: `chore: 注册新项目 ${slug}`,
        content: regContent,
        branch: 'main'
      };
      if (registrySha) regPayload.sha = registrySha;

      await fetch(registryUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(regPayload)
      });
    } catch(e) {
      // Non-critical: registry update failed but project data was created
      console.log('Registry update failed:', e.message);
    }

    return res.status(200).json({
      success: true,
      slug,
      dataFile,
      project: projectData.projectInfo
    });

  } catch(e) {
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
};
