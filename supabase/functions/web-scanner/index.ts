import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Type definitions for scan results (duplicated from src/types/scan.ts for Deno compatibility)
type PerformanceResults = {
  score: number;
  load_time_ms: number;
  image_count?: number;
  scripts_count?: number;
  stylesheets_count?: number;
  compression_enabled?: boolean;
  caching_enabled?: boolean;
  lighthouse_scores?: { performance?: number; seo?: number; accessibility?: number; bestPractices?: number };
  core_web_vitals?: Record<string, number>;
  source?: string;
  page_speed_by_environment?: {
    mobile?: {
      score?: number;
      load_time_ms?: number;
      core_web_vitals?: Record<string, number>;
    };
    desktop?: {
      score?: number;
      load_time_ms?: number;
      core_web_vitals?: Record<string, number>;
    };
  };
  opportunities?: Array<{ title?: string; score?: number; savings?: number }>;
  diagnostics?: Array<{ title?: string; score?: number }>;
};

type SecurityResults = {
  issues: Array<{ severity: string; category?: string; description?: string; message?: string }>;
  checks_performed: number;
  checks_passed: number;
  https_enabled: boolean;
  protocol?: string;
  score?: number;
  security_headers?: Record<string, string>;
  header_checks?: Array<{
    header: string;
    purpose: string;
    present: boolean;
    value?: string;
    severity: 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
  recommendations?: string[];
  scanner_engine?: string;
};

type AccessibilityResults = {
  issues: Array<{ severity: string; message?: string; count?: number; wcag?: string }>;
  total_issues: number;
  score: number;
  wcag_level?: string;
};

type E2EResults = {
  buttons_found: number;
  links_found: number;
  forms_found: number;
  primary_actions: string[];
  error?: string;
};

type APIResults = {
  endpoints_detected: number;
  endpoints: Array<{ method: string; path: string; status: number }>;
  error?: string;
};

type TechStackResult = {
  detected: Array<{ name: string; confidence: string; version?: string; category: string }>;
  total_detected: number;
  error?: string;
};

type TopIssue = {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
};

type SEOResults = {
  missing_meta_tags?: string[];
  sitemap_detected?: boolean;
  structured_data_missing?: boolean;
  status?: 'pending' | 'completed' | 'failed';
  error?: string;
};

type AnalysisExplanations = {
  overall?: string;
  security?: string;
  performance?: string;
  accessibility?: string;
  api?: string;
  e2e?: string;
  seo?: string;
  yslow?: string;
};

type CrawlPageSummary = {
  url: string;
  depth: number;
  status: number;
  load_time_ms: number;
  html_bytes?: number;
  links_discovered?: number;
  title?: string;
  buttons_found?: number;
  links_found?: number;
  forms_found?: number;
};

type CrawlAggregate = {
  apiEndpoints: Array<{ method: string; path: string; status: number }>;
  buttons: number;
  links: number;
  forms: number;
  maxDepthReached: number;
  avgLoadTimeMs: number;
  pagesScanned: number;
};

type CrawlResult = {
  pages: CrawlPageSummary[];
  aggregate: CrawlAggregate;
  firstPageHtml: string | null;
};

const MAX_CRAWL_PAGES = Math.min(100, Math.max(1, Number(Deno.env.get("SCAN_MAX_PAGES") ?? "25")));
const MAX_CRAWL_DEPTH = Math.min(5, Math.max(1, Number(Deno.env.get("SCAN_MAX_DEPTH") ?? "3")));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
  "Origin-Agent-Cluster": "?1",
  "Cache-Control": "no-store",
};

interface ScanRequest {
  scanId?: string;
  url?: string;
  mode?: "enqueue" | "process-next" | "process-yslow";
}

type ScanJobStatus = "queued" | "retry_wait" | "processing" | "completed" | "dead_letter";

