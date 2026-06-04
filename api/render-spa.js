// Vercel Serverless Function — Render SPA page with headless Chrome
// Separate function to isolate Puppeteer/Chromium bundle from main fetch-company

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // Set Chinese locale headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    });

    // Navigate and wait for JS to render
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 20000
    });

    // Wait for late-rendering content
    await new Promise(r => setTimeout(r, 2000));

    // Extract text content and full HTML
    const result = await page.evaluate(() => {
      return {
        text: document.body ? document.body.innerText : '',
        html: document.documentElement ? document.documentElement.outerHTML : ''
      };
    });

    await browser.close();

    return res.status(200).json({
      success: true,
      text: result.text || '',
      html: result.html || ''
    });
  } catch (e) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return res.status(500).json({
      error: 'Browser render failed',
      detail: e.message || String(e)
    });
  }
};

module.exports.config = {
  maxDuration: 60
};
