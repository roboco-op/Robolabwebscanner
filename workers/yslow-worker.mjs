import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BATCH_SIZE = Math.max(1, Number(process.env.YSLOW_WORKER_BATCH_SIZE || '5'));
const LOOP_INTERVAL_MS = Math.max(10_000, Number(process.env.YSLOW_WORKER_INTERVAL_MS || '30000'));
const MAX_ASSET_SAMPLES = Math.max(5, Number(process.env.YSLOW_ASSET_SAMPLE_SIZE || '15'));
const ONCE = process.argv.includes('--once');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for yslow worker');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(input, baseUrl) {
  try {
    return new URL(input, baseUrl).href;
  } catch {
    return null;
  }
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 50) return 'E';
  return 'F';
}

function buildYSlowExplanation(result) {
  return `YSlow-compatible analysis score is ${result.overall_score}/100 (grade ${result.grade}). Main pressure points are request volume (${result.metrics.total_requests}), caching (${result.rule_scores.caching}/100), and compression (${result.rule_scores.compression}/100).`;
}

async function fetchAssetHeader(assetUrl) {
  try {
    const headResponse = await fetch(assetUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RobolabYSlowWorker/1.0)',
      },
    });

    if (!headResponse.ok) {
      return null;
    }

    return headResponse.headers;
  } catch {
    return null;
  }
}

