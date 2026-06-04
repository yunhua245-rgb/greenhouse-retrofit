// Vercel Serverless Function — Fetch company website (homepage + subpages) and extract info
// Crawls key subpages (about, contact, products) for more complete data
// Uses headless Chrome (Puppeteer) for SPA sites that require JS rendering

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

  try {
    // Prioritize Chinese version of the site
    const urlsToTry = buildChineseUrlPriority(url);
    
    // Step 1: Try URLs in priority order (Chinese versions first)
    // Time budget: 6s for URL tries, then leave 20s+ for subpages/AI/inference
    let homepage = { ok: false, status: 0 };
    let effectiveUrl = url;
    const startTime = Date.now();
    
    for (const tryUrl of urlsToTry.slice(0, 3)) {
      // Abort if we've spent >8s already (leave time for subpages within 30s budget)
      if (Date.now() - startTime > 8000) break;
      
      const attempt = await fetchPage(tryUrl, 6000);
      if (attempt.ok) {
        const text = htmlToText(attempt.html);
        // Check if this is a real 404 page (explicit 404 indicators in content)
        const has404Indicator = /404|page\s*not\s*found|页面.*不存在|页面.*找不到/i.test(text) ||
          attempt.html.includes('/404/') || attempt.html.includes('404.png') || attempt.html.includes('404.jpg');
        if (has404Indicator && tryUrl !== urlsToTry[urlsToTry.length - 1]) {
          continue; // Skip explicit 404 pages, try next URL
        }
        // Check if this page has meaningful Chinese content (min 200 chars total)
        const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / Math.max(text.length, 1);
        if ((chineseRatio > 0.1 && text.length > 200) || tryUrl === urlsToTry[urlsToTry.length - 1]) {
          homepage = attempt;
          effectiveUrl = tryUrl;
          break;
        }
        // Store first successful response as fallback (even if content is thin — could be SPA)
        if (!homepage.ok) {
          homepage = attempt;
          effectiveUrl = tryUrl;
        }
      }
    }
    
    // If all priority URLs failed, try ONE fallback path (keep it fast)
    if (!homepage.ok && Date.now() - startTime < 10000) {
      const baseUrl = new URL(url);
      const attempt = await fetchPage(baseUrl.origin + '/index.html', 4000);
      if (attempt.ok) {
        homepage = attempt;
        effectiveUrl = baseUrl.origin + '/index.html';
      }
    }
    
    if (!homepage.ok) {
      // Website unreachable — report error directly, no AI guessing
      const reason = homepage.error || '';
      let userMsg = `无法访问该网站 (HTTP ${homepage.status || '超时'})`;
      if (reason.includes('abort') || reason.includes('timeout') || homepage.status === 0) {
        userMsg = '网站连接超时，可能是该网站屏蔽了境外访问或服务器暂时不可用。请手动填写信息。';
      } else if (homepage.status === 403) {
        userMsg = '网站拒绝访问 (403)，可能开启了防爬策略。请手动填写信息。';
      } else if (homepage.status === 404) {
        userMsg = '页面未找到 (404)，请检查URL是否正确。';
      } else if (homepage.status >= 500) {
        userMsg = '网站服务器错误，请稍后重试。';
      } else {
        userMsg += '，请手动填写信息。';
      }
      return res.status(502).json({ error: userMsg });
    }

    const homeHtml = homepage.html;
    const homeText = htmlToText(homeHtml);

    // Detect SPA (very little text content + app container) or near-empty page
    const isSPA = homeText.length < 300 && (homeHtml.includes('id="app"') || homeHtml.includes('id="root"') || homeHtml.includes('id="__nuxt"') || homeHtml.includes('id="__next"'));
    const isEmptyPage = homeText.length < 100;
    
    // If page is essentially empty (SPA with no SSR or very thin content), use headless Chrome to render
    if (isEmptyPage || (isSPA && homeText.length < 150)) {
      const rendered = await renderWithBrowser(effectiveUrl);
      if (rendered && rendered.text && rendered.text.length > 100) {
        // Successfully rendered! Use the rendered content for extraction
        const renderedText = rendered.text.substring(0, 12000);
        const renderedHtml = rendered.html || '';
        
        const titleMatch = renderedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const contactInfo = extractContact(renderedHtml, renderedText);
        const result = {
          name: extractCompanyName(pageTitle, renderedText),
          location: extractLocation(renderedText),
          contact: contactInfo.phones,
          email: contactInfo.emails,
          website: url
        };

        return res.status(200).json({
          success: true,
          data: result,
          raw: {
            title: pageTitle,
            description: '',
            keywords: '',
            textContent: renderedText,
            subpagesCrawled: 0
          },
          note: 'ℹ️ 该网站通过浏览器渲染获取内容（SPA框架）'
        });
      }
      
      // Browser render failed or got no content — try ICP as last resort
      const domain = new URL(url).hostname.replace(/^www\./, '');
      const icpResult = await lookupICP(domain);
      if (icpResult && icpResult.name) {
        return res.status(200).json({
          success: true,
          data: {
            name: icpResult.name,
            nameEn: '',
            location: '',
            specialty: '',
            contact: '',
            email: '',
            website: url
          },
          raw: { title: homeHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', description: '', keywords: '', textContent: '', subpagesCrawled: 0 },
          note: '⚠️ 该网站为SPA框架，浏览器渲染超时，仅通过备案信息获取到公司名称，其余信息请手动补充。'
        });
      }
      // Everything failed
      return res.status(502).json({
        error: '该网站为前端框架渲染（SPA），浏览器渲染超时且无法获取备案信息。请手动填写供应商信息。'
      });
    }

    // Step 2: Find important subpage links
    const baseUrl = new URL(effectiveUrl);
    let subLinks = findKeySubpages(homeHtml, baseUrl);

    // Step 2b: If SPA, try extracting content from JS bundles instead
    let jsContent = '';
    if (isSPA) {
      jsContent = await extractSPAContent(homeHtml, baseUrl);
    }

    // Step 2c: If still no links and not SPA (or SPA with no JS content), try common paths
    if (subLinks.length === 0 && !isSPA) {
      subLinks = guessCommonSubpages(baseUrl);
    }

    // Step 3: Fetch subpages in parallel (max 3, 5s timeout each) — stay within 30s budget
    const elapsed = Date.now() - startTime;
    const subpageTimeout = Math.min(5000, Math.max(2000, 20000 - elapsed));
    const subResults = await Promise.allSettled(
      subLinks.slice(0, 3).map(link => fetchPage(link, subpageTimeout))
    );

    // Step 4: Merge all text content
    let allText = homeText;
    if (jsContent) allText += '\n\n' + jsContent;
    let allHtml = homeHtml;
    let crawledCount = 0;
    for (const r of subResults) {
      if (r.status === 'fulfilled' && r.value.ok) {
        const subText = htmlToText(r.value.html);
        // Only count pages with meaningful content (>100 chars that differ from home)
        if (subText.length > 100 && subText !== homeText.substring(0, subText.length)) {
          allText += '\n\n' + subText;
          allHtml += '\n' + r.value.html;
          crawledCount++;
        }
      }
    }

    // Limit total text
    const combinedText = allText.substring(0, 12000);

    // Extract title & meta from homepage
    const titleMatch = homeHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const descMatch = homeHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const metaDesc = descMatch ? descMatch[1].trim() : '';
    const kwMatch = homeHtml.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i);
    const metaKw = kwMatch ? kwMatch[1].trim() : '';

    // Heuristic extraction using ALL text
    const contactInfo = extractContact(allHtml, combinedText);
    const result = {
      name: extractCompanyName(pageTitle, combinedText),
      location: extractLocation(combinedText),
      contact: contactInfo.phones,
      email: contactInfo.emails,
      website: url
    };

    return res.status(200).json({
      success: true,
      data: result,
      raw: {
        title: pageTitle,
        description: metaDesc,
        keywords: metaKw,
        textContent: combinedText,
        subpagesCrawled: crawledCount
      }
    });

  } catch (e) {
    return res.status(500).json({
      error: 'Failed to fetch website',
      detail: e.message || String(e),
      code: e.code || ''
    });
  }
};

