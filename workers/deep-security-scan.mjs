import axios from 'axios';
import puppeteer from 'puppeteer';
import Wappalyzer from 'wappalyzer';

const targetUrl = process.argv[2] || 'https://example.com';

const headerChecks = [
  { header: 'content-security-policy', purpose: 'Prevent XSS attacks' },
  { header: 'strict-transport-security', purpose: 'Enforce HTTPS' },
  { header: 'x-frame-options', purpose: 'Prevent clickjacking' },
  { header: 'x-content-type-options', purpose: 'Prevent MIME sniffing' },
  { header: 'referrer-policy', purpose: 'Protect referrer data' },
  { header: 'permissions-policy', purpose: 'Restrict browser APIs' },
  { header: 'cross-origin-opener-policy', purpose: 'Prevent cross-origin attacks' },
  { header: 'cross-origin-embedder-policy', purpose: 'Secure resource isolation' },
  { header: 'cross-origin-resource-policy', purpose: 'Control resource sharing' },
  { header: 'cache-control', purpose: 'Prevent sensitive caching' },
];

async function detectWithWappalyzer(url) {
  const wappalyzer = new Wappalyzer({
    debug: false,
    delay: 300,
    maxDepth: 1,
    maxUrls: 1,
    recursive: false,
    probe: true,
  });

  try {
    await wappalyzer.init();
    const site = await wappalyzer.open(url);
    const results = await site.analyze();
    return (results?.technologies || []).map((tech) => ({
      name: tech.name,
      version: tech.version || undefined,
      confidence: tech.confidence || undefined,
      categories: Array.isArray(tech.categories) ? tech.categories.map((c) => c.name) : [],
    }));
  } finally {
    await wappalyzer.destroy();
  }
}

async function scanWithPuppeteer(url) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const domStats = await page.evaluate(() => ({
      title: document.title,
      forms: document.querySelectorAll('form').length,
      buttons: document.querySelectorAll('button').length,
      links: document.querySelectorAll('a').length,
      scripts: document.querySelectorAll('script').length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
    }));

    return domStats;
  } finally {
    await browser.close();
  }
}

async function main() {
  const response = await axios.get(targetUrl, {
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: { 'User-Agent': 'RobolabDeepScanner/1.0' },
  });

  const normalizedHeaders = Object.fromEntries(
    Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])
  );

  const headerReport = headerChecks.map((check) => ({
    header: check.header,
    purpose: check.purpose,
    present: Boolean(normalizedHeaders[check.header]),
    value: normalizedHeaders[check.header] || null,
  }));

  const [techStack, domStats] = await Promise.all([
    detectWithWappalyzer(targetUrl).catch((error) => [{ name: 'Wappalyzer error', confidence: error.message, categories: [] }]),
    scanWithPuppeteer(targetUrl).catch((error) => ({ error: error.message })),
  ]);

  const report = {
    url: targetUrl,
    status: response.status,
    protocol: targetUrl.startsWith('https://') ? 'HTTPS' : 'HTTP',
    headers: headerReport,
    tech_stack: techStack,
    dom_stats: domStats,
    generated_at: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Deep security scan failed:', error);
  process.exit(1);
});