interface ScanJobRow {
  id: string;
  scan_id: string;
  target_url: string;
  status: ScanJobStatus;
  attempt_count: number;
  max_attempts: number;
  next_run_at: string;
  leased_until: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: ScanRequest = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (body.mode === "process-next") {
      const workerResult = await processNextQueuedJob(supabase);
      return new Response(
        JSON.stringify({ success: true, ...workerResult }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.mode === "process-yslow") {
      const yslowResult = await processYSlowSyncBatch(supabase, body.scanId);
      return new Response(
        JSON.stringify({ success: true, ...yslowResult }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const scanId = body.scanId;
    const url = body.url;

    if (!scanId || !url) {
      return new Response(
        JSON.stringify({ error: "scanId and url are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Queueing scan for ${url} with ID ${scanId}`);

    const { error: enqueueError } = await supabase
      .from("scan_jobs")
      .upsert({
        scan_id: scanId,
        target_url: url,
        status: "queued",
        next_run_at: new Date().toISOString(),
        leased_until: null,
        last_error: null,
      }, {
        onConflict: "scan_id",
      });

    if (enqueueError) {
      console.error("Failed to enqueue scan job:", enqueueError);
      return new Response(
        JSON.stringify({ error: "Failed to queue scan job" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from("scan_results")
      .update({ scan_status: "pending" })
      .eq("id", scanId);

    return new Response(
      JSON.stringify({ success: true, scanId, message: "Scan queued" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Request error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid request",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processNextQueuedJob(supabase: ReturnType<typeof createClient>) {
  const nowIso = new Date().toISOString();

  await supabase
    .from("scan_jobs")
    .update({
      status: "retry_wait",
      leased_until: null,
      next_run_at: nowIso,
      last_error: "Worker lease expired; re-queued",
      updated_at: nowIso,
    })
    .eq("status", "processing")
    .lt("leased_until", nowIso);

  const { data: candidate } = await supabase
    .from("scan_jobs")
    .select("id, scan_id, target_url, status, attempt_count, max_attempts, next_run_at, leased_until")
    .in("status", ["queued", "retry_wait"])
    .lte("next_run_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ScanJobRow>();

  if (!candidate) {
    return { processed: false, reason: "no_jobs" };
  }

  const leaseUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const nextAttempt = (candidate.attempt_count || 0) + 1;

  const { data: leasedJob, error: leaseError } = await supabase
    .from("scan_jobs")
    .update({
      status: "processing",
      leased_until: leaseUntil,
      attempt_count: nextAttempt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .in("status", ["queued", "retry_wait"])
    .select("id, scan_id, target_url, attempt_count, max_attempts")
    .maybeSingle<Pick<ScanJobRow, "id" | "scan_id" | "target_url" | "attempt_count" | "max_attempts">>();

  if (leaseError || !leasedJob) {
    console.warn("Could not lease job", leaseError);
    return { processed: false, reason: "lease_conflict" };
  }

  const runResult = await processScan(leasedJob.scan_id, leasedJob.target_url, supabase);

  if (runResult.success) {
    await supabase
      .from("scan_jobs")
      .update({
        status: "completed",
        leased_until: null,
        last_error: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leasedJob.id);

    return { processed: true, jobId: leasedJob.id, status: "completed" };
  }

  const maxAttempts = leasedJob.max_attempts || 3;
  const attemptCount = leasedJob.attempt_count || 1;
  const hasRetriesLeft = attemptCount < maxAttempts;
  const backoffSeconds = Math.min(300, 15 * Math.pow(2, Math.max(0, attemptCount - 1)));
  const nextRunAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

  await supabase
    .from("scan_jobs")
    .update({
      status: hasRetriesLeft ? "retry_wait" : "dead_letter",
      leased_until: null,
      next_run_at: hasRetriesLeft ? nextRunAt : nowIso,
      last_error: runResult.error || "Scan failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", leasedJob.id);

  return {
    processed: true,
    jobId: leasedJob.id,
    status: hasRetriesLeft ? "retry_wait" : "dead_letter",
    error: runResult.error || "Scan failed",
  };
}

function getYSlowGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  if (score >= 50) return "E";
  return "F";
}

function buildYSlowFromStoredResults(scanRow: { performance_results?: Record<string, unknown> | null; crawl_results?: unknown[] | null }) {
  const performance = (scanRow.performance_results || {}) as Record<string, unknown>;
  const crawl = Array.isArray(scanRow.crawl_results) ? scanRow.crawl_results : [];

  const scripts = Number(performance.scripts_count || 0);
  const stylesheets = Number(performance.stylesheets_count || 0);
  const images = Number(performance.images_count || performance.image_count || 0);
  const totalRequests = Math.max(1, scripts + stylesheets + images + 1);
  const compressed = Boolean(performance.compression_enabled);
  const mainDocumentNeedsImprovement = !compressed;
  const cached = Boolean(performance.caching_enabled);
  const redirects = 0;

  const requestsScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, totalRequests - 30) * 2.2)));
  const compressionScore = compressed ? 100 : 40;
  const cachingScore = cached ? 90 : 45;
  const minificationScore = scripts > 0 ? 65 : 80;
  const redirectsScore = redirects > 0 ? 70 : 100;
  const cookiesScore = 85;

  const overallScore = Math.round(
    (requestsScore * 0.3) +
    (compressionScore * 0.15) +
    (cachingScore * 0.2) +
    (minificationScore * 0.15) +
    (redirectsScore * 0.1) +
    (cookiesScore * 0.1)
  );

  const avgLoad = crawl.length > 0
    ? Math.round(crawl.reduce((sum, page) => sum + Number((page as Record<string, unknown>)?.load_time_ms || 0), 0) / crawl.length)
    : Number(performance.load_time_ms || 0);

  return {
    overall_score: overallScore,
    grade: getYSlowGrade(overallScore),
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
      scripts,
      stylesheets,
      images,
      redirects,
      compressed_main_doc: mainDocumentNeedsImprovement,
      avg_asset_cache_ttl_seconds: cached ? 86400 : 0,
      minified_asset_ratio: scripts > 0 ? 0.65 : 1,
      cookie_bytes: 0,
      avg_load_time_ms: avgLoad,
    },
    recommendations: [
      requestsScore < 75 ? "Reduce request count by bundling assets and removing unused dependencies." : "Keep request counts stable as pages evolve.",
      compressionScore < 90 ? "Enable gzip or brotli compression for HTML/CSS/JS responses." : "Maintain compression on all text-based responses.",
      cachingScore < 80 ? "Apply long-lived cache headers to fingerprinted static assets." : "Preserve strong cache directives for static assets.",
      "Regularly audit render-blocking resources and oversized bundles.",
    ],
    checked_at: new Date().toISOString(),
  };
}

async function processYSlowSyncBatch(supabase: ReturnType<typeof createClient>, targetScanId?: string) {
  let query = supabase
    .from("scan_results")
    .select("id, target_url, performance_results, crawl_results, analysis_explanations")
    .eq("scan_status", "completed")
    .is("yslow_score", null)
    .order("created_at", { ascending: true });

  if (targetScanId) {
    query = query.eq("id", targetScanId).limit(1);
  } else {
    query = query.limit(3);
  }

  const { data: pendingRows, error: fetchError } = await query;

  if (fetchError) {
    console.error("YSlow fetch error:", fetchError);
    return { processed: 0, error: "fetch_failed" };
  }

  if (!pendingRows || pendingRows.length === 0) {
    return { processed: 0, reason: targetScanId ? "target_not_found_or_already_processed" : "no_rows" };
  }

  let processed = 0;

  for (const row of pendingRows) {
    const yslow = buildYSlowFromStoredResults(row as { performance_results?: Record<string, unknown> | null; crawl_results?: unknown[] | null });
    const existingExplanations = (row as Record<string, unknown>).analysis_explanations as Record<string, unknown> | null;

    const { error: updateError } = await supabase
      .from("scan_results")
      .update({
        yslow_score: yslow.overall_score,
        yslow_results: yslow,
        analysis_explanations: {
          ...(existingExplanations || {}),
          yslow: `Structure Score is ${yslow.overall_score}/100 (grade ${yslow.grade}). Best-Practice Optimization Score highlights request volume (${yslow.metrics.total_requests}), caching (${yslow.rule_scores.caching}/100), and compression (${yslow.rule_scores.compression}/100).`,
        },
      })
      .eq("id", (row as Record<string, unknown>).id as string);

    if (!updateError) {
      processed += 1;
    } else {
      console.error("YSlow update failed", updateError);
    }
  }

  return { processed };
}

async function processScan(scanId: string, url: string, supabase: ReturnType<typeof createClient>): Promise<{ success: boolean; error?: string }> {
  try {
    const scanStartMs = Date.now();
    await supabase
      .from("scan_results")
      .update({ scan_status: "processing" })
      .eq("id", scanId);

    console.log("Status updated to processing");

    const domain = new URL(url).hostname;

    const { data: rateLimit } = await supabase
      .from("rate_limits")
      .select("*")
      .eq("domain", domain)
      .maybeSingle();

    if (rateLimit) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (new Date(rateLimit.window_start) > hourAgo && rateLimit.scan_count >= 5) {
        console.log(`Rate limit exceeded for ${domain}`);
        await supabase
          .from("scan_results")
          .update({ scan_status: "failed" })
          .eq("id", scanId);

        return { success: false, error: "Rate limit exceeded for this domain" };
      }

      await supabase
        .from("rate_limits")
        .update({
          scan_count: rateLimit.scan_count + 1,
          last_scan_at: new Date().toISOString(),
        })
        .eq("domain", domain);
    } else {
      await supabase.from("rate_limits").insert({
        domain,
        scan_count: 1,
        window_start: new Date().toISOString(),
        last_scan_at: new Date().toISOString(),
      });
    }

    console.log(`Crawling site (max pages: ${MAX_CRAWL_PAGES}, max depth: ${MAX_CRAWL_DEPTH})...`);
    const crawlResult = await crawlInternalPages(url, MAX_CRAWL_PAGES, MAX_CRAWL_DEPTH);
    const primaryScanUrl = crawlResult.pages[0]?.url || url;

    console.log(`Performing detailed scans on primary page: ${primaryScanUrl}`);
    const scanResults = await performScan(primaryScanUrl);

    if (crawlResult.aggregate.apiEndpoints.length > 0) {
      scanResults.api = {
        endpoints_detected: crawlResult.aggregate.apiEndpoints.length,
        endpoints: crawlResult.aggregate.apiEndpoints.slice(0, 20),
        status: "completed",
      };
    }

    scanResults.e2e = {
      buttons_found: crawlResult.aggregate.buttons,
      links_found: crawlResult.aggregate.links,
      forms_found: crawlResult.aggregate.forms,
      primary_actions: scanResults.e2e?.primary_actions || [],
      status: scanResults.e2e?.status || "completed",
      error: scanResults.e2e?.error,
    };

    if (scanResults.performance?.status === "completed") {
      scanResults.performance.load_time_ms =
        crawlResult.aggregate.avgLoadTimeMs > 0
          ? crawlResult.aggregate.avgLoadTimeMs
          : (scanResults.performance.load_time_ms || 0);
    }

    console.log(`Scans completed across ${crawlResult.aggregate.pagesScanned} crawled pages`);

    const topIssues = extractTopIssues(scanResults);
    const overallScore = calculateOverallScore(scanResults);

    console.log(`Overall score: ${overallScore}, top issues: ${topIssues.length}`);

    // Extract preview image and SEO indicators
    let ogImage: string | null = null;
    let previewImageSource: PreviewImageSource = "none";
    let seoResults: SEOResults = { status: 'completed' };
    try {
      let html: string | null = crawlResult.firstPageHtml;

      if (!html) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(primaryScanUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          html = await response.text();
        }
      }

      if (html) {
        const previewImage = extractPreviewImage(html, primaryScanUrl);
        ogImage = previewImage.url;
        previewImageSource = previewImage.source;
        seoResults = extractSEOResults(html, primaryScanUrl);
        if (ogImage) {
          console.log(`Preview image found (${previewImageSource}): ${ogImage}`);
        } else {
          console.log("No preview image found (og/twitter/jsonld/img)");
        }
      }
    } catch (ogError) {
      console.log("Failed to extract preview image:", ogError);
      seoResults = { status: 'failed', error: 'Unable to compute SEO indicators' };
    }

    const performanceScore = scanResults.performance?.score || scanResults.performance?.lighthouse_scores?.performance || 0;
    const seoScore = scanResults.performance?.lighthouse_scores?.seo || 0;
    const accessibilityIssueCount = scanResults.accessibility?.total_issues || 0;
    const securityIssues = scanResults.security?.issues || [];
    const securityChecksTotal = scanResults.security?.checks_performed || 19;
    const securityChecksPassed = scanResults.security?.checks_passed ?? Math.max(0, securityChecksTotal - securityIssues.length);
    const technologies = scanResults.techStack?.detected?.map((t) => t.name) || [];
    const exposedEndpoints = scanResults.api?.endpoints?.map((e) => e.path) || [];
    const scanDurationMs = Date.now() - scanStartMs;
    const hasMobilePageSpeed = typeof scanResults.performance?.page_speed_by_environment?.mobile?.score === 'number';
    const hasDesktopPageSpeed = typeof scanResults.performance?.page_speed_by_environment?.desktop?.score === 'number';
    const scanEnvironment = hasMobilePageSpeed && hasDesktopPageSpeed
      ? 'mobile+desktop'
      : hasDesktopPageSpeed
        ? 'desktop'
        : hasMobilePageSpeed
          ? 'mobile'
          : (scanResults.performance?.source === 'google-pagespeed' ? 'mobile' : 'desktop');

    let aiSummary = null;
    let aiRecommendations = [];
    let analysisExplanations: AnalysisExplanations = buildFallbackExplanations(url, scanResults, overallScore, seoScore, seoResults);

    try {
      console.log("Generating AI analysis...");
      const aiAnalysis = await generateAIAnalysis(url, scanResults, topIssues, overallScore, analysisExplanations, seoResults);
      aiSummary = aiAnalysis.summary;
      aiRecommendations = aiAnalysis.recommendations;
      analysisExplanations = {
        ...analysisExplanations,
        ...(aiAnalysis.explanations || {}),
      };
      console.log("AI analysis completed");
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
    }

    console.log("Skipping PDF generation (disabled)");

    const { error: updateError } = await supabase
      .from("scan_results")
      .update({
        scan_status: "completed",
        overall_score: overallScore,
        e2e_results: scanResults.e2e,
        api_results: scanResults.api,
        security_results: scanResults.security,
        performance_results: scanResults.performance,
        accessibility_results: scanResults.accessibility,
        tech_stack: scanResults.techStack,
        top_issues: topIssues,
        ai_summary: aiSummary,
        ai_recommendations: aiRecommendations,
        performance_score: performanceScore,
        seo_score: seoScore,
        seo_results: seoResults,
        analysis_explanations: analysisExplanations,
        accessibility_issue_count: accessibilityIssueCount,
        security_checks_passed: securityChecksPassed,
        security_checks_total: securityChecksTotal,
        technologies: technologies,
        exposed_endpoints: exposedEndpoints,
        og_image: ogImage,
        preview_image_source: previewImageSource,
        crawl_results: crawlResult.pages,
        yslow_score: null,
        yslow_results: null,
        scan_duration_ms: scanDurationMs,
        pages_scanned: crawlResult.aggregate.pagesScanned,
        scan_depth: crawlResult.aggregate.maxDepthReached + 1,
        scan_environment: scanEnvironment,
      })
      .eq("id", scanId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    console.log("Scan completed successfully");
    return { success: true };
  } catch (error) {
    console.error("Scan processing error:", error);

    try {
      await supabase
        .from("scan_results")
        .update({ scan_status: "failed" })
        .eq("id", scanId);
    } catch (updateErr) {
      console.error("Failed to update scan status to failed:", updateErr);
    }

    return { success: false, error: error instanceof Error ? error.message : "Scan processing failed" };
  }
}

function normalizeCrawlUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
}

function shouldSkipCrawlAsset(url: URL): boolean {
  return /\.(?:pdf|zip|jpg|jpeg|png|gif|svg|webp|ico|mp4|mp3|avi|mov|xml|json|txt|csv|woff2?|ttf|eot)(?:$|\?)/i.test(url.pathname);
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 200);
}

function extractInternalLinks(html: string, pageUrl: string, rootOrigin: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  const matches = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)];
  for (const match of matches) {
    const href = (match[1] || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }

    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin !== rootOrigin) continue;
      if (shouldSkipCrawlAsset(resolved)) continue;

      const normalized = normalizeCrawlUrl(resolved.toString());
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      continue;
    }
  }

  return links;
}

function extractApiEndpointsFromHtml(html: string, pageUrl: string): Array<{ method: string; path: string; status: number }> {
  const endpoints: Array<{ method: string; path: string; status: number }> = [];
  const endpointSet = new Set<string>();
  const baseUrl = new URL(pageUrl);

  const addEndpoint = (rawPath: string, method = "GET") => {
    const trimmed = rawPath?.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:")) {
      return;
    }

    try {
      const resolved = new URL(trimmed, baseUrl);
      if (resolved.origin !== baseUrl.origin) return;
      const normalizedPath = `${resolved.pathname}${resolved.search}`;
      if (!normalizedPath.startsWith("/")) return;

      const key = `${method.toUpperCase()} ${normalizedPath}`;
      if (endpointSet.has(key)) return;

      endpointSet.add(key);
      endpoints.push({ method: method.toUpperCase(), path: normalizedPath, status: 0 });
    } catch {
      return;
    }
  };

  const fetchRegex = /fetch\s*\(\s*["']([^"']+)["']/gi;
  let fetchMatch;
  while ((fetchMatch = fetchRegex.exec(html)) !== null) {
    addEndpoint(fetchMatch[1], "GET");
  }

  const axiosMethodRegex = /axios\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi;
  let axiosMethodMatch;
  while ((axiosMethodMatch = axiosMethodRegex.exec(html)) !== null) {
    addEndpoint(axiosMethodMatch[2], axiosMethodMatch[1]);
  }

  const xhrRegex = /\.open\s*\(\s*["'](GET|POST|PUT|PATCH|DELETE)["']\s*,\s*["']([^"']+)["']/gi;
  let xhrMatch;
  while ((xhrMatch = xhrRegex.exec(html)) !== null) {
    addEndpoint(xhrMatch[2], xhrMatch[1]);
  }

  const formActionRegex = /<form[^>]*action=["']([^"']+)["'][^>]*>/gi;
  let formMatch;
  while ((formMatch = formActionRegex.exec(html)) !== null) {
    addEndpoint(formMatch[1], "POST");
  }

  return endpoints;
}

async function crawlInternalPages(startUrl: string, maxPages: number, maxDepth: number): Promise<CrawlResult> {
  const root = new URL(startUrl);
  const rootOrigin = root.origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizeCrawlUrl(startUrl), depth: 0 }];
  const visited = new Set<string>();
  const pages: CrawlPageSummary[] = [];
  const allApiEndpoints = new Map<string, { method: string; path: string; status: number }>();

  let totalLoadTime = 0;
  let firstPageHtml: string | null = null;

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift();
    if (!next) break;

    const normalized = normalizeCrawlUrl(next.url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const startedAt = performance.now();
    let response: Response | null = null;
    let html = "";
    let links: string[] = [];
    let status = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      response = await fetch(normalized, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      status = response.status;

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || !contentType.includes("text/html")) {
        const loadTime = Math.max(1, Math.round(performance.now() - startedAt));
        pages.push({
          url: normalized,
          depth: next.depth,
          status,
          load_time_ms: loadTime,
          html_bytes: 0,
          links_discovered: 0,
          buttons_found: 0,
          links_found: 0,
          forms_found: 0,
        });
        totalLoadTime += loadTime;
        continue;
      }

      html = await response.text();
      if (!firstPageHtml) {
        firstPageHtml = html;
      }

      links = extractInternalLinks(html, normalized, rootOrigin);
      const apiEndpoints = extractApiEndpointsFromHtml(html, normalized);
      for (const endpoint of apiEndpoints) {
        allApiEndpoints.set(`${endpoint.method} ${endpoint.path}`, endpoint);
      }

      const buttonsFound = (html.match(/<button[^>]*>|<input[^>]*type=["'](?:button|submit)["'][^>]*>/gi) || []).length;
      const linksFound = (html.match(/<a[^>]*href=["'][^"']+["'][^>]*>/gi) || []).length;
      const formsFound = (html.match(/<form[^>]*>/gi) || []).length;
      const loadTime = Math.max(1, Math.round(performance.now() - startedAt));

      pages.push({
        url: normalized,
        depth: next.depth,
        status,
        load_time_ms: loadTime,
        html_bytes: html.length,
        links_discovered: links.length,
        title: extractTitle(html),
        buttons_found: buttonsFound,
        links_found: linksFound,
        forms_found: formsFound,
      });

      totalLoadTime += loadTime;

      if (next.depth < maxDepth) {
        for (const link of links) {
          if (!visited.has(link) && queue.length + pages.length < maxPages * 2) {
            queue.push({ url: link, depth: next.depth + 1 });
          }
        }
      }
    } catch (error) {
      console.warn(`Crawl failed for ${normalized}:`, error);
      const loadTime = Math.max(1, Math.round(performance.now() - startedAt));
      pages.push({
        url: normalized,
        depth: next.depth,
        status: status || 0,
        load_time_ms: loadTime,
        html_bytes: html.length || 0,
        links_discovered: links.length || 0,
        buttons_found: 0,
        links_found: 0,
        forms_found: 0,
      });
      totalLoadTime += loadTime;
    }
  }

  const aggregate: CrawlAggregate = {
    apiEndpoints: Array.from(allApiEndpoints.values()),
    buttons: pages.reduce((sum, page) => sum + (page.buttons_found || 0), 0),
    links: pages.reduce((sum, page) => sum + (page.links_found || 0), 0),
    forms: pages.reduce((sum, page) => sum + (page.forms_found || 0), 0),
    maxDepthReached: pages.reduce((maxDepthReached, page) => Math.max(maxDepthReached, page.depth), 0),
    avgLoadTimeMs: pages.length > 0 ? Math.round(totalLoadTime / pages.length) : 0,
    pagesScanned: pages.length,
  };

  return {
    pages,
    aggregate,
    firstPageHtml,
  };
}

function extractSEOResults(html: string, url: string): SEOResults {
  const missingMetaTags: string[] = [];

  const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);

  if (!hasTitle) missingMetaTags.push('title');
  if (!hasMetaDescription) missingMetaTags.push('meta description');
  if (!hasCanonical) missingMetaTags.push('canonical');

  const structuredDataPresent = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
  const sitemapDetected = /sitemap/i.test(html) || /\/sitemap\.xml/i.test(html);

  return {
    missing_meta_tags: missingMetaTags,
    sitemap_detected: sitemapDetected,
    structured_data_missing: !structuredDataPresent,
    status: 'completed',
  };
}

type PipelineSection<T> = T & { status?: 'pending' | 'completed' | 'failed'; error?: string };
type PipelineResults = {
  e2e?: PipelineSection<E2EResults>;
  api?: PipelineSection<APIResults>;
  security?: PipelineSection<SecurityResults>;
  performance?: PipelineSection<PerformanceResults>;
  accessibility?: PipelineSection<AccessibilityResults>;
  techStack?: PipelineSection<TechStackResult>;
};

async function performScan(url: string): Promise<PipelineResults> {
  const results: PipelineResults = {
    e2e: { status: 'pending' },
    api: { status: 'pending' },
    security: { status: 'pending' },
    performance: { status: 'pending' },
    accessibility: { status: 'pending' },
    techStack: { status: 'pending' },
  };

  try {
    results.e2e = await performE2EScan(url);
  } catch (err) {
    console.error("E2E scan error:", err);
    results.e2e = { error: "E2E scan failed", status: "failed" };
  }

  try {
    results.api = await performAPIScan(url);
  } catch (err) {
    console.error("API scan error:", err);
    results.api = { error: "API scan failed", status: "failed" };
  }

  try {
    results.security = await performSecurityScan(url);
  } catch (err) {
    console.error("Security scan error:", err);
    results.security = { error: "Security scan failed", status: "failed" };
  }

  try {
    results.performance = await performPerformanceScan(url);
  } catch (err) {
    console.error("Performance scan error:", err);
    results.performance = { error: "Performance scan failed", status: "failed" };
  }

  try {
    results.accessibility = await performAccessibilityScan(url);
  } catch (err) {
    console.error("Accessibility scan error:", err);
    results.accessibility = { error: "Accessibility scan failed", status: "failed" };
  }

  try {
    results.techStack = await detectTechStack(url);
  } catch (err) {
    console.error("Tech stack detection error:", err);
    results.techStack = { error: "Tech detection failed", status: "failed" };
  }

  return results;
}

async function performE2EScan(url: string): Promise<PipelineSection<E2EResults>> {
  try {
    console.log(`E2E scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`E2E scan: received status ${response.status}`);
      return {
        error: `HTTP ${response.status}`,
        status: "failed",
        buttons_found: 0,
        links_found: 0,
        forms_found: 0,
        primary_actions: [],
      };
    }

    const html = await response.text();
    console.log(`E2E scan: received ${html.length} bytes`);

    // Prefer a DOM-based parse for accuracy; fall back to regex if DOMParser isn't available.
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const buttons = Array.from(doc.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
      const anchors = Array.from(doc.querySelectorAll('a[href]')).filter((a) => {
        const href = (a.getAttribute('href') || '').trim().toLowerCase();
        return !!href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:');
      });
      const forms = Array.from(doc.querySelectorAll('form'));

      const primaryActions = buttons
        .map((b) => {
          const text = (b.textContent || '').trim();
          if (text) return text;
          return (b as Element).getAttribute('aria-label') || (b as Element).getAttribute('value') || '';
        })
        .map((text) => text.trim())
        .filter(Boolean)
        .filter((text, index, arr) => arr.indexOf(text) === index)
        .slice(0, 8);

      return {
        buttons_found: buttons.length,
        links_found: anchors.length,
        forms_found: forms.length,
        primary_actions: primaryActions,
        status: 'completed',
      };
    } catch {
      // DOMParser may not be available in some runtimes; fall back to regex-based parsing.
      console.warn('DOMParser not available, falling back to regex parsing for E2E scan');

      const buttonMatches = html.match(/<button[^>]*>([\s\S]*?)<\/button>|<input[^>]*type=["'](?:button|submit)["'][^>]*>/gi) || [];
      const linkMatches = html.match(/<a[^>]*href=["']([^"']*)["'][^>]*>/gi) || [];
      const formMatches = html.match(/<form[^>]*>/gi) || [];

      return {
        buttons_found: buttonMatches.length,
        links_found: linkMatches.filter((link) => {
          const href = link.match(/href=["']([^"']*)["']/i)?.[1]?.trim().toLowerCase() || '';
          return !!href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:');
        }).length,
        forms_found: formMatches.length,
        primary_actions: buttonMatches
          .map((btn) => btn.replace(/<[^>]*>/g, '').trim())
          .filter((s) => s)
          .filter((s, index, arr) => arr.indexOf(s) === index)
          .slice(0, 8),
        status: 'completed',
      };
    }
  } catch (error) {
    console.error("E2E scan error:", error);
    return {
      error: error instanceof Error ? error.message : "E2E scan failed",
      status: "failed",
      buttons_found: 0,
      links_found: 0,
      forms_found: 0,
      primary_actions: [],
    };
  }
}

async function performAPIScan(url: string): Promise<PipelineSection<APIResults>> {
  const endpoints: Array<{ method: string; path: string; status: number }> = [];
  const endpointSet = new Set<string>();

  try {
    console.log(`API scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        error: `HTTP ${response.status}`,
        endpoints_detected: 0,
        endpoints: [],
        status: "failed",
      };
    }

    const html = await response.text();
    const baseUrl = new URL(url);

    const addEndpoint = (rawPath: string, method = 'GET') => {
      const trimmed = rawPath?.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:')) {
        return;
      }

      let normalizedPath = '';
      try {
        const resolved = new URL(trimmed, baseUrl);
        if (resolved.origin !== baseUrl.origin) return;
        normalizedPath = `${resolved.pathname}${resolved.search}`;
      } catch {
        return;
      }

      if (!normalizedPath.startsWith('/')) return;

      const key = `${method.toUpperCase()} ${normalizedPath}`;
      if (endpointSet.has(key)) return;

      endpointSet.add(key);
      endpoints.push({ method: method.toUpperCase(), path: normalizedPath, status: 0 });
    };

    const fetchRegex = /fetch\s*\(\s*["']([^"']+)["']/gi;
    let fetchMatch;
    while ((fetchMatch = fetchRegex.exec(html)) !== null) {
      addEndpoint(fetchMatch[1], 'GET');
    }

    const axiosMethodRegex = /axios\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi;
    let axiosMethodMatch;
    while ((axiosMethodMatch = axiosMethodRegex.exec(html)) !== null) {
      addEndpoint(axiosMethodMatch[2], axiosMethodMatch[1]);
    }

    const xhrRegex = /\.open\s*\(\s*["'](GET|POST|PUT|PATCH|DELETE)["']\s*,\s*["']([^"']+)["']/gi;
    let xhrMatch;
    while ((xhrMatch = xhrRegex.exec(html)) !== null) {
      addEndpoint(xhrMatch[2], xhrMatch[1]);
    }

    const formActionRegex = /<form[^>]*action=["']([^"']+)["'][^>]*>/gi;
    let formMatch;
    while ((formMatch = formActionRegex.exec(html)) !== null) {
      addEndpoint(formMatch[1], 'POST');
    }

    return {
      endpoints_detected: endpoints.length,
      endpoints: endpoints.slice(0, 10),
      status: "completed",
    };
  } catch (error) {
    console.error("API scan error:", error);
    return {
      error: error instanceof Error ? error.message : "API scan failed",
      endpoints_detected: 0,
      endpoints: [],
      status: "failed",
    };
  }
}

async function performSecurityScan(url: string): Promise<PipelineSection<SecurityResults>> {
  try {
    console.log(`Security scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const headers = response.headers;
    const issues: Array<{ severity: string; category?: string; description?: string; message?: string }> = [];
    const securityHeaders: Record<string, string> = {};

    const cacheControl = (headers.get("cache-control") || "").toLowerCase();
    const cacheControlSecure = cacheControl.includes("no-store") || cacheControl.includes("private") || cacheControl.includes("no-cache");
    const accessControlAllowOrigin = (headers.get("access-control-allow-origin") || "").trim();
    const corsScoped = accessControlAllowOrigin.length === 0 || (accessControlAllowOrigin !== "*" && accessControlAllowOrigin.toLowerCase() !== "null");

    const setCookieFallback = headers.get("set-cookie") || "";
    const setCookieValues = setCookieFallback
      ? setCookieFallback.split(/,(?=[^;,=]+=)/).map((value) => value.trim()).filter(Boolean)
      : [];

    const hasSetCookie = setCookieValues.length > 0;
    const allCookiesSecure = !hasSetCookie || setCookieValues.every((cookie) => /;\s*secure\b/i.test(cookie));
    const allCookiesHttpOnly = !hasSetCookie || setCookieValues.every((cookie) => /;\s*httponly\b/i.test(cookie));
    const allCookiesSameSite = !hasSetCookie || setCookieValues.every((cookie) => /;\s*samesite=(lax|strict|none)\b/i.test(cookie));
    const sessionFixationRisk = hasSetCookie && setCookieValues.some((cookie) => {
      const hasSessionName = /(session|sessid|sid|token|auth)/i.test(cookie.split("=")[0] || "");
      const hasLongLifetime = /;\s*(max-age=\d+|expires=)/i.test(cookie);
      return hasSessionName && hasLongLifetime;
    });

    const hsts = headers.get("strict-transport-security") || "";
    const hstsMaxAgeMatch = hsts.match(/max-age=(\d+)/i);
    const hstsMaxAge = hstsMaxAgeMatch ? Number(hstsMaxAgeMatch[1]) : 0;
    const hasIncludeSubDomains = /includesubdomains/i.test(hsts);
    const hasPreload = /preload/i.test(hsts);
    const tlsQualityStrong = url.startsWith("https://") && hstsMaxAge >= 31536000 && hasIncludeSubDomains;

    const headerChecks: NonNullable<SecurityResults["header_checks"]> = [
      {
        header: "Content-Security-Policy",
        purpose: "Prevent XSS attacks",
        present: !!headers.get("content-security-policy"),
        value: headers.get("content-security-policy") || undefined,
        severity: "high",
        recommendation: "Add a strict CSP and avoid unsafe-inline/unsafe-eval where possible."
      },
      {
        header: "Strict-Transport-Security",
        purpose: "Enforce HTTPS",
        present: !!headers.get("strict-transport-security"),
        value: headers.get("strict-transport-security") || undefined,
        severity: "high",
        recommendation: "Add HSTS with max-age, includeSubDomains, and preload when eligible."
      },
      {
        header: "X-Frame-Options",
        purpose: "Prevent clickjacking",
        present: !!headers.get("x-frame-options"),
        value: headers.get("x-frame-options") || undefined,
        severity: "high",
        recommendation: "Set X-Frame-Options to DENY or SAMEORIGIN."
      },
      {
        header: "X-Content-Type-Options",
        purpose: "Prevent MIME sniffing",
        present: (headers.get("x-content-type-options") || "").toLowerCase() === "nosniff",
        value: headers.get("x-content-type-options") || undefined,
        severity: "medium",
        recommendation: "Set X-Content-Type-Options to nosniff."
      },
      {
        header: "Referrer-Policy",
        purpose: "Protect referrer data",
        present: !!headers.get("referrer-policy"),
        value: headers.get("referrer-policy") || undefined,
        severity: "medium",
        recommendation: "Use strict-origin-when-cross-origin or stricter policies for privacy-sensitive flows."
      },
      {
        header: "Permissions-Policy",
        purpose: "Restrict browser APIs",
        present: !!headers.get("permissions-policy"),
        value: headers.get("permissions-policy") || undefined,
        severity: "medium",
        recommendation: "Restrict unused browser features (camera, microphone, geolocation, payment, usb)."
      },
      {
        header: "Cross-Origin-Opener-Policy",
        purpose: "Prevent cross-origin attacks",
        present: !!headers.get("cross-origin-opener-policy"),
        value: headers.get("cross-origin-opener-policy") || undefined,
        severity: "medium",
        recommendation: "Set COOP to same-origin for isolation when compatible with your app."
      },
      {
        header: "Cross-Origin-Embedder-Policy",
        purpose: "Secure resource isolation",
        present: !!headers.get("cross-origin-embedder-policy"),
        value: headers.get("cross-origin-embedder-policy") || undefined,
        severity: "medium",
        recommendation: "Set COEP to require-corp (or credentialless) when cross-origin isolation is required."
      },
      {
        header: "Cross-Origin-Resource-Policy",
        purpose: "Control resource sharing",
        present: !!headers.get("cross-origin-resource-policy"),
        value: headers.get("cross-origin-resource-policy") || undefined,
        severity: "low",
        recommendation: "Set CORP to same-origin or same-site for sensitive resources."
      },
      {
        header: "Cache-Control",
        purpose: "Prevent sensitive caching",
        present: cacheControlSecure,
        value: headers.get("cache-control") || undefined,
        severity: "medium",
        recommendation: "Use Cache-Control no-store/no-cache/private for sensitive or authenticated responses."
      },
      {
        header: "X-DNS-Prefetch-Control",
        purpose: "Control DNS prefetching privacy",
        present: !!headers.get("x-dns-prefetch-control"),
        value: headers.get("x-dns-prefetch-control") || undefined,
        severity: "low",
        recommendation: "Set X-DNS-Prefetch-Control (typically 'off') on sensitive pages."
      },
      {
        header: "Origin-Agent-Cluster",
        purpose: "Isolate origin memory/process model",
        present: !!headers.get("origin-agent-cluster"),
        value: headers.get("origin-agent-cluster") || undefined,
        severity: "low",
        recommendation: "Set Origin-Agent-Cluster to ?1 to enforce origin-level process isolation where supported."
      },
      {
        header: "Access-Control-Allow-Origin scope",
        purpose: "CORS hardening policy scope",
        present: corsScoped,
        value: accessControlAllowOrigin || undefined,
        severity: "medium",
        recommendation: "Avoid wildcard ACAO for sensitive/authenticated APIs; allow only trusted origins."
      },
      {
        header: "Set-Cookie Secure flag",
        purpose: "Cookie transport confidentiality",
        present: allCookiesSecure,
        value: hasSetCookie ? (allCookiesSecure ? "All cookies secure" : "One or more cookies missing Secure") : "No Set-Cookie observed",
        severity: "high",
        recommendation: "Add Secure to all cookies so they are never sent over plaintext HTTP."
      },
      {
        header: "Set-Cookie HttpOnly flag",
        purpose: "Reduce script access to cookies",
        present: allCookiesHttpOnly,
        value: hasSetCookie ? (allCookiesHttpOnly ? "All cookies HttpOnly" : "One or more cookies missing HttpOnly") : "No Set-Cookie observed",
        severity: "high",
        recommendation: "Add HttpOnly to session/auth cookies to reduce XSS exfiltration risk."
      },
      {
        header: "Set-Cookie SameSite flag",
        purpose: "Mitigate CSRF/session leakage",
        present: allCookiesSameSite,
        value: hasSetCookie ? (allCookiesSameSite ? "All cookies include SameSite" : "One or more cookies missing SameSite") : "No Set-Cookie observed",
        severity: "medium",
        recommendation: "Set SameSite=Lax or Strict for most cookies; use None only when required with Secure."
      },
      {
        header: "Session fixation indicators",
        purpose: "Detect long-lived fixed session identifiers",
        present: !sessionFixationRisk,
        value: sessionFixationRisk ? "Potential risk detected in Set-Cookie attributes" : "No obvious session fixation indicator",
        severity: "high",
        recommendation: "Rotate session identifiers on authentication and avoid long-lived fixed session IDs."
      },
      {
        header: "TLS/HSTS quality",
        purpose: "Transport and certificate quality heuristic",
        present: tlsQualityStrong,
        value: url.startsWith("https://")
          ? `hsts max-age=${hstsMaxAge || 0}${hasIncludeSubDomains ? '; includeSubDomains' : ''}${hasPreload ? '; preload' : ''}`
          : "HTTP detected",
        severity: "high",
        recommendation: "Use HTTPS with strong TLS and HSTS (>=31536000, includeSubDomains, preload when possible)."
      },
    ];

    for (const check of headerChecks) {
      securityHeaders[check.header] = check.value || "";
      if (!check.present) {
        issues.push({
          severity: check.severity,
          category: "Security Header",
          description: `Missing or weak ${check.header}: ${check.purpose}`,
        });
      }
    }

    if (!url.startsWith("https://")) {
      issues.push({
        severity: "high",
        category: "Transport Security",
        description: "Target URL is not HTTPS. TLS is required for production security.",
      });
    }

    const html = await response.text();

    const cookieMatches = html.match(/document\.cookie\s*=/gi);
    if (cookieMatches && cookieMatches.length > 0) {
      issues.push({
        severity: "high",
        category: "Security",
        description: "JavaScript cookie manipulation detected - potential XSS vector"
      });
    }

    const checksPerformed = headerChecks.length + 1;
    const checksPassed = Math.max(0, checksPerformed - issues.length);
    const recommendations = Array.from(new Set([
      ...headerChecks.filter((check) => !check.present).map((check) => check.recommendation),
      ...(url.startsWith("https://") ? [] : ["Redirect all HTTP traffic to HTTPS and enable TLS best-practice configuration."]),
      ...(cookieMatches && cookieMatches.length > 0 ? ["Avoid document.cookie writes for sensitive session data; use HttpOnly/Secure cookies."] : []),
    ]));

    return {
      issues,
      checks_performed: checksPerformed,
      checks_passed: checksPassed,
      https_enabled: url.startsWith("https"),
      protocol: url.startsWith("https") ? "HTTPS" : "HTTP",
      score: Math.round((checksPassed / Math.max(1, checksPerformed)) * 100),
      security_headers: securityHeaders,
      header_checks: headerChecks,
      recommendations,
      scanner_engine: "edge-fetch-header-scan",
      status: "completed",
    };
  } catch (error) {
    console.error("Security scan error:", error);
    return {
      error: error instanceof Error ? error.message : "Security scan failed",
      issues: [],
      checks_performed: 0,
      checks_passed: 0,
      https_enabled: false,
      status: "failed",
    };
  }
}

async function performPerformanceScan(url: string): Promise<PipelineSection<PerformanceResults>> {
  try {
    console.log(`Performance scan: fetching ${url}`);

    const pagespeedApiKey =
      Deno.env.get("GOOGLE_PAGESPEED_API_KEY") ||
      Deno.env.get("PAGE_PAGESPEED_INSIGHTS_API_KEY");

    if (pagespeedApiKey) {
      console.log("Using Google PageSpeed Insights API");
      return await performGooglePageSpeedScan(url, pagespeedApiKey);
    }

    console.log("Falling back to basic performance scan");
    return await performBasicPerformanceScan(url);
  } catch (error) {
    console.error("Performance scan error:", error);
    return {
      error: error instanceof Error ? error.message : "Performance scan failed",
      score: 0,
      load_time_ms: 0,
      status: "failed",
    };
  }
}

async function performGooglePageSpeedScan(url: string, apiKey: string): Promise<PipelineSection<PerformanceResults>> {
  try {
    const callPageSpeed = async (strategy: 'mobile' | 'desktop') => {
      const pagespeedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=${strategy}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(pagespeedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`PageSpeed API error (${strategy}): ${response.status}`);
      }

      const data = await response.json();
      const lighthouseResult = data.lighthouseResult;
      const categories = lighthouseResult.categories;
      const audits = lighthouseResult.audits;

      const performanceScore = Math.round((categories.performance?.score || 0) * 100);
      const accessibilityScore = Math.round((categories.accessibility?.score || 0) * 100);
      const bestPracticesScore = Math.round((categories['best-practices']?.score || 0) * 100);
      const seoScore = Math.round((categories.seo?.score || 0) * 100);

      const metrics = audits['metrics']?.details?.items?.[0] || {};
      const fcp = metrics.firstContentfulPaint || 0;
      const lcp = metrics.largestContentfulPaint || 0;
      const tti = metrics.interactive || 0;
      const tbt = metrics.totalBlockingTime || 0;
      const cls = metrics.cumulativeLayoutShift || 0;
      const speedIndex = metrics.speedIndex || 0;

      return {
        score: performanceScore,
        load_time_ms: Math.round(metrics.observedLoad || 0),
        lighthouse_scores: {
          performance: performanceScore,
          accessibility: accessibilityScore,
          bestPractices: bestPracticesScore,
          seo: seoScore,
        },
        core_web_vitals: {
          fcp: Math.round(fcp),
          lcp: Math.round(lcp),
          tti: Math.round(tti),
          tbt: Math.round(tbt),
          cls: Math.round(cls * 1000) / 1000,
          speedIndex: Math.round(speedIndex),
        },
        image_count: audits['uses-optimized-images']?.details?.items?.length || 0,
        compression_enabled: audits['uses-text-compression']?.score === 1,
        caching_enabled: audits['uses-long-cache-ttl']?.score > 0.5,
        opportunities: extractPageSpeedOpportunities(audits),
        diagnostics: extractPageSpeedDiagnostics(audits),
      };
    };

    console.log("Calling Google PageSpeed Insights API for mobile + desktop...");
    const [mobileResult, desktopResult] = await Promise.all([
      callPageSpeed('mobile'),
      callPageSpeed('desktop'),
    ]);

    return {
      ...mobileResult,
      page_speed_by_environment: {
        mobile: {
          score: mobileResult.score,
          load_time_ms: mobileResult.load_time_ms,
          core_web_vitals: mobileResult.core_web_vitals,
        },
        desktop: {
          score: desktopResult.score,
          load_time_ms: desktopResult.load_time_ms,
          core_web_vitals: desktopResult.core_web_vitals,
        },
      },
      source: "google-pagespeed",
      status: "completed",
    };
  } catch (error) {
    console.error("Google PageSpeed API error:", error);
    console.log("Falling back to basic scan");
    return await performBasicPerformanceScan(url);
  }
}

type PageSpeedAudit = { title?: string; description?: string; score?: number | null; details?: Record<string, unknown> };
type PageSpeedAudits = Record<string, PageSpeedAudit>;

function extractPageSpeedOpportunities(audits: PageSpeedAudits) {
  const opportunities: Array<{ title?: string; description?: string; score?: number | null; savings?: number }> = [];
  const opportunityAudits = [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'modern-image-formats',
    'offscreen-images',
    'minify-css',
    'minify-javascript',
    'reduce-unused-code',
  ];

  for (const auditId of opportunityAudits) {
    const audit = audits[auditId];
    if (audit && typeof audit.score === 'number' && audit.score < 1) {
      const details = audit.details as Record<string, unknown> | undefined;
      const savings = details && typeof details['overallSavingsMs'] === 'number' ? (details['overallSavingsMs'] as number) : 0;
      opportunities.push({
        title: audit.title || auditId,
        description: audit.description,
        score: audit.score,
        savings,
      });
    }
  }

  return opportunities.slice(0, 5);
}

function extractPageSpeedDiagnostics(audits: PageSpeedAudits) {
  const diagnostics: Array<{ title?: string; description?: string; score?: number | null }> = [];
  const diagnosticAudits = [
    'dom-size',
    'total-byte-weight',
    'mainthread-work-breakdown',
    'bootup-time',
    'duplicated-javascript',
  ];

  for (const auditId of diagnosticAudits) {
    const audit = audits[auditId];
    if (audit && typeof audit.score === 'number' && audit.score < 1) {
      diagnostics.push({
        title: audit.title || auditId,
        description: audit.description,
        score: audit.score,
      });
    }
  }

  return diagnostics.slice(0, 5);
}

async function performBasicPerformanceScan(url: string): Promise<PipelineSection<PerformanceResults>> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
    },
  });

  clearTimeout(timeoutId);

  const endTime = performance.now();
  const loadTime = endTime - startTime;

  const html = await response.text();
  const headers = response.headers;

  const imageCount = (html.match(/<img[^>]*>/gi) || []).length;
  const scriptCount = (html.match(/<script[^>]*>/gi) || []).length;
  const stylesheetCount = (html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || []).length;

  const hasGzip = headers.get("content-encoding")?.includes("gzip") || headers.get("content-encoding")?.includes("br");
  const hasCaching = !!headers.get("cache-control");

  let score = 100;
  if (loadTime > 3000) score -= 30;
  else if (loadTime > 1500) score -= 15;

  if (imageCount > 20) score -= 10;
  if (scriptCount > 15) score -= 10;
  if (stylesheetCount > 5) score -= 5;
  if (!hasGzip) score -= 15;
  if (!hasCaching) score -= 10;

  score = Math.max(0, score);

  return {
    score,
    load_time_ms: Math.round(loadTime),
    image_count: imageCount,
    scripts_count: scriptCount,
    stylesheets_count: stylesheetCount,
    compression_enabled: hasGzip,
    caching_enabled: hasCaching,
    lighthouse_scores: {
      performance: score,
      seo: Math.max(0, score - 10),
    },
    source: "basic-scan",
    status: "completed",
  };
}

async function performAccessibilityScan(url: string): Promise<PipelineSection<AccessibilityResults>> {
  try {
    console.log(`Accessibility scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const html = await response.text();

    const issues = [];

    const imgWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
    if (imgWithoutAlt > 0) {
      issues.push({
        severity: "critical",
        count: imgWithoutAlt,
        message: `${imgWithoutAlt} images missing alt text - screen readers cannot describe images`,
        wcag: "WCAG 2.1 Level A (1.1.1)",
      });
    }

    const hasLang = /<html[^>]*lang=/i.test(html);
    if (!hasLang) {
      issues.push({
        severity: "high",
        message: "Missing lang attribute on html element - affects screen reader pronunciation",
        wcag: "WCAG 2.1 Level A (3.1.1)",
      });
    }

    const buttonWithoutText = (html.match(/<button[^>]*>\s*<\/button>/gi) || []).length;
    if (buttonWithoutText > 0) {
      issues.push({
        severity: "critical",
        count: buttonWithoutText,
        message: `${buttonWithoutText} buttons without accessible text - screen readers cannot announce purpose`,
        wcag: "WCAG 2.1 Level A (4.1.2)",
      });
    }

    const inputCount = (html.match(/<input[^>]*>/gi) || []).length;
    const labelCount = (html.match(/<label[^>]*>/gi) || []).length;
    if (inputCount > labelCount + 2) {
      issues.push({
        severity: "high",
        count: inputCount - labelCount,
        message: `${inputCount - labelCount} form inputs possibly without labels - difficult for screen reader users`,
        wcag: "WCAG 2.1 Level A (1.3.1, 3.3.2)",
      });
    }

    const headingsMatch = html.match(/<h[1-6][^>]*>/gi) || [];
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    if (h1Count === 0 && headingsMatch.length > 0) {
      issues.push({
        severity: "medium",
        message: "Page has no H1 heading - impacts document structure and navigation",
        wcag: "WCAG 2.1 Level A (1.3.1)",
      });
    } else if (h1Count > 1) {
      issues.push({
        severity: "medium",
        message: `Page has ${h1Count} H1 headings - should typically have only one`,
        wcag: "WCAG 2.1 Best Practice",
      });
    }

    const linksWithoutText = (html.match(/<a[^>]*href=[^>]*>\s*<\/a>/gi) || []).length;
    if (linksWithoutText > 0) {
      issues.push({
        severity: "high",
        count: linksWithoutText,
        message: `${linksWithoutText} links without text - screen readers cannot announce destination`,
        wcag: "WCAG 2.1 Level A (2.4.4)",
      });
    }

    const hasSkipLink = /<a[^>]*href=["']#(main|content|skip)["'][^>]*>/i.test(html);
    if (!hasSkipLink) {
      issues.push({
        severity: "low",
        message: "No skip navigation link found - keyboard users must tab through all navigation",
        wcag: "WCAG 2.1 Level A (2.4.1)",
      });
    }

    const tabindexNegative = (html.match(/tabindex=["']-\d+["']/gi) || []).length;
    if (tabindexNegative > 0) {
      issues.push({
        severity: "medium",
        count: tabindexNegative,
        message: `${tabindexNegative} elements with negative tabindex - removes from keyboard navigation`,
        wcag: "WCAG 2.1 Level A (2.1.1)",
      });
    }

    const severityPoints: {[key: string]: number} = { critical: 25, high: 15, medium: 8, low: 3 };
    const totalDeduction = issues.reduce((sum, issue) => sum + (severityPoints[issue.severity] || 10), 0);

    return {
      issues,
      total_issues: issues.length,
      score: Math.max(0, 100 - totalDeduction),
      wcag_level: issues.some(i => i.severity === "critical" || i.severity === "high") ? "Fails Level A" : "Passes Level A (potential AA issues)",
      status: "completed",
    };
  } catch (error) {
    console.error("Accessibility scan error:", error);
    return {
      error: error instanceof Error ? error.message : "Accessibility scan failed",
      status: "failed",
      issues: [],
      total_issues: 0,
      score: 0,
      wcag_level: "Unable to determine",
    };
  }
}

async function detectTechStack(url: string): Promise<PipelineSection<TechStackResult>> {
  try {
    console.log(`Tech stack detection: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const html = await response.text();
    const headers = response.headers;

    const detected: Array<{name: string; confidence: string; version?: string; category: string}> = [];

    if (html.includes("__NEXT_DATA__") || html.includes("_next/static")) {
      const versionMatch = html.match(/"buildId":"([^"]+)"/); 
      detected.push({
        name: "Next.js",
        confidence: "high",
        version: versionMatch?.[1] ? "detected" : undefined,
        category: "Framework"
      });
    } else if (html.includes("react") || html.includes("React") || html.includes("_react") || html.match(/react[.-]?dom/i)) {
      detected.push({ name: "React", confidence: "medium", category: "Library" });
    }

    if (html.includes("__nuxt") || html.includes("_nuxt/")) {
      detected.push({ name: "Nuxt.js", confidence: "high", category: "Framework" });
    } else if (html.includes("vue") || html.includes("Vue") || html.match(/vue[.-]?js/i)) {
      detected.push({ name: "Vue.js", confidence: "medium", category: "Framework" });
    }

    if (html.includes("ng-version") || html.match(/<[^>]*ng-[^>]*>/i)) {
      const versionMatch = html.match(/ng-version="([^"]+)"/); 
      detected.push({
        name: "Angular",
        confidence: "high",
        version: versionMatch?.[1],
        category: "Framework"
      });
    }

    if (html.includes("wp-content") || html.includes("wp-includes") || html.includes("/wordpress/")) {
      const versionMatch = html.match(new RegExp('wp-content/themes/[^/]+/([0-9.]+)'));
      detected.push({
        name: "WordPress",
        confidence: "high",
        version: versionMatch?.[1],
        category: "CMS"
      });
    }

    if (html.includes("Drupal") || html.match(/sites\/(default|all)\/modules/i)) {
      detected.push({ name: "Drupal", confidence: "high", category: "CMS" });
    }

    if (html.includes("__svelte") || html.match(/<script[^>]*src=["'][^"']*svelte[^"']*["']/i)) {
      detected.push({ name: "Svelte", confidence: "medium", category: "Framework" });
    }

    if (html.match(/jquery[.-]?(\d+\.\d+\.\d+)?/i)) {
      const versionMatch = html.match(/jquery[.-]?(\d+\.\d+\.\d+)/i);
      detected.push({
        name: "jQuery",
        confidence: "high",
        version: versionMatch?.[1],
        category: "Library"
      });
    }

    if (html.includes("tailwind") || html.match(/class=["'][^"']*\b(flex|grid|bg-|text-|p-|m-|w-|h-)[^"']*["']/)) {
      detected.push({ name: "Tailwind CSS", confidence: "medium", category: "CSS Framework" });
    }

    if (html.match(/class=["'][^"']*\b(container|row|col-|btn|navbar)[^"']*["']/) && !html.includes("tailwind")) {
      detected.push({ name: "Bootstrap", confidence: "low", category: "CSS Framework" });
    }

    const poweredBy = headers.get("x-powered-by");
    if (poweredBy) {
      detected.push({
        name: poweredBy,
        confidence: "high",
        category: "Server"
      });
    }

    const server = headers.get("server");
    if (server) {
      detected.push({
        name: server.split("/")[0],
        confidence: "high",
        version: server.split("/")[1],
        category: "Web Server"
      });
    }

    if (headers.get("x-aspnet-version") || headers.get("x-aspnetmvc-version")) {
      detected.push({
        name: "ASP.NET",
        confidence: "high",
        version: headers.get("x-aspnet-version") || undefined,
        category: "Framework"
      });
    }

    return {
      detected,
      total_detected: detected.length,
      status: "completed",
    };
  } catch (error) {
    console.error("Tech stack detection error:", error);
    return {
      error: error instanceof Error ? error.message : "Tech detection failed",
      detected: [],
      total_detected: 0,
      status: "failed",
    };
  }
}

type PreviewImageSource = "og" | "twitter" | "jsonld" | "first_img" | "none";
type PreviewImageResult = { url: string | null; source: PreviewImageSource };

function resolveImageUrl(candidate: string, baseUrl: string): string | null {
  try {
    const value = candidate.trim();
    if (!value || value.startsWith("data:")) return null;
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*?(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*?content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractJsonLdImage(html: string): string | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) return null;

  const findImage = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const obj = node as Record<string, unknown>;

    const image = obj.image;
    if (typeof image === "string") return image;

    if (Array.isArray(image)) {
      for (const item of image) {
        if (typeof item === "string") return item;
        const nested = findImage(item);
        if (nested) return nested;
      }
    }

    if (image && typeof image === "object") {
      const imageObj = image as Record<string, unknown>;
      if (typeof imageObj.url === "string") return imageObj.url;
      const nested = findImage(imageObj);
      if (nested) return nested;
    }

    for (const value of Object.values(obj)) {
      const nested = findImage(value);
      if (nested) return nested;
    }

    return null;
  };

  for (const script of scripts) {
    const raw = (script[1] || "").trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const found = findImage(parsed);
      if (found) return found;
    } catch {
      continue;
    }
  }

  return null;
}

function extractPreviewImage(htmlContent: string, baseUrl: string): PreviewImageResult {
  try {
    const ogCandidate =
      extractMetaContent(htmlContent, "og:image") ||
      extractMetaContent(htmlContent, "og:image:url");
    const ogResolved = ogCandidate ? resolveImageUrl(ogCandidate, baseUrl) : null;
    if (ogResolved) return { url: ogResolved, source: "og" };

    const twitterCandidate =
      extractMetaContent(htmlContent, "twitter:image") ||
      extractMetaContent(htmlContent, "twitter:image:src");
    const twitterResolved = twitterCandidate ? resolveImageUrl(twitterCandidate, baseUrl) : null;
    if (twitterResolved) return { url: twitterResolved, source: "twitter" };

    const jsonLdCandidate = extractJsonLdImage(htmlContent);
    const jsonLdResolved = jsonLdCandidate ? resolveImageUrl(jsonLdCandidate, baseUrl) : null;
    if (jsonLdResolved) return { url: jsonLdResolved, source: "jsonld" };

    const imgMatch = htmlContent.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    const imgResolved = imgMatch?.[1] ? resolveImageUrl(imgMatch[1], baseUrl) : null;
    if (imgResolved) return { url: imgResolved, source: "first_img" };

    return { url: null, source: "none" };
  } catch (error) {
    console.error("Error extracting preview image:", error);
    return { url: null, source: "none" };
  }
}

function extractOGImage(htmlContent: string, baseUrl: string): string | null {
  return extractPreviewImage(htmlContent, baseUrl).url;
}

function extractTopIssues(scanResults: { security?: SecurityResults; accessibility?: AccessibilityResults; performance?: PerformanceResults }): TopIssue[] {
  const issues: TopIssue[] = [];

  if (scanResults.security?.issues) {
    scanResults.security.issues.forEach((issue) => {
      issues.push({
        category: (issue.category as string) || 'Security',
        severity: (issue.severity as TopIssue['severity']) || 'low',
        description: (issue.description as string) || (issue.message as string) || '',
      });
    });
  }

  if (scanResults.accessibility?.issues) {
    scanResults.accessibility.issues.forEach((issue) => {
      issues.push({
        category: 'Accessibility',
        severity: (issue.severity as TopIssue['severity']) || 'low',
        description: (issue.message as string) || '',
      });
    });
  }

  if (scanResults.performance?.score !== undefined && scanResults.performance.score < 50) {
    issues.push({
      category: 'Performance',
      severity: 'high',
      description: `Poor performance score (${scanResults.performance.score}/100) - site loads slowly`,
    });
  }

  const sortOrder: { [key: string]: number } = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => (sortOrder[a.severity] || 99) - (sortOrder[b.severity] || 99));

  return issues.slice(0, 10);
}

function calculateOverallScore(scanResults: { security?: SecurityResults; performance?: PerformanceResults; accessibility?: AccessibilityResults; e2e?: E2EResults; api?: APIResults }): number {
  const weights = {
    security: 0.3,
    performance: 0.25,
    accessibility: 0.25,
    e2e: 0.1,
    api: 0.1,
  };

  let totalScore = 0;
  let totalWeight = 0;

  if (scanResults.security?.status === "completed") {
    const secScore = ((scanResults.security.checks_passed || 0) / (scanResults.security.checks_performed || 1)) * 100;
    totalScore += secScore * weights.security;
    totalWeight += weights.security;
  }

  if (scanResults.performance?.status === "completed") {
    totalScore += (scanResults.performance.score || 0) * weights.performance;
    totalWeight += weights.performance;
  }

  if (scanResults.accessibility?.status === "completed") {
    totalScore += (scanResults.accessibility.score || 0) * weights.accessibility;
    totalWeight += weights.accessibility;
  }

  if (scanResults.e2e?.status === 'completed') {
    const e2eScore = (scanResults.e2e.buttons_found || 0) > 0 ? 80 : 50;
    totalScore += e2eScore * weights.e2e;
    totalWeight += weights.e2e;
  }

  if (scanResults.api?.status === "completed") {
    const apiScore = 70;
    totalScore += apiScore * weights.api;
    totalWeight += weights.api;
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
}

function buildFallbackExplanations(
  url: string,
  scanResults: Partial<{ security?: SecurityResults; accessibility?: AccessibilityResults; performance?: PerformanceResults; api?: APIResults; e2e?: E2EResults }>,
  overallScore: number,
  seoScore: number,
  seoResults: SEOResults,
): AnalysisExplanations {
  const securityIssues = scanResults.security?.issues?.length || 0;
  const securityChecksPassed = scanResults.security?.checks_passed || Math.max(0, 19 - securityIssues);
  const securityChecksTotal = scanResults.security?.checks_performed || 19;
  const securityScore = Math.round((securityChecksPassed / Math.max(1, securityChecksTotal)) * 100);
  const apiCount = scanResults.api?.endpoints_detected || 0;
  const e2eCount = (scanResults.e2e?.buttons_found || 0) + (scanResults.e2e?.links_found || 0) + (scanResults.e2e?.forms_found || 0);

  return {
    overall: `The scan for ${url} completed with an overall score of ${overallScore}/100. This summarizes security, performance, accessibility, API surface visibility, and interactive element coverage.` ,
    security: `Expanded security scan completed across transport, isolation, and header hardening checks. ${securityIssues === 0 ? 'No immediate header-level security issues were detected.' : `${securityIssues} security issue(s) were detected and should be remediated.`} Current security score is ${securityScore}/100 based on automated checks.`,
    performance: `Performance analysis completed with score ${scanResults.performance?.score || 0}/100. Load time was ${scanResults.performance?.load_time_ms || 0}ms and core metrics should be reviewed alongside optimization opportunities for scripts, images, and caching.`,
    accessibility: `Accessibility analysis completed with score ${scanResults.accessibility?.score || 0}/100 and ${scanResults.accessibility?.total_issues || 0} detected issues. Prioritize critical and serious findings first to improve usability and WCAG alignment.`,
    api: apiCount === 0
      ? 'API analysis completed but no endpoints were detected from passive page-source inspection. APIs may be bundled, runtime-generated, or protected behind authenticated app flows.'
      : `API analysis completed with ${apiCount} discovered endpoint(s). Review endpoint exposure, method usage, and response hygiene as part of hardening.` ,
    e2e: e2eCount === 0
      ? 'E2E analysis completed but no interactive elements were detected on the scanned page snapshot. The page may be static or interactions may render after client-side runtime.'
      : `E2E analysis completed with ${scanResults.e2e?.buttons_found || 0} buttons, ${scanResults.e2e?.links_found || 0} links, and ${scanResults.e2e?.forms_found || 0} forms detected.` ,
    seo: `SEO indicator analysis completed with score ${seoScore}/100. Missing meta tags: ${(seoResults.missing_meta_tags || []).length > 0 ? seoResults.missing_meta_tags?.join(', ') : 'none'}. Sitemap detected: ${seoResults.sitemap_detected === undefined ? 'unknown' : seoResults.sitemap_detected ? 'yes' : 'no'}. Structured data missing: ${seoResults.structured_data_missing === undefined ? 'unknown' : seoResults.structured_data_missing ? 'yes' : 'no'}.`,
    yslow: `YSlow-style optimization review: prioritize image optimization, script reduction, caching headers, compression, and render-blocking resource cleanup to improve perceived and measured speed.`,
  };
}

async function generateAIAnalysis(
  url: string,
  scanResults: Partial<{ security?: SecurityResults; accessibility?: AccessibilityResults; performance?: PerformanceResults; api?: APIResults; e2e?: E2EResults }>,
  topIssues: TopIssue[],
  overallScore: number,
  fallbackExplanations: AnalysisExplanations,
  seoResults: SEOResults,
) {
  const groqKey = Deno.env.get("Console_Groq_AI_API_Key");
  console.log("Groq API Key configured:", !!groqKey);

  if (!groqKey) {
    console.log("Groq API key not configured, skipping AI analysis");
    return { summary: null, recommendations: [], explanations: fallbackExplanations };
  }

  try {
    const prompt = `Analyze this website scan for ${url}:

Overall Score: ${overallScore}/100

Security Issues: ${scanResults.security?.issues?.length || 0}
Accessibility Issues: ${scanResults.accessibility?.total_issues || 0}
Performance Score: ${scanResults.performance?.score || 0}/100

Top Issues:
${topIssues.map(issue => `- [${issue.severity}] ${issue.category}: ${issue.description}`).join('\n')}

You are a web security and performance expert. Provide concise, actionable technical analysis.

Provide:
1. A brief 2-3 sentence technical summary
2. Top 3-5 actionable recommendations
3. Section-by-section explanations for: overall, security, performance, accessibility, api, e2e, seo, yslow

SEO indicator facts:
- Missing meta tags: ${(seoResults.missing_meta_tags || []).join(', ') || 'none'}
- Sitemap detected: ${seoResults.sitemap_detected === undefined ? 'unknown' : seoResults.sitemap_detected ? 'yes' : 'no'}
- Structured data missing: ${seoResults.structured_data_missing === undefined ? 'unknown' : seoResults.structured_data_missing ? 'yes' : 'no'}

Format as JSON: {"summary": "...", "recommendations": ["...", "..."], "explanations": {"overall": "...", "security": "...", "performance": "...", "accessibility": "...", "api": "...", "e2e": "...", "seo": "...", "yslow": "..."}}`;

    console.log("Sending request to Groq API...");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    console.log("Groq API response status:", response.status);

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      console.error("Groq API error:", response.status, txt);
      return { summary: null, recommendations: [], explanations: fallbackExplanations };
    }

    const data = await response.json();
    console.log("Groq API response received");
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.log("Groq API returned no content");
      return { summary: null, recommendations: [], explanations: fallbackExplanations };
    }

    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(jsonStr);
      console.log("Groq parsed AI analysis successfully");
      return {
        summary: parsed.summary || null,
        recommendations: parsed.recommendations || [],
        explanations: {
          ...fallbackExplanations,
          ...(parsed.explanations || {}),
        }
      };
    } catch (parseError) {
      console.log("Groq content not valid JSON, using raw content:", parseError);
      return {
        summary: content,
        recommendations: [],
        explanations: fallbackExplanations,
      };
    }
  } catch (error) {
    console.error("AI analysis error:", error);
    return { summary: null, recommendations: [], explanations: fallbackExplanations };
  }
}