// --- Helper: Build URL priority list favoring Chinese versions ---
function buildChineseUrlPriority(originalUrl) {
  const urls = [];
  const parsed = new URL(originalUrl);
  const hostname = parsed.hostname;
  
  // Strategy 1: Try original URL FIRST (fastest path — many sites are already Chinese)
  urls.push(originalUrl);
  
  // Strategy 2: Try Chinese language paths on the SAME domain (fast — same server)
  // Only add /zh if original path is just /
  if (parsed.pathname === '/' || parsed.pathname === '') {
    urls.push(parsed.origin + '/zh/');
  }
  
  // Strategy 3: If it's a .com domain, try .cn (only ONE alternate domain to save time)
  if (hostname.endsWith('.com') && !hostname.endsWith('.com.cn')) {
    const cnDomain = hostname.replace(/\.com$/, '.cn');
    urls.push(parsed.protocol + '//' + cnDomain + '/');
  }
  
  // Deduplicate
  return [...new Set(urls)];
}

// --- Helper: Fetch a single page ---
async function fetchPage(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie': 'locale=zh_CN; language=zh-CN; lang=zh; region=CN; country=CN; i18n_redirected=zh'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) return { ok: false, status: response.status };
    const html = await response.text();
    return { ok: true, html };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// --- Helper: Find key subpages from homepage HTML ---
function findKeySubpages(html, baseUrl) {
  const links = [];
  // Keywords that indicate important pages
  const keywords = [
    /关于我们|关于丰疆|about[\s-]*us|公司简介|公司介绍|走进|company|about/i,
    /联系我们|contact[\s-]*us|联系方式|联系|contact/i,
    /产品中心|products?|主营产品|产品展示|solutions?|服务/i,
    /案例|projects?|工程案例|成功案例|case/i,
    /新闻|news|动态|资讯|blog/i
  ];

  // Extract all <a> links
  const linkMatches = html.matchAll(/<a[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const seen = new Set();

  for (const m of linkMatches) {
    let href = m[1].trim();
    const linkText = m[2].replace(/<[^>]+>/g, '').trim();

    // Skip external links, anchors, javascript, files
    if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (/\.(pdf|jpg|png|gif|zip|doc|mp4|mp3)$/i.test(href)) continue;

    // Resolve relative URLs
    try {
      const resolved = new URL(href, baseUrl.origin);
      // Only same domain
      if (resolved.hostname !== baseUrl.hostname) continue;
      href = resolved.href;
    } catch { continue; }

    if (seen.has(href)) continue;

    // Check if link text or href matches our keywords
    const combined = linkText + ' ' + href;
    for (const kw of keywords) {
      if (kw.test(combined)) {
        seen.add(href);
        links.push(href);
        break;
      }
    }
  }

  return links;
}

// --- Helper: Guess common subpages when no links found (SPA fallback) ---
function guessCommonSubpages(baseUrl) {
  // Prioritized: most company sites use these paths
  const commonPaths = [
    '/about', '/about.html', '/aboutus', '/about-us', '/about/contacts',
    '/contact', '/contact.html', '/contactus', '/contact-us', '/contacts',
    '/products', '/product', '/products.html',
    '/company', '/introduction', '/join', '/join-us'
  ];
  
  return commonPaths.map(p => baseUrl.origin + p);
}

// --- Helper: Extract content from SPA JS bundles ---
async function extractSPAContent(html, baseUrl) {
  // Find JS bundle URLs — include app chunks, named chunks, exclude vendor/lib
  const jsMatches = html.matchAll(/(?:src|href)=["']([^"']*\.js)["']/gi);
  const jsUrls = [];
  const seen = new Set();
  for (const m of jsMatches) {
    let jsUrl = m[1];
    // Skip vendor/library/runtime chunks
    if (/chunk-(?:elementUI|libs|vendor|runtime)|runtime\.|jweixin/i.test(jsUrl)) continue;
    try {
      jsUrl = new URL(jsUrl, baseUrl.origin).href;
      if (seen.has(jsUrl)) continue;
      seen.add(jsUrl);
      jsUrls.push(jsUrl);
    } catch {}
  }

  if (jsUrls.length === 0) return '';

  // Fetch up to 5 JS files (app + page chunks likely contain content)
  const results = await Promise.allSettled(
    jsUrls.slice(0, 5).map(u => fetchPage(u, 6000))
  );

  let extracted = '';
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      const js = r.value.html; // it's JS code but stored as text
      // Extract Chinese text strings from JS (between quotes, min 4 chars)
      const chineseStrings = js.match(/["'`]([\u4e00-\u9fa5][\u4e00-\u9fa5\w\s，。、：；！？（）\-—·""''《》【】\d.%/]{3,300})["'`]/g);
      if (chineseStrings) {
        const uniqueTexts = [...new Set(chineseStrings.map(s => s.slice(1, -1)))];
        extracted += uniqueTexts.join(' ') + ' ';
      }
      // Also extract phone numbers and emails from JS
      const phones = js.match(/["'](1[3-9]\d{9}|0\d{2,3}[-]?\d{7,8}|400[-]?\d{3,4}[-]?\d{3,4})["']/g);
      if (phones) extracted += phones.map(p => p.slice(1, -1)).join(' ') + ' ';
      const emails = js.match(/["']([\w.+-]+@[\w-]+\.[\w.-]+)["']/g);
      if (emails) extracted += emails.map(e => e.slice(1, -1)).join(' ') + ' ';
    }
  }

  return extracted.substring(0, 8000);
}

// --- Helper: HTML to plain text ---
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Extraction functions ---

function extractCompanyName(title, text) {
  if (title) {
    const cleaned = title.replace(/[-_|–—].*?(官网|首页|home|index|welcome).*/i, '').trim();
    const companyMatch = cleaned.match(/([\u4e00-\u9fa5]{2,}(?:集团|公司|科技|农业|设备|机械|有限公司|股份|技术)[\u4e00-\u9fa5]*)/);
    if (companyMatch) return companyMatch[1];
    if (cleaned.length > 2 && cleaned.length < 30) return cleaned;
  }
  const textMatch = text.match(/([\u4e00-\u9fa5]{2,}(?:智能|自动化|农业|温室|园艺|物联)?[\u4e00-\u9fa5]*(?:科技|设备|机械|集团|技术|数据)(?:有限|股份)?公司)/);
  if (textMatch) return textMatch[1];
  return '';
}

function extractLocation(text) {
  // Try to find explicit address first
  const addrMatch = text.match(/(?:地址|地点|位于|总部|坐落于|Address|address|公司地址)[：:\s在于]*([^。，,\n]{3,80})/i);
  if (addrMatch) {
    let addr = addrMatch[1].trim();
    // Clean up leading prepositions
    addr = addr.replace(/^[在于的]+/, '');
    // Try to extract province+city from address
    const provCityMatch = addr.match(/([\u4e00-\u9fa5]{2,5}(?:省|自治区))?[省]?([\u4e00-\u9fa5]{2,6}(?:市))/);
    if (provCityMatch) {
      const prov = provCityMatch[1] || '';
      const city = provCityMatch[2] || '';
      return '中国' + prov + city;
    }
    // Direct city match
    const directCity = addr.match(/(北京|上海|天津|重庆|[\u4e00-\u9fa5]{2,4}市)/);
    if (directCity) return '中国' + directCity[1];
    if (addr.length > 3 && addr.length < 40) return addr;
  }

  // Try country + international patterns (require word boundary to avoid partial matches like "locations")
  const intlMatch = text.match(/(?:headquartered?|based) in[:\s]+([A-Za-z, ]{3,40})/i);
  if (intlMatch) return intlMatch[1].trim();

  const provinces = ['北京','上海','天津','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','内蒙古','广西','西藏','宁夏','新疆'];
  const cities = ['潍坊','寿光','青岛','济南','杭州','上海','北京','深圳','广州','成都','武汉','南京','苏州','无锡','常州','泰安','聊城','临沂','烟台','威海','淄博','济宁','日照','德州','滨州','东营','菏泽','枣庄','莱芜','天津','西安','长沙','郑州','石家庄','合肥','福州','厦门','昆明','贵阳','南宁','南昌','太原','兰州','海口','银川','呼和浩特','乌鲁木齐','拉萨','西宁','大连','宁波','温州','东莞','佛山','中山','珠海','惠州','嘉兴','绍兴','台州','金华','湖州','漳州','泉州','保定','唐山','廊坊','洛阳','邯郸','徐州','连云港','盐城','扬州','镇江','泰州','南通','芜湖','马鞍山','蚌埠','襄阳','宜昌','岳阳','株洲','湘潭','柳州','桂林'];
  
  for (const city of cities) {
    if (text.includes(city)) {
      const idx = text.indexOf(city);
      const context = text.substring(Math.max(0, idx - 30), idx + 30);
      for (const prov of provinces) {
        if (context.includes(prov)) return '中国' + prov + (prov.endsWith('省') ? '' : '省') + city + '市';
      }
      for (const prov of provinces) {
        if (text.includes(prov)) return '中国' + prov + (prov.endsWith('省') || prov.endsWith('市') ? '' : '省') + city + '市';
      }
      return '中国' + city + '市';
    }
  }
  for (const prov of provinces) {
    if (text.includes(prov)) return '中国' + prov;
  }
  return '';
}

function extractContact(html, text) {
  const phones = [];
  const emails = [];

  // Extract phones from tel: links in HTML (most reliable source)
  const telLinks = html.match(/href=["']tel:([^"']+)["']/gi);
  if (telLinks) {
    telLinks.forEach(m => {
      const num = m.replace(/href=["']tel:/i, '').replace(/["']$/, '').replace(/[\s-]/g, '');
      if (num.length >= 7 && !phones.includes(num)) phones.push(num);
    });
  }

  // Extract phones with prefix keywords
  const phoneMatches = text.match(/(?:电话|Tel|Phone|联系电话|手机|Mobile|热线|咨询|询价|商务|媒体)[：:\s]*([0-9\-+() ]{7,20})/gi);
  if (phoneMatches) {
    phoneMatches.slice(0, 5).forEach(m => {
      let num = m.replace(/.*[：:\s]/, '').trim();
      // Clean up formatting
      const cleanNum = num.replace(/[\s()\-]/g, '');
      // Accept numbers starting with valid phone prefixes
      if (cleanNum.length >= 7 && cleanNum.length <= 15 && !phones.includes(num) && /^[\+0-9]/.test(cleanNum)) {
        phones.push(num);
      }
    });
  }
  // Match standalone phone patterns
  const phonePattern = text.match(/(?:1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8}|400[-\s]?\d{3,4}[-\s]?\d{3,4}|400\d{7})/g);
  if (phonePattern) {
    phonePattern.slice(0, 5).forEach(p => {
      if (!phones.includes(p)) phones.push(p);
    });
  }

  // Extract emails from mailto: links (most reliable)
  const mailtoLinks = html.match(/href=["']mailto:([^"'?]+)/gi);
  if (mailtoLinks) {
    mailtoLinks.forEach(m => {
      const email = m.replace(/href=["']mailto:/i, '').trim();
      if (email && !emails.includes(email) && !email.includes('example') && !email.includes('test')) {
        emails.push(email);
      }
    });
  }
  
  // Extract emails from text
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (emailMatch) {
    emailMatch.slice(0, 5).forEach(e => {
      if (!emails.includes(e) && !e.includes('example') && !e.includes('test')) emails.push(e);
    });
  }

  return {
    phones: phones.slice(0, 4).join('\n'),
    emails: emails.slice(0, 4).join('\n')
  };
}

// --- Helper: Render SPA page with headless Chrome (Puppeteer) ---
async function renderWithBrowser(url) {
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
    
    // Navigate and wait for JS to render (networkidle2 = no more than 2 connections for 500ms)
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    
    // Wait a bit more for late-rendering content
    await new Promise(r => setTimeout(r, 2000));
    
    // Extract text content and full HTML
    const result = await page.evaluate(() => {
      return {
        text: document.body ? document.body.innerText : '',
        html: document.documentElement ? document.documentElement.outerHTML : ''
      };
    });
    
    await browser.close();
    return result;
  } catch (e) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return null;
  }
}

// --- Helper: Lookup ICP registration info for a domain ---
async function lookupICP(domain) {
  try {
    // Use a public ICP query page to get company name
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(`https://icp.365jz.com/${domain}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Extract company name from ICP page
    // Pattern: 主办单位名称 followed by the company name
    const nameMatch = html.match(/主办单位名称[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i) ||
                      html.match(/主办单位名称[^<]*?[：:]\s*([\u4e00-\u9fa5][\u4e00-\u9fa5\w（）()]+)/);
    
    if (nameMatch) {
      const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
      if (name && name.length >= 4 && name.length <= 40) {
        return { name };
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

module.exports.config = {
  maxDuration: 60
};