async function analyzeYSlowCompatible(targetUrl, crawlResults) {
  const pageCandidates = Array.isArray(crawlResults)
    ? crawlResults
      .map((page) => (typeof page?.url === 'string' ? page.url : null))
      .filter(Boolean)
    : [];

  const selectedUrl = pageCandidates[0] || targetUrl;
  const response = await fetch(selectedUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RobolabYSlowWorker/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${selectedUrl} (HTTP ${response.status})`);
  }

  const html = await response.text();
  const mainHeaders = response.headers;
  const $ = load(html);

  const scripts = $('script[src]').map((_, el) => $(el).attr('src')).get().filter(Boolean);
  const stylesheets = $('link[rel="stylesheet"][href]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
  const images = $('img[src]').map((_, el) => $(el).attr('src')).get().filter(Boolean);

  const allAssetCandidates = [...scripts, ...stylesheets, ...images]
    .map((asset) => toAbsoluteUrl(asset, selectedUrl))
    .filter((asset) => !!asset);

  const uniqueAssets = Array.from(new Set(allAssetCandidates)).slice(0, MAX_ASSET_SAMPLES);

  let cacheHeaderHits = 0;
  let cacheTtlTotalSeconds = 0;
  let minifiedAssetHits = 0;

  for (const assetUrl of uniqueAssets) {
    const headers = await fetchAssetHeader(assetUrl);
    if (!headers) continue;

    const cacheControl = (headers.get('cache-control') || '').toLowerCase();
    const expires = headers.get('expires');

    if (cacheControl.includes('max-age=')) {
      cacheHeaderHits += 1;
      const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 0);
      cacheTtlTotalSeconds += Number.isFinite(maxAge) ? maxAge : 0;
    } else if (expires) {
      cacheHeaderHits += 1;
    }

    if (assetUrl.includes('.min.')) {
      minifiedAssetHits += 1;
    }
  }

  const redirects = response.redirected ? 1 : 0;
  const totalRequests = scripts.length + stylesheets.length + images.length + 1;
  const minifiedRatio = uniqueAssets.length > 0 ? minifiedAssetHits / uniqueAssets.length : 0;

  const compressedMainDoc = (() => {
    const encoding = (mainHeaders.get('content-encoding') || '').toLowerCase();
    return encoding.includes('gzip') || encoding.includes('br');
  })();

  const cookieBytes = (() => {
    const setCookie = mainHeaders.get('set-cookie') || '';
    return setCookie.length;
  })();

  const requestsScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, totalRequests - 30) * 2.2)));
  const compressionScore = compressedMainDoc ? 100 : 40;
  const cachingScore = uniqueAssets.length > 0
    ? Math.round((cacheHeaderHits / uniqueAssets.length) * 100)
    : 60;
  const minificationScore = Math.round(minifiedRatio * 100);
  const redirectsScore = redirects > 0 ? 70 : 100;
  const cookiesScore = cookieBytes === 0 ? 100 : Math.max(40, 100 - Math.round(cookieBytes / 40));

  const overallScore = Math.round(
    (requestsScore * 0.3) +
    (compressionScore * 0.15) +
    (cachingScore * 0.2) +
    (minificationScore * 0.15) +
    (redirectsScore * 0.1) +
    (cookiesScore * 0.1)
  );

  const recommendations = [];
  if (requestsScore < 75) recommendations.push('Reduce request count by bundling assets and removing unused dependencies.');
  if (compressionScore < 90) recommendations.push('Enable gzip or brotli compression for HTML, CSS, and JavaScript responses.');
  if (cachingScore < 80) recommendations.push('Apply long-lived cache headers to static assets with fingerprinted file names.');
  if (minificationScore < 70) recommendations.push('Serve minified JavaScript/CSS bundles in production builds.');
  if (cookieBytes > 500) recommendations.push('Reduce cookie payload size and avoid sending large cookies on static asset requests.');
  if (redirects > 0) recommendations.push('Avoid unnecessary redirects on the initial page request.');

  const avgCacheTtl = cacheHeaderHits > 0 ? Math.round(cacheTtlTotalSeconds / cacheHeaderHits) : 0;

  return {
    overall_score: overallScore,
    grade: scoreToGrade(overallScore),
    rule_scores: {
      requests: requestsScore,
      compression: compressionScore,
      caching: cachingScore,
      minification: minificationScore,
      redirects: redirectsScore,
      cookies: cookiesScore,
    },
    metrics: {
      total_requests: totalRequests,
      scripts: scripts.length,
      stylesheets: stylesheets.length,
      images: images.length,
      redirects,
      compressed_main_doc: compressedMainDoc,
      avg_asset_cache_ttl_seconds: avgCacheTtl,
      minified_asset_ratio: Number(minifiedRatio.toFixed(3)),
      cookie_bytes: cookieBytes,
    },
    recommendations,
    checked_at: new Date().toISOString(),
  };
}

async function processBatch() {
  const { data: rows, error } = await supabase
    .from('scan_results')
    .select('id, target_url, crawl_results, analysis_explanations')
    .eq('scan_status', 'completed')
    .is('yslow_score', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    throw error;
  }

  if (!rows || rows.length === 0) {
    console.log('No scan rows pending yslow analysis');
    return 0;
  }

  let processed = 0;

  for (const row of rows) {
    try {
      const yslow = await analyzeYSlowCompatible(row.target_url, row.crawl_results);
      const existingExplanations = row.analysis_explanations && typeof row.analysis_explanations === 'object'
        ? row.analysis_explanations
        : {};

      const { error: updateError } = await supabase
        .from('scan_results')
        .update({
          yslow_score: yslow.overall_score,
          yslow_results: yslow,
          analysis_explanations: {
            ...existingExplanations,
            yslow: buildYSlowExplanation(yslow),
          },
        })
        .eq('id', row.id);

      if (updateError) {
        throw updateError;
      }

      processed += 1;
      console.log(`YSlow updated for scan ${row.id}: ${yslow.overall_score}/100 (${yslow.grade})`);
    } catch (err) {
      console.error(`YSlow processing failed for scan ${row.id}:`, err);
    }
  }

  return processed;
}

async function main() {
  console.log(`Starting YSlow worker (once=${ONCE}, batch=${BATCH_SIZE})`);

  do {
    const processed = await processBatch();
    if (ONCE) break;
    if (processed === 0) {
      await sleep(LOOP_INTERVAL_MS);
    }
  } while (!ONCE);

  console.log('YSlow worker finished');
}

main().catch((err) => {
  console.error('YSlow worker fatal error:', err);
  process.exit(1);
});
