import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, PDFPage, rgb } from "npm:pdf-lib";
import PdfPng from "npm:pdf-lib/cjs/core/embedders/PngEmbedder.js";

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
  opportunities?: Array<{ title?: string; score?: number; savings?: number }>;
  diagnostics?: Array<{ title?: string; score?: number }>;
};

type SecurityResults = {
  issues: Array<{ severity: string; category?: string; description?: string; message?: string }>;
  checks_performed: number;
  checks_passed: number;
  https_enabled: boolean;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScanRequest {
  scanId: string;
  url: string;
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
    const scanId = body.scanId;
    const url = body.url;

    console.log(`Starting scan for ${url} with ID ${scanId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Start processing asynchronously (don't await)
    processScan(scanId, url, supabase).catch(error => {
      console.error(`Async scan processing error for ${scanId}:`, error);
    });

    // Return immediately so function doesn't time out
    return new Response(
      JSON.stringify({ success: true, scanId, message: "Scan started" }),
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

async function processScan(scanId: string, url: string, supabase: ReturnType<typeof createClient>) {
  try {
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

        return new Response(
          JSON.stringify({ error: "Rate limit exceeded for this domain" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
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

    console.log("Performing scans...");
    const scanResults = await performScan(url);
    console.log("Scans completed");

    const topIssues = extractTopIssues(scanResults);
    const overallScore = calculateOverallScore(scanResults);

    console.log(`Overall score: ${overallScore}, top issues: ${topIssues.length}`);

    // Extract OG image
    let ogImage: string | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const html = await response.text();
        ogImage = extractOGImage(html, url);
        if (ogImage) console.log(`OG image found: ${ogImage}`);
      }
    } catch (ogError) {
      console.log("Failed to extract OG image:", ogError);
    }

    let aiSummary = null;
    let aiRecommendations = [];

    try {
      console.log("Generating AI analysis...");
      const aiAnalysis = await generateAIAnalysis(url, scanResults, topIssues, overallScore);
      aiSummary = aiAnalysis.summary;
      aiRecommendations = aiAnalysis.recommendations;
      console.log("AI analysis completed");
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
    }

    // Generate section-specific explanations
    const generateSectionExplanation = (section: string, data: any): string => {
      const explanations: Record<string, string> = {
        performance: `Performance Score (${performanceScore}/100): This measures how efficiently your website loads and responds. ` +
          `Load time: ${scanResults.performance?.load_time_ms}ms, Page size: ${scanResults.performance?.page_size_kb}KB. ` +
          `${performanceScore >= 80 ? "Excellent performance - your site loads very quickly." : 
            performanceScore >= 60 ? "Good performance - consider optimizing images and scripts." :
            "Performance needs improvement - implement caching and code splitting."}`,
        
        security: `Security Score (${scanResults.security?.score || 0}/100): This evaluates your website's security posture. ` +
          `Security checks passed: ${securityChecksPassed}/7. ` +
          `${securityIssues.length > 0 ? `Found ${securityIssues.length} security issues that should be addressed immediately.` :
            "No major security issues detected - good security practices implemented."}`,
        
        accessibility: `Accessibility Score (${scanResults.accessibility?.score || 0}/100): This measures how accessible your site is to all users, ` +
          `including those with disabilities. Total issues found: ${accessibilityIssueCount}. ` +
          `${accessibilityIssueCount > 10 ? "Multiple accessibility issues need urgent attention." :
            accessibilityIssueCount > 0 ? "Some accessibility improvements recommended." :
            "Good accessibility standards implemented."}`,
        
        seo: `SEO Score (${seoScore}/100): This evaluates search engine optimization factors like meta tags, headings, and mobile friendliness. ` +
          `${seoScore >= 80 ? "Excellent SEO - your site should rank well in search results." :
            seoScore >= 60 ? "Good SEO foundation - focus on content quality and backlinks." :
            "SEO needs significant improvement - implement proper meta tags and structured data."}`,
        
        e2e: `End-to-End Testing: Detected ${scanResults.e2e?.buttons_found || 0} buttons, ${scanResults.e2e?.links_found || 0} links, ` +
          `and ${scanResults.e2e?.forms_found || 0} forms. ` +
          `${(scanResults.e2e?.buttons_found || 0) + (scanResults.e2e?.links_found || 0) + (scanResults.e2e?.forms_found || 0) > 50 ? 
            "Your site has rich interactive content." : "Consider adding more interactive elements."}`,
        
        technologies: `Detected ${technologies.length} technologies including frameworks, libraries, and platforms. ` +
          `${technologies.length > 0 ? `Primary stack: ${technologies.slice(0, 3).join(", ")}.` : ""} ` +
          `Technology stack influences performance, security, and maintainability.`,
      };
      return explanations[section] || "No explanation available for this section.";
    };

    const performanceScore = scanResults.performance?.score || scanResults.performance?.lighthouse_scores?.performance || 0;
    const seoScore = scanResults.performance?.lighthouse_scores?.seo || 0;
    const accessibilityIssueCount = scanResults.accessibility?.total_issues || 0;
    const securityIssues = scanResults.security?.issues || [];
    const securityChecksPassed = Math.max(0, 7 - securityIssues.length);
    const technologies = scanResults.techStack?.detected?.map((t) => t.name) || [];
    const exposedEndpoints = scanResults.api?.endpoints?.map((e) => e.path) || [];

    // Generate Professional Multi-Page PDF
    let pdfBase64: string | null = null;
    try {
      console.log("Generating comprehensive PDF...");
      const pdfDoc = await PDFDocument.create();
      const { width: pageWidth, height: pageHeight } = { width: 595, height: 842 };
      
      const scoreColor = (score: number) => {
        if (score >= 80) return rgb(0.1, 0.6, 0.2);
        if (score >= 60) return rgb(1, 0.7, 0);
        return rgb(0.8, 0.1, 0.1);
      };
      
      const wrapText = (text: string, maxWidth: number = 450, fontSize: number = 9): string[] => {
        if (!text) return [];
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          if (testLine.length * (fontSize * 0.6) > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };
      
      const drawPageHeader = (page: any, title: string, pageNum: number) => {
        // Dark blue header
        page.drawRectangle({
          x: 0,
          y: pageHeight - 80,
          width: pageWidth,
          height: 80,
          color: rgb(0.05, 0.15, 0.35),
        
        // RoboLab(R) text logo in header
        page.drawText("RoboLab(R)", {
          x: 40,
          y: pageHeight - 42,
          size: 20,
          color: rgb(1, 1, 1),
        });
        
        // Title
        page.drawText(title, {
          x: 260,
          y: pageHeight - 40,
          size: 14,
          color: rgb(1, 1, 1),
        });
        
        // Page number
        page.drawText(`Page ${pageNum}`, {
          x: pageWidth - 80,
          y: pageHeight - 40,
          size: 10,
          color: rgb(0.8, 0.8, 0.8),
        });
        
        // Footer line
        page.drawRectangle({
          x: 0,
          y: 50,
          width: pageWidth,
          height: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
        
        // Footer logo with RoboLab(R) text
        page.drawText("RoboLab(R)", {
          x: 40,
          y: 30,
          size: 11,
          color: rgb(0.05, 0.15, 0.35),
        });
        
        // Footer text
        page.drawText("Robo-Lab Web Scanner - Professional Security & Performance Analysis", {
          x: 250,
          y: 30,
          size: 8,
          color: rgb(0.6, 0.6, 0.6),
        });
      };
      
      const score = overallScore;
      let pageNum = 1;
      
      // PAGE 1: EXECUTIVE SUMMARY
      const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Main title at top
      page1.drawText("Web Scanner Full Report", {
        x: 40,
        y: pageHeight - 50,
        size: 28,
        color: rgb(0.05, 0.15, 0.35),
      });
      
      page1.drawText("Comprehensive Security & Performance Analysis", {
        x: 40,
        y: pageHeight - 75,
        size: 12,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      let y = pageHeight - 110;
      
      // Website info box
      page1.drawRectangle({
        x: 40,
        y: y - 50,
        width: 515,
        height: 50,
        color: rgb(0.95, 0.98, 1),
        borderColor: rgb(0.3, 0.3, 0.5),
        borderWidth: 1,
      });
      
      page1.drawText("URL Analyzed:", {
        x: 60,
        y: y - 20,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      const urlDisplay = url.length > 70 ? url.substring(0, 67) + "..." : url;
      page1.drawText(urlDisplay, {
        x: 60,
        y: y - 35,
        size: 9,
        color: rgb(0, 0, 0.7),
      });
      
      y -= 50;
      page1.drawText(`Scan Date: ${new Date().toLocaleString()}`, {
        x: 40,
        y: y,
        size: 9,
        color: rgb(0.2, 0.2, 0.2),
      });
      
      y -= 25;
      
      // Overall Score - Reduced Size
      page1.drawRectangle({
        x: 40,
        y: y - 80,
        width: 515,
        height: 80,
        color: rgb(0.98, 0.98, 1),
        borderColor: scoreColor(score),
        borderWidth: 3,
      });
      
      page1.drawText("OVERALL SCORE", {
        x: 60,
        y: y - 30,
        size: 11,
        color: rgb(0.05, 0.15, 0.35),
      });
      
      page1.drawText(`${score}`, {
        x: 380,
        y: y - 60,
        size: 48,
        color: scoreColor(score),
      });
      
      page1.drawText("/100", {
        x: 450,
        y: y - 52,
        size: 14,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      const statusText = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor";
      page1.drawText(statusText, {
        x: 60,
        y: y - 60,
        size: 14,
        color: scoreColor(score),
      });
      
      y -= 110;
      
      // Quick Metrics
      page1.drawText("Quick Metrics", {
        x: 40,
        y: y,
        size: 12,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 20;
      
      const metrics = [
        { label: "Performance Score", value: `${performanceScore}/100` },
        { label: "SEO Score", value: `${seoScore}/100` },
        { label: "Security Checks", value: `${securityChecksPassed}/7 passed` },
        { label: "Accessibility Issues", value: `${accessibilityIssueCount}` },
      ];
      
      for (const m of metrics) {
        page1.drawRectangle({
          x: 40,
          y: y - 20,
          width: 515,
          height: 20,
          color: rgb(0.98, 0.98, 1),
          borderColor: rgb(0.7, 0.7, 0.9),
          borderWidth: 0.5,
        });
        
        page1.drawText(m.label, {
          x: 60,
          y: y - 12,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });
        
        page1.drawText(m.value, {
          x: 400,
          y: y - 12,
          size: 9,
          color: rgb(0.05, 0.15, 0.35),
        });
        
        y -= 25;
      }
      
      // PAGE 2: SCAN RESULTS METRICS OVERVIEW
      const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
      drawPageHeader(page2, "Scan Results Overview", pageNum++);
      y = pageHeight - 100;
      
      page2.drawText("Website Performance Metrics", {
        x: 40,
        y: y,
        size: 12,
        color: rgb(0.1, 0.3, 0.6),
      });
      y -= 28;
      
      const metricCards = [
        {
          label: "Performance Score",
          value: performanceScore,
          desc: "Lighthouse Mobile Score",
          color: scoreColor(performanceScore),
        },
        {
          label: "SEO Score",
          value: seoScore,
          desc: "Overall SEO Score",
          color: scoreColor(seoScore),
        },
        {
          label: "Accessibility",
          value: scanResults.accessibility?.total_issues || 0,
          desc: "Critical & Serious Issues",
          color: (scanResults.accessibility?.total_issues || 0) > 10 ? rgb(0.8, 0.1, 0.1) : rgb(0.1, 0.6, 0.2),
        },
        {
          label: "Security",
          value: scanResults.security?.checks_passed || 0,
          desc: "Security Checks Passed",
          color: rgb(0.1, 0.6, 0.2),
        },
        {
          label: "E2E Testing",
          value: (scanResults.e2e?.buttons_found || 0) + (scanResults.e2e?.links_found || 0) + (scanResults.e2e?.forms_found || 0),
          desc: "Interactive Elements Total",
          color: rgb(0.5, 0.2, 0.8),
        },
      ];
      
      let cardX = 40;
      let cardY = y;
      let cardCol = 0;
      
      for (const metric of metricCards) {
        const cardWidth = 98;
        const cardHeight = 85;
        
        if (cardCol > 4) {
          cardCol = 0;
          cardX = 40;
          cardY -= 95;
        }
        
        // Card background
        page2.drawRectangle({
          x: cardX,
          y: cardY - cardHeight,
          width: cardWidth,
          height: cardHeight,
          color: rgb(0.98, 0.98, 1),
          borderColor: metric.color,
          borderWidth: 2,
        });
        
        // Value
        page2.drawText(String(metric.value), {
          x: cardX + 5,
          y: cardY - 35,
          size: 18,
          color: metric.color,
        });
        
        // Label
        page2.drawText(metric.label, {
          x: cardX + 5,
          y: cardY - 52,
          size: 8,
          color: rgb(0.1, 0.1, 0.1),
        });
        
        // Description
        page2.drawText(metric.desc, {
          x: cardX + 5,
          y: cardY - 65,
          size: 7,
          color: rgb(0.3, 0.3, 0.3),
        });
        
        cardX += 103;
        cardCol++;
      }
      
      // Add explanations section below cards in separate box
      y = cardY - 120;
      
      // Explanation box background
      page2.drawRectangle({
        x: 40,
        y: y - 75,
        width: 515,
        height: 70,
        color: rgb(0.98, 0.99, 1),
        borderColor: rgb(0.05, 0.15, 0.35),
        borderWidth: 2,
      });
      
      // Title with darker color for readability
      page2.drawText("What do these scores mean?", {
        x: 55,
        y: y - 10,
        size: 12,
        color: rgb(0.05, 0.15, 0.35),
      });
      
      // Explanation text with dark color
      const expText = "Performance: Load speed & responsiveness | SEO: Search engine visibility | Accessibility: Usability for all users | Security: Protection level | E2E: Interactive elements";
      const expLines = wrapText(expText, 475, 8);
      
      let expY = y - 28;
      for (const line of expLines.slice(0, 3)) {
        page2.drawText(line, {
          x: 55,
          y: expY,
          size: 8,
          color: rgb(0.15, 0.15, 0.15),
        });
        expY -= 12;
      }
      
      // PAGE 3: DETAILED SCAN RESULTS
      const page3 = pdfDoc.addPage([pageWidth, pageHeight]);
      drawPageHeader(page3, "Detailed Scan Results", pageNum++);
      y = pageHeight - 100;
      
      // Top Issues
      if (topIssues && topIssues.length > 0) {
        page3.drawText(`Top Issues Found (${topIssues.length})`, {
          x: 40,
          y: y,
          size: 12,
          color: rgb(0.8, 0.1, 0.1),
        });
        y -= 20;
        
        for (const issue of topIssues.slice(0, 10)) {
          if (y < 60) break;
          
          const severity = issue.severity || 'medium';
          const sevColor = severity === 'critical' ? rgb(0.9, 0, 0) :
                         severity === 'high' ? rgb(1, 0.4, 0) :
                         severity === 'medium' ? rgb(1, 0.7, 0) :
                         rgb(0.5, 0.5, 0.5);
          
          page3.drawRectangle({
            x: 40,
            y: y - 25,
            width: 515,
            height: 25,
            color: rgb(1, 0.98, 0.98),
            borderColor: sevColor,
            borderWidth: 1,
          });
          
          page3.drawText(`[${severity.toUpperCase()}] ${issue.category}`, {
            x: 60,
            y: y - 10,
            size: 9,
            color: sevColor,
          });
          
          const desc = issue.description.substring(0, 75);
          page3.drawText(desc, {
            x: 60,
            y: y - 18,
            size: 8,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          y -= 30;
        }
      }
      
      // PAGE 4: SECURITY & PERFORMANCE DETAILED
      const page4 = pdfDoc.addPage([pageWidth, pageHeight]);
      drawPageHeader(page4, "Security & Performance", pageNum++);
      y = pageHeight - 100;
      
      // Security Section
      page4.drawText("Security Analysis", {
        x: 40,
        y: y,
        size: 12,
        color: rgb(0.8, 0.1, 0.1),
      });
      y -= 20;
      
      page4.drawRectangle({
        x: 40,
        y: y - 45,
        width: 515,
        height: 45,
        color: rgb(0.98, 0.98, 1),
        borderColor: rgb(0.3, 0.3, 0.5),
        borderWidth: 1,
      });
      
      page4.drawText(`Security Checks Passed: ${securityChecksPassed}/7`, {
        x: 60,
        y: y - 12,
        size: 10,
        color: rgb(0.2, 0.2, 0.2),
      });
      
      if (scanResults.security?.issues && scanResults.security.issues.length > 0) {
        page4.drawText(`Issues Found: ${scanResults.security.issues.length}`, {
          x: 60,
          y: y - 25,
          size: 9,
          color: rgb(0.8, 0.1, 0.1),
        });
      } else {
        page4.drawText("No major security issues detected [OK]", {
          x: 60,
          y: y - 25,
          size: 9,
          color: rgb(0.1, 0.5, 0.1),
        });
      }
      
      y -= 70;
      
      // Performance Section
      page4.drawText("Performance Analysis", {
        x: 40,
        y: y,
        size: 12,
        color: rgb(0.1, 0.5, 0.1),
      });
      y -= 20;
      
      if (scanResults.performance?.core_web_vitals) {
        const cwv = scanResults.performance.core_web_vitals;
        const perfMetrics = [
          { label: "FCP (First Contentful Paint)", value: `${((cwv.fcp || 0) / 1000).toFixed(2)}s` },
          { label: "LCP (Largest Contentful Paint)", value: `${((cwv.lcp || 0) / 1000).toFixed(2)}s` },
          { label: "CLS (Cumulative Layout Shift)", value: `${(cwv.cls || 0).toFixed(3)}` },
        ];
        
        for (const metric of perfMetrics) {
          page4.drawRectangle({
            x: 40,
            y: y - 18,
            width: 515,
            height: 18,
            color: rgb(0.98, 0.98, 1),
            borderColor: rgb(0.7, 0.7, 0.9),
            borderWidth: 0.5,
          });
          
          page4.drawText(metric.label, {
            x: 60,
            y: y - 10,
            size: 8,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          page4.drawText(metric.value, {
            x: 420,
            y: y - 10,
            size: 8,
            color: rgb(0.05, 0.15, 0.35),
          });
          
          y -= 22;
        }
      }
      
      // Performance Results
      page4.drawText("Load Time", {
        x: 40,
        y: y,
        size: 10,
        color: rgb(0.2, 0.2, 0.2),
      });
      page4.drawText(`${scanResults.performance?.load_time_ms || 'N/A'}ms`, {
        x: 400,
        y: y,
        size: 10,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 18;
      
      page4.drawText("Page Size", {
        x: 40,
        y: y,
        size: 10,
        color: rgb(0.2, 0.2, 0.2),
      });
      page4.drawText(`${scanResults.performance?.page_size_kb || 'N/A'}KB`, {
        x: 400,
        y: y,
        size: 10,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 20;
      
      // PAGE 5: ACCESSIBILITY & TECHNOLOGIES
      const page5 = pdfDoc.addPage([pageWidth, pageHeight]);
      drawPageHeader(page5, "Accessibility & Technologies", pageNum++);
      y = pageHeight - 100;
      
      // Accessibility
      page5.drawText("Accessibility Analysis", {
        x: 40,
        y: y,
        size: 12,
        color: rgb(0.8, 0.4, 0),
      });
      y -= 20;
      
      const a11yScore = scanResults.accessibility?.score || 0;
      page5.drawRectangle({
        x: 40,
        y: y - 45,
        width: 515,
        height: 45,
        color: rgb(0.98, 0.98, 1),
        borderColor: rgb(0.8, 0.4, 0),
        borderWidth: 1,
      });
      
      page5.drawText(`Score: ${a11yScore}/100`, {
        x: 60,
        y: y - 12,
        size: 10,
        color: rgb(0.2, 0.2, 0.2),
      });
      
      page5.drawText(`Total Issues: ${accessibilityIssueCount}`, {
        x: 60,
        y: y - 25,
        size: 9,
        color: scoreColor(a11yScore),
      });
      
      y -= 70;
      
      // Technologies
      if (technologies.length > 0) {
        page5.drawText("Detected Technologies", {
          x: 40,
          y: y,
          size: 12,
          color: rgb(0.05, 0.15, 0.35),
        });
        y -= 18;
        
        const techList = technologies.slice(0, 15).join(" | ");
        const techLines = wrapText(techList, 470, 8);
        
        page5.drawRectangle({
          x: 40,
          y: y - (techLines.length * 12 + 10),
          width: 515,
          height: techLines.length * 12 + 10,
          color: rgb(0.98, 0.98, 1),
          borderColor: rgb(0.7, 0.7, 0.9),
          borderWidth: 0.5,
        });
        
        for (const line of techLines) {
          page5.drawText(line, {
            x: 60,
            y: y,
            size: 8,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= 12;
        }
      }
      
      y -= 20;
      
      // E2E Testing
      if (scanResults.e2e?.buttons_found || scanResults.e2e?.links_found || scanResults.e2e?.forms_found) {
        page5.drawText("End-to-End Testing", {
          x: 40,
          y: y,
          size: 12,
          color: rgb(0.05, 0.15, 0.35),
        });
        y -= 18;
        
        page5.drawText(`Buttons Found: ${scanResults.e2e.buttons_found || 0}`, {
          x: 60,
          y: y,
          size: 9,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
        
        page5.drawText(`Links Found: ${scanResults.e2e.links_found || 0}`, {
          x: 60,
          y: y,
          size: 9,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
        
        page5.drawText(`Forms Found: ${scanResults.e2e.forms_found || 0}`, {
          x: 60,
          y: y,
          size: 9,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      
      // PAGE 6: CORE WEB VITALS (DETAILED)
      if (scanResults.performance?.core_web_vitals) {
        const page6 = pdfDoc.addPage([pageWidth, pageHeight]);
        drawPageHeader(page6, "Core Web Vitals", pageNum++);
        y = pageHeight - 100;
        
        page6.drawText("Powered by Google PageSpeed Insights", {
          x: 40,
          y: y,
          size: 11,
          color: rgb(0.2, 0.5, 0.2),
        });
        y -= 25;
        
        const cwv = scanResults.performance.core_web_vitals;
        const vitalMetrics = [
          { label: "First Contentful Paint (FCP)", value: `${((cwv.fcp || 0) / 1000).toFixed(2)}s`, desc: "How quickly content appears" },
          { label: "Largest Contentful Paint (LCP)", value: `${((cwv.lcp || 0) / 1000).toFixed(2)}s`, desc: "Main content load time" },
          { label: "Cumulative Layout Shift (CLS)", value: `${(cwv.cls || 0).toFixed(3)}`, desc: "Visual stability score" },
          { label: "Total Blocking Time (TBT)", value: `${Math.round(cwv.tbt || 0)}ms`, desc: "Interactivity delay" },
          { label: "Time to Interactive (TTI)", value: `${((cwv.tti || 0) / 1000).toFixed(2)}s`, desc: "When page is usable" },
          { label: "Speed Index", value: `${((cwv.speedIndex || 0) / 1000).toFixed(2)}s`, desc: "Visual completion speed" },
        ];
        
        for (const metric of vitalMetrics) {
          if (y < 80) break;
          
          page6.drawRectangle({
            x: 40,
            y: y - 35,
            width: 515,
            height: 35,
            color: rgb(0.98, 0.98, 1),
            borderColor: rgb(0.2, 0.7, 0.2),
            borderWidth: 1,
          });
          
          page6.drawText(metric.label, {
            x: 60,
            y: y - 12,
            size: 9,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          page6.drawText(metric.value, {
            x: 380,
            y: y - 12,
            size: 11,
            color: rgb(0.1, 0.5, 0.1),
          });
          
          page6.drawText(metric.desc, {
            x: 60,
            y: y - 23,
            size: 8,
            color: rgb(0.6, 0.6, 0.6),
          });
          
          y -= 40;
        }
        
        // Add explanation
        if (y > 80) {
          page6.drawRectangle({
            x: 40,
            y: y - 50,
            width: 515,
            height: 50,
            color: rgb(0.98, 0.98, 1),
            borderColor: rgb(0.7, 0.9, 0.7),
            borderWidth: 0.5,
          });
          
          page6.drawText("Core Web Vitals measure real user experience: loading speed (FCP/LCP), visual stability (CLS), and interactivity (TBT/TTI).", {
            x: 55,
            y: y - 20,
            size: 8,
            color: rgb(0.3, 0.6, 0.3),
          });
        }
      }
      
      // PAGE 7: GOOGLE LIGHTHOUSE SCORES
      if (scanResults.performance?.lighthouse_scores) {
        const page7 = pdfDoc.addPage([pageWidth, pageHeight]);
        drawPageHeader(page7, "Google Lighthouse Scores", pageNum++);
        y = pageHeight - 100;
        
        page7.drawText("Comprehensive Lighthouse Analysis", {
          x: 40,
          y: y,
          size: 12,
          color: rgb(0.1, 0.3, 0.6),
        });
        y -= 30;
        
        const lh = scanResults.performance.lighthouse_scores;
        const lighthouseScores = [
          { label: "Performance", value: lh.performance || 0 },
          { label: "Accessibility", value: lh.accessibility || 0 },
          { label: "Best Practices", value: lh.bestPractices || 0 },
          { label: "SEO", value: lh.seo || 0 },
          { label: "PWA", value: lh.pwa || 0 },
        ];
        
        for (const score of lighthouseScores) {
          const scoreVal = score.value;
          const color = scoreVal >= 80 ? rgb(0.1, 0.6, 0.2) : scoreVal >= 60 ? rgb(1, 0.7, 0) : rgb(0.8, 0.1, 0.1);
          
          page7.drawRectangle({
            x: 40,
            y: y - 30,
            width: 515,
            height: 30,
            color: rgb(0.98, 0.98, 1),
            borderColor: color,
            borderWidth: 2,
          });
          
          page7.drawText(score.label, {
            x: 60,
            y: y - 12,
            size: 10,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          page7.drawText(`${scoreVal}/100`, {
            x: 420,
            y: y - 12,
            size: 14,
            color: color,
          });
          
          // Progress bar
          const barWidth = (scoreVal / 100) * 80;
          page7.drawRectangle({
            x: 60,
            y: y - 24,
            width: 80,
            height: 4,
            color: rgb(0.9, 0.9, 0.9),
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          });
          
          page7.drawRectangle({
            x: 60,
            y: y - 24,
            width: barWidth,
            height: 4,
            color: color,
          });
          
          y -= 35;
        }
        
        // Add explanation
        if (y > 80) {
          page7.drawRectangle({
            x: 40,
            y: y - 40,
            width: 515,
            height: 40,
            color: rgb(0.98, 0.98, 1),
            borderColor: rgb(0.7, 0.9, 0.7),
            borderWidth: 0.5,
          });
          
          page7.drawText("Scores 80+: Excellent | 60-79: Good | Below 60: Needs improvement. Focus on areas with lower scores.", {
            x: 55,
            y: y - 20,
            size: 8,
            color: rgb(0.3, 0.6, 0.3),
          });
        }
      }
      
      // PAGE 8: E2E TESTING DETAILED
      if (scanResults.e2e) {
        const page8 = pdfDoc.addPage([pageWidth, pageHeight]);
        drawPageHeader(page8, "End-to-End Testing Analysis", pageNum++);
        y = pageHeight - 100;
        
        page8.drawText("Interactive Elements Detected", {
          x: 40,
          y: y,
          size: 12,
          color: rgb(0.5, 0.2, 0.8),
        });
        y -= 25;
        
        // E2E Metrics
        const e2eMetrics = [
          { label: "Buttons Found", value: scanResults.e2e.buttons_found || 0, desc: "Interactive button elements" },
          { label: "Links Found", value: scanResults.e2e.links_found || 0, desc: "Navigational links" },
          { label: "Forms Found", value: scanResults.e2e.forms_found || 0, desc: "User input forms" },
        ];
        
        for (const metric of e2eMetrics) {
          page8.drawRectangle({
            x: 40,
            y: y - 32,
            width: 515,
            height: 32,
            color: rgb(0.95, 0.93, 1),
            borderColor: rgb(0.5, 0.2, 0.8),
            borderWidth: 1,
          });
          
          page8.drawText(metric.label, {
            x: 60,
            y: y - 12,
            size: 10,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          page8.drawText(`${metric.value}`, {
            x: 420,
            y: y - 12,
            size: 16,
            color: rgb(0.5, 0.2, 0.8),
          });
          
          page8.drawText(metric.desc, {
            x: 60,
            y: y - 22,
            size: 8,
            color: rgb(0.6, 0.6, 0.6),
          });
          
          y -= 38;
        }
        
        y -= 15;
        
        // Primary Actions
        if (scanResults.e2e.primary_actions && scanResults.e2e.primary_actions.length > 0) {
          page8.drawText("Primary Actions Detected", {
            x: 40,
            y: y,
            size: 11,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= 18;
          
          for (const action of scanResults.e2e.primary_actions.slice(0, 8)) {
            if (y < 60) break;
            
            page8.drawRectangle({
              x: 40,
              y: y - 15,
              width: 515,
              height: 15,
              color: rgb(0.95, 0.93, 1),
              borderColor: rgb(0.7, 0.7, 0.9),
              borderWidth: 0.5,
            });
            
            page8.drawText(`- ${String(action).substring(0, 100)}`, {
              x: 60,
              y: y - 8,
              size: 8,
              color: rgb(0.3, 0.3, 0.3),
            });
            
            y -= 18;
          }
        }
      }
      
      // PAGE 9: TECHNOLOGIES DETECTED
      if (technologies.length > 0) {
        const page9 = pdfDoc.addPage([pageWidth, pageHeight]);
        drawPageHeader(page9, "Technologies Detected", pageNum++);
        y = pageHeight - 100;
        
        page9.drawText("Technology Stack Analysis", {
          x: 40,
          y: y,
          size: 12,
          color: rgb(0.1, 0.3, 0.6),
        });
        y -= 25;
        
        page9.drawText(`Total Technologies Detected: ${technologies.length}`, {
          x: 40,
          y: y,
          size: 10,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 20;
        
        let col = 0;
        let xPos = 40;
        let currentY = y;
        
        for (const tech of technologies) {
          const boxWidth = 240;
          const boxHeight = 28;
          
          if (col > 1) {
            col = 0;
            currentY -= 35;
            xPos = 40;
          }
          
          if (currentY < 80) {
            break;
          }
          
          page9.drawRectangle({
            x: xPos,
            y: currentY - boxHeight,
            width: boxWidth,
            height: boxHeight,
            color: rgb(0.95, 0.98, 1),
            borderColor: rgb(0.3, 0.5, 0.8),
            borderWidth: 0.5,
          });
          
          page9.drawText(`- ${tech}`, {
            x: xPos + 10,
            y: currentY - 15,
            size: 9,
            color: rgb(0.1, 0.3, 0.6),
          });
          
          xPos += 260;
          col++;
        }
        
        // Add explanation
        if (currentY > 100) {
          page9.drawRectangle({
            x: 40,
            y: currentY - 60,
            width: 515,
            height: 60,
            color: rgb(0.98, 0.98, 1),
            borderColor: rgb(0.7, 0.9, 0.7),
            borderWidth: 0.5,
          });
          
          page9.drawText("Technology Stack: The frameworks, libraries, and platforms used to build your website. Understanding", {
            x: 55,
            y: currentY - 30,
            size: 8,
            color: rgb(0.3, 0.6, 0.3),
          });
          
          page9.drawText("your tech stack helps evaluate maintenance, security, and scalability of your application.", {
            x: 55,
            y: currentY - 42,
            size: 8,
            color: rgb(0.3, 0.6, 0.3),
          });
        }
      }
      
      // PAGE 10: AI ANALYSIS & RECOMMENDATIONS (EXPANDED)
      if (aiSummary || (aiRecommendations && aiRecommendations.length > 0)) {
        const page10 = pdfDoc.addPage([pageWidth, pageHeight]);
        drawPageHeader(page10, "AI Analysis & Recommendations", pageNum++);
        y = pageHeight - 100;
        
        if (aiSummary) {
          page10.drawText("AI-Powered Summary", {
            x: 40,
            y: y,
            size: 13,
            color: rgb(0.1, 0.3, 0.6),
          });
          y -= 20;
          
          // Large summary box
          const summaryText = String(aiSummary);
          const summaryLines = wrapText(summaryText, 470, 9);
          const summaryHeight = Math.min(summaryLines.length * 12 + 20, 280);
          
          page10.drawRectangle({
            x: 40,
            y: y - summaryHeight,
            width: 515,
            height: summaryHeight,
            color: rgb(0.95, 0.98, 1),
            borderColor: rgb(0.3, 0.5, 0.8),
            borderWidth: 2,
          });
          
          for (const line of summaryLines.slice(0, Math.floor(summaryHeight / 12))) {
            page10.drawText(line, {
              x: 60,
              y: y - 15,
              size: 9,
              color: rgb(0.1, 0.2, 0.3),
            });
            y -= 12;
          }
          
          y -= 30;
        }
        
        if (aiRecommendations && aiRecommendations.length > 0) {
          page10.drawText("Recommendations", {
            x: 40,
            y: y,
            size: 13,
            color: rgb(0.1, 0.5, 0.1),
          });
          y -= 18;
          
          let recCount = 0;
          for (const rec of aiRecommendations) {
            if (y < 80 || recCount >= 12) break;
            
            const recText = `${recCount + 1}. ${String(rec).substring(0, 120)}`;
            page10.drawText(recText, {
              x: 60,
              y: y,
              size: 8,
              color: rgb(0.1, 0.4, 0.1),
            });
            y -= 14;
            recCount++;
          }
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
      console.log(`Comprehensive PDF generated. Size: ${(pdfBytes.length / 1024).toFixed(2)} KB, Pages: ${pageNum - 1}`);
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr);
    }

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
        accessibility_issue_count: accessibilityIssueCount,
        security_checks_passed: securityChecksPassed,
        security_checks_total: 7,
        technologies: technologies,
        exposed_endpoints: exposedEndpoints,
        og_image: ogImage,
        pdf_report: pdfBase64,
      })
      .eq("id", scanId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    console.log("Scan completed successfully with PDF generated and stored");
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
  }
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

      const buttons = Array.from(doc.querySelectorAll('button'));
      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const forms = Array.from(doc.querySelectorAll('form'));

      const primaryActions = buttons
        .map(b => (b.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 5);

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

      const buttonMatches = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
      const linkMatches = html.match(/<a[^>]*href=["']([^"']*)["'][^>]*>/gi) || [];
      const formMatches = html.match(/<form[^>]*>/gi) || [];

      return {
        buttons_found: buttonMatches.length,
        links_found: linkMatches.length,
        forms_found: formMatches.length,
        primary_actions: buttonMatches.slice(0, 5).map((btn) => btn.replace(/<[^>]*>/g, '').trim()).filter(s => s),
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

    const html = await response.text();

    const scriptMatches = html.match(/fetch\(["']([^"']+)["']|axios\.[a-z]+\(["']([^"']+)["']|\$\.ajax\(["']([^"']+)["']/g) || [];
    scriptMatches.forEach((match) => {
      const path = match.match(/["']([^"']+)["']/)?.[1];
      if (path && path.startsWith('/')) {
        endpoints.push({ method: "GET", path, status: 0 });
      }
    });

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
    const issues = [];

    if (!headers.get("strict-transport-security")) {
      issues.push({
        severity: "high",
        category: "Security",
        description: "Missing HSTS header - site vulnerable to protocol downgrade attacks"
      });
    }

    if (!headers.get("x-content-type-options")) {
      issues.push({
        severity: "medium",
        category: "Security",
        description: "Missing X-Content-Type-Options header - vulnerable to MIME sniffing"
      });
    }

    if (!headers.get("x-frame-options") && !headers.get("content-security-policy")) {
      issues.push({
        severity: "high",
        category: "Security",
        description: "Missing X-Frame-Options/CSP - vulnerable to clickjacking attacks"
      });
    }

    const csp = headers.get("content-security-policy");
    if (!csp) {
      issues.push({
        severity: "medium",
        category: "Security",
        description: "No Content-Security-Policy - vulnerable to XSS attacks"
      });
    }

    if (!headers.get("x-xss-protection")) {
      issues.push({
        severity: "low",
        category: "Security",
        description: "Missing X-XSS-Protection header"
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

    return {
      issues,
      checks_performed: 7,
      checks_passed: 7 - issues.length,
      https_enabled: url.startsWith("https"),
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
    const pagespeedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo`;

    console.log("Calling Google PageSpeed Insights API...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(pagespeedUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.status}`);
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

function extractOGImage(htmlContent: string, baseUrl: string): string | null {
  try {
    // Try multiple variations of og:image meta tag
    let ogImageMatch = htmlContent.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    
    if (!ogImageMatch) {
      ogImageMatch = htmlContent.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    }
    
    if (!ogImageMatch) {
      ogImageMatch = htmlContent.match(/<meta\s+name=["']og:image["']\s+content=["']([^"']+)["']/i);
    }
    
    if (!ogImageMatch) {
      // Try with different whitespace patterns
      ogImageMatch = htmlContent.match(/<meta[^>]*?og:image[^>]*?content\s*=\s*["']([^"']+)["']/i);
    }
    
    if (!ogImageMatch) {
      ogImageMatch = htmlContent.match(/<meta[^>]*?content\s*=\s*["']([^"']+)["'][^>]*?og:image/i);
    }
    
    if (ogImageMatch && ogImageMatch[1]) {
      let imageUrl = ogImageMatch[1].trim();
      
      // If absolute URL, return it
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        console.log(`OG image found: ${imageUrl}`);
        return imageUrl;
      }
      
      // Handle relative URLs
      if (imageUrl.startsWith('/')) {
        try {
          const url = new URL(baseUrl);
          imageUrl = `${url.protocol}//${url.hostname}${imageUrl}`;
          console.log(`OG image (relative) resolved to: ${imageUrl}`);
          return imageUrl;
        } catch (e) {
          console.error('Failed to resolve relative OG image URL:', e);
        }
      } else if (imageUrl.startsWith('../') || imageUrl.startsWith('./')) {
        try {
          const url = new URL(baseUrl);
          imageUrl = new URL(imageUrl, baseUrl).href;
          console.log(`OG image (relative path) resolved to: ${imageUrl}`);
          return imageUrl;
        } catch (e) {
          console.error('Failed to resolve relative path OG image:', e);
        }
      }
    }
    
    console.log('No OG image meta tag found in HTML');
    return null;
  } catch (error) {
    console.error('Error extracting OG image:', error);
    return null;
  }
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

async function generateAIAnalysis(url: string, scanResults: Partial<{ security?: SecurityResults; accessibility?: AccessibilityResults; performance?: PerformanceResults }>, topIssues: TopIssue[], overallScore: number) {
  const groqKey = Deno.env.get("Console_Groq_AI_API_Key");
  console.log("Groq API Key configured:", !!groqKey);

  if (!groqKey) {
    console.log("Groq API key not configured, skipping AI analysis");
    return { summary: null, recommendations: [] };
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

Format as JSON: {"summary": "...", "recommendations": ["...", "..."]}`;

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
        max_tokens: 500,
      }),
    });

    console.log("Groq API response status:", response.status);

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      console.error("Groq API error:", response.status, txt);
      return { summary: null, recommendations: [] };
    }

    const data = await response.json();
    console.log("Groq API response received");
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.log("Groq API returned no content");
      return { summary: null, recommendations: [] };
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
        recommendations: parsed.recommendations || []
      };
    } catch (parseError) {
      console.log("Groq content not valid JSON, using raw content:", parseError);
      return {
        summary: content,
        recommendations: []
      };
    }
  } catch (error) {
    console.error("AI analysis error:", error);
    return { summary: null, recommendations: [] };
  }
}
