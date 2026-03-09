import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { ScanResult as DBScanRow, TopIssue, SecurityIssue, AccessibilityIssue, APIEndpoint, SecurityHeaderCheck } from '../../../src/types/scan';

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
  "Cache-Control": "no-store",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface ReportRequest {
  scanId: string;
  email: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { scanId, email }: ReportRequest = await req.json();

    console.log(`Processing report request for ${email}, scan ${scanId}`);
    console.log(`RESEND_API_KEY configured: ${!!RESEND_API_KEY}`);
    console.log(`RESEND_API_KEY value (first 10 chars): ${RESEND_API_KEY?.substring(0, 10) || 'NOT SET'}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: scanResult, error: fetchError } = await supabase
      .from("scan_results")
      .select("*")
      .eq("id", scanId)
      .maybeSingle();

    if (fetchError || !scanResult) {
      console.error("Scan not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "Scan not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (scanResult.scan_status !== 'completed') {
      return new Response(
        JSON.stringify({ error: "Scan is not complete yet. Please wait until processing finishes." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const htmlReport = generateHTMLReport(scanResult as DBScanRow);
    const textReport = generateTextReport(scanResult as DBScanRow);

    console.log(`Report generated. HTML: ${htmlReport.length} chars, Text: ${textReport.length} chars`);

    console.log("Preparing email report");

    if (RESEND_API_KEY) {
      console.log("Sending email via Resend...");
      
      try {
        const emailPayload: Record<string, unknown> = {
          from: "Robolab Scanner <noreply@robo-lab.io>",
          to: [email],
          subject: `Website Scan Report - ${scanResult.target_url}`,
          html: htmlReport,
          text: textReport,
        };

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailPayload),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          console.error("Resend API error:", errorData);
          throw new Error(`Email sending failed: ${JSON.stringify(errorData)}`);
        }

        const emailData = await emailResponse.json();
        console.log("Email sent successfully:", emailData);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Report sent successfully",
            emailId: emailData.id
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (emailError) {
        console.error("Email sending error:", emailError);
        throw emailError;
      }
    } else {
      console.log("RESEND_API_KEY not configured, using mock mode");
      console.log(`Report would be sent to: ${email}`);
      console.log(`Report length: ${textReport.length} characters`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Report generated (mock mode - configure RESEND_API_KEY to send real emails)",
          preview: textReport.substring(0, 500) + "..."
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Report generation error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Failed to generate report",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function parseAISummary(raw: string | null): { summary: string | null; recommendations: string[] } {
  if (!raw) return { summary: null, recommendations: [] };
  
  try {
    // Remove markdown code blocks
    let jsonStr = raw.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary || null,
      recommendations: parsed.recommendations || []
    };
  } catch {
    // If parsing fails, return raw content as summary
    return { summary: raw, recommendations: [] };
  }
}

function getSecurityScore(scanResult: DBScanRow): number | null {
  if (typeof scanResult.security_results?.score === 'number') {
    return scanResult.security_results.score;
  }

  if (typeof scanResult.security_checks_passed === 'number' && typeof scanResult.security_checks_total === 'number' && scanResult.security_checks_total > 0) {
    return Math.round((scanResult.security_checks_passed / scanResult.security_checks_total) * 100);
  }

  return null;
}

function getSecurityProtocol(scanResult: DBScanRow): string {
  if (scanResult.security_results?.protocol) {
    return scanResult.security_results.protocol;
  }
  if (scanResult.security_results?.https_enabled === true) {
    return 'HTTPS';
  }
  if (scanResult.security_results?.https_enabled === false) {
    return 'HTTP';
  }
  return 'N/A';
}

function getSecurityIssueText(issue: SecurityIssue): string {
  return issue.message || issue.description || 'No details provided';
}

function getSecurityHeaderChecks(scanResult: DBScanRow): SecurityHeaderCheck[] {
  const existing = scanResult.security_results?.header_checks;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }

  const fallbackPurposes: Record<string, { purpose: string; severity: 'high' | 'medium' | 'low'; recommendation: string }> = {
    'Content-Security-Policy': { purpose: 'Prevent XSS attacks', severity: 'high', recommendation: 'Add a strict CSP policy.' },
    'Strict-Transport-Security': { purpose: 'Enforce HTTPS', severity: 'high', recommendation: 'Add HSTS with max-age and includeSubDomains.' },
    'X-Frame-Options': { purpose: 'Prevent clickjacking', severity: 'high', recommendation: 'Set X-Frame-Options to DENY or SAMEORIGIN.' },
    'X-Content-Type-Options': { purpose: 'Prevent MIME sniffing', severity: 'medium', recommendation: 'Set X-Content-Type-Options to nosniff.' },
    'Referrer-Policy': { purpose: 'Protect referrer data', severity: 'medium', recommendation: 'Set Referrer-Policy to strict-origin-when-cross-origin.' },
    'Permissions-Policy': { purpose: 'Restrict browser APIs', severity: 'medium', recommendation: 'Restrict unneeded browser features.' },
    'Cross-Origin-Opener-Policy': { purpose: 'Prevent cross-origin attacks', severity: 'medium', recommendation: 'Set COOP to same-origin.' },
    'Cross-Origin-Embedder-Policy': { purpose: 'Secure resource isolation', severity: 'medium', recommendation: 'Set COEP to require-corp or credentialless.' },
    'Cross-Origin-Resource-Policy': { purpose: 'Control resource sharing', severity: 'low', recommendation: 'Set CORP to same-origin/same-site as appropriate.' },
    'Cache-Control': { purpose: 'Prevent sensitive caching', severity: 'medium', recommendation: 'Use no-store/no-cache/private on sensitive responses.' },
  };

  const rawHeaders = scanResult.security_results?.security_headers || {};
  return Object.entries(rawHeaders).map(([header, value]) => {
    const meta = fallbackPurposes[header] || {
      purpose: 'Security hardening',
      severity: 'low' as const,
      recommendation: 'Review and harden this header configuration.',
    };
    return {
      header,
      purpose: meta.purpose,
      present: typeof value === 'string' && value.trim().length > 0,
      value: typeof value === 'string' ? value : undefined,
      severity: meta.severity,
      recommendation: meta.recommendation,
    };
  });
}

function getAccessibilityIssueText(issue: AccessibilityIssue): string {
  return issue.message || 'No details provided';
}

function getDetectedEnvironment(scanResult: DBScanRow): string {
  if (scanResult.scan_environment) return String(scanResult.scan_environment);
  return scanResult.performance_results?.source === 'google-pagespeed' ? 'mobile' : 'desktop';
}

function getSEOResults(scanResult: DBScanRow): { missing_meta_tags: string[]; sitemap_detected?: boolean; structured_data_missing?: boolean } {
  const raw = (scanResult.seo_results || {}) as Record<string, unknown>;
  return {
    missing_meta_tags: Array.isArray(raw.missing_meta_tags) ? raw.missing_meta_tags.filter((item): item is string => typeof item === 'string') : [],
    sitemap_detected: typeof raw.sitemap_detected === 'boolean' ? raw.sitemap_detected : undefined,
    structured_data_missing: typeof raw.structured_data_missing === 'boolean' ? raw.structured_data_missing : undefined,
  };
}

function getAnalysisExplanations(scanResult: DBScanRow): Required<NonNullable<DBScanRow['analysis_explanations']>> {
  const raw = (scanResult.analysis_explanations || {}) as Record<string, unknown>;
  const securityIssues = scanResult.security_results?.issues?.length || 0;
  const apiDetected = scanResult.api_results?.endpoints_detected || 0;
  const e2eTotal = (scanResult.e2e_results?.buttons_found || 0) + (scanResult.e2e_results?.links_found || 0) + (scanResult.e2e_results?.forms_found || 0);
  const seo = getSEOResults(scanResult);

  const fallback = {
    overall: `Overall analysis completed with score ${scanResult.overall_score || 0}/100 for ${scanResult.target_url}.`,
    security: securityIssues === 0
      ? 'Security analysis completed and no immediate header-level security issues were detected.'
      : `Security analysis completed and ${securityIssues} issue(s) were detected that should be reviewed.`,
    performance: `Performance analysis completed with score ${scanResult.performance_results?.score || 0}/100 and load time ${scanResult.performance_results?.load_time_ms || 0}ms.`,
    accessibility: `Accessibility analysis completed with score ${scanResult.accessibility_results?.score || 0}/100 and ${scanResult.accessibility_results?.total_issues || 0} issue(s).`,
    api: apiDetected === 0
      ? 'API analysis completed but no endpoints were detected through passive page-source inspection.'
      : `API analysis completed with ${apiDetected} detected endpoint(s).`,
    e2e: e2eTotal === 0
      ? 'E2E analysis completed but no interactive elements were detected on the scanned page snapshot.'
      : `E2E analysis completed with ${scanResult.e2e_results?.buttons_found || 0} button(s), ${scanResult.e2e_results?.links_found || 0} link(s), and ${scanResult.e2e_results?.forms_found || 0} form(s).`,
    seo: `SEO analysis completed with score ${scanResult.seo_score ?? scanResult.performance_results?.lighthouse_scores?.seo ?? 0}/100. Missing meta tags: ${seo.missing_meta_tags.length > 0 ? seo.missing_meta_tags.join(', ') : 'none'}. Sitemap: ${seo.sitemap_detected === undefined ? 'unknown' : seo.sitemap_detected ? 'yes' : 'no'}. Structured data missing: ${seo.structured_data_missing === undefined ? 'unknown' : seo.structured_data_missing ? 'yes' : 'no'}.`,
    yslow: typeof raw.yslow === 'string' && raw.yslow.trim().length > 0 ? raw.yslow : 'Structure Score optimization notes are not separately available in this scan.',
  };

  return {
    overall: typeof raw.overall === 'string' && raw.overall.trim().length > 0 ? raw.overall : fallback.overall,
    security: typeof raw.security === 'string' && raw.security.trim().length > 0 ? raw.security : fallback.security,
    performance: typeof raw.performance === 'string' && raw.performance.trim().length > 0 ? raw.performance : fallback.performance,
    accessibility: typeof raw.accessibility === 'string' && raw.accessibility.trim().length > 0 ? raw.accessibility : fallback.accessibility,
    api: typeof raw.api === 'string' && raw.api.trim().length > 0 ? raw.api : fallback.api,
    e2e: typeof raw.e2e === 'string' && raw.e2e.trim().length > 0 ? raw.e2e : fallback.e2e,
    seo: typeof raw.seo === 'string' && raw.seo.trim().length > 0 ? raw.seo : fallback.seo,
    yslow: fallback.yslow,
  };
}

function generateHTMLReport(scanResult: DBScanRow): string {
  const scoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const severityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#d97706',
      low: '#0891b2'
    };
    return `<span style="background-color: ${colors[severity] || '#6b7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${severity.toUpperCase()}</span>`;
  };

  // Parse AI summary from markdown if needed
  const aiData = parseAISummary(scanResult.ai_summary ?? null);
  const aiSummary = aiData.summary;
  const aiRecommendations = Array.isArray(scanResult.ai_recommendations) && scanResult.ai_recommendations.length > 0
    ? scanResult.ai_recommendations
    : aiData.recommendations;
  const securityScore = getSecurityScore(scanResult);
  const securityProtocol = getSecurityProtocol(scanResult);
  const securityStatus = scanResult.security_results?.status;
  const securityHeaderChecks = getSecurityHeaderChecks(scanResult);
  const securityHeaderCheckRows = securityHeaderChecks.map((check) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>${check.header}</strong><br/><span style="font-size: 12px; color: #6b7280;">${check.purpose}</span></td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: ${check.present ? '#047857' : '#b91c1c'}; font-weight: 700;">${check.present ? 'PASS' : 'MISSING'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${check.value || 'Missing'}</td>
      </tr>
    `).join('');
  const securityRecommendations = (scanResult.security_results?.recommendations && scanResult.security_results.recommendations.length > 0)
    ? scanResult.security_results.recommendations
    : securityHeaderChecks.filter((check) => !check.present).map((check) => check.recommendation);
  const performanceStatus = scanResult.performance_results?.status;
  const accessibilityStatus = scanResult.accessibility_results?.status;
  const apiStatus = scanResult.api_results?.status;
  const e2eStatus = scanResult.e2e_results?.status;
  const seoResults = getSEOResults(scanResult);
  const explanations = getAnalysisExplanations(scanResult);
  const totalInteractiveElements = (scanResult.e2e_results?.buttons_found || 0) + (scanResult.e2e_results?.links_found || 0) + (scanResult.e2e_results?.forms_found || 0);
  const apiEndpointsDetected = scanResult.api_results?.endpoints_detected || 0;

  console.log("AI Data Debug:", {
    aiSummaryExists: !!scanResult.ai_summary,
    aiSummaryLength: String(scanResult.ai_summary).length,
    aiRecommendationsExists: !!scanResult.ai_recommendations,
    aiRecommendationsIsArray: Array.isArray(scanResult.ai_recommendations),
    aiRecommendationsLength: Array.isArray(scanResult.ai_recommendations) ? scanResult.ai_recommendations.length : 0,
    parsedAISummary: aiSummary ? "Present" : "Null",
    parsedRecommendationsLength: aiRecommendations.length,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robo-Lab Web Scanner AI Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">

  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:800px;margin:0 auto 30px;border-collapse:collapse;" bgcolor="#f8fbff">
    <tr>
      <td bgcolor="#f8fbff" style="padding:42px 36px;text-align:center;border:2px solid #bfdbfe;border-radius:12px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;" bgcolor="#f8fbff">
          <tr>
            <td align="center" bgcolor="#f8fbff">
              <font face="Arial, Helvetica, sans-serif" color="#1d4ed8" style="font-size:40px;font-weight:bold;letter-spacing:1px;">Robo Lab</font>
              <font face="Arial, Helvetica, sans-serif" color="#111827" style="font-size:18px;vertical-align:super;">&#174;</font>
              <br/>
              <font face="Arial, Helvetica, sans-serif" color="#2563eb" style="font-size:44px;font-weight:800;line-height:1.1;">Web Scanner AI Report</font>
              <br/>
              <font face="Arial, Helvetica, sans-serif" color="#111827" style="font-size:16px;letter-spacing:0.5px;">Comprehensive Scanned Analysis</font>
              <br/>
              <a href="https://webscanner.robo-lab.io" style="display:inline-block;margin-top:14px;font-family:Arial, Helvetica, sans-serif;font-size:18px;color:#111827;text-decoration:none;font-weight:600;">🌐 https://webscanner.robo-lab.io</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Scan Summary</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Target URL:</td>
        <td style="padding: 10px 0; color: #111827;">${scanResult.target_url}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Scan Date:</td>
        <td style="padding: 10px 0; color: #111827;">${new Date(scanResult.created_at).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Scan Duration:</td>
        <td style="padding: 10px 0; color: #111827;">${scanResult.scan_duration_ms ? `${Math.max(1, Math.round(scanResult.scan_duration_ms / 1000))}s` : 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Pages Scanned:</td>
        <td style="padding: 10px 0; color: #111827;">${scanResult.pages_scanned || 1}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Scan Depth:</td>
        <td style="padding: 10px 0; color: #111827;">${scanResult.scan_depth || 1}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Environment:</td>
        <td style="padding: 10px 0; color: #111827; text-transform: capitalize;">${getDetectedEnvironment(scanResult)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Structure Score:</td>
        <td style="padding: 10px 0; color: #111827;">${scanResult.yslow_score ?? 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Overall Score:</td>
        <td style="padding: 10px 0;">
          <span style="font-size: 36px; font-weight: bold; color: ${scoreColor(scanResult.overall_score || 0)};">${scanResult.overall_score || 0}</span>
          <span style="font-size: 20px; color: #9ca3af;">/100</span>
        </td>
      </tr>
    </table>
    <p style="margin-top: 14px; color: #374151;"><strong>Overall explanation:</strong> ${explanations.overall}</p>
  </div>

  ${aiSummary ? `
  <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 2px solid #3b82f6;">
    <h2 style="color: #1e40af; margin-top: 0; border-bottom: 2px solid #60a5fa; padding-bottom: 10px;">🤖 AI-Powered Analysis</h2>
    <p style="color: #1e3a8a; line-height: 1.8; margin: 0; font-size: 15px;"><strong>Summary:</strong> ${aiSummary}</p>
  </div>
  ` : ''}

  ${aiRecommendations && aiRecommendations.length > 0 ? `
  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">💡 AI Recommendations</h2>
    <ol style="color: #374151; line-height: 1.8; padding-left: 20px;">
      ${aiRecommendations.map((rec: string) => `<li style="margin-bottom: 12px;">${rec}</li>`).join('')}
    </ol>
  </div>
  ` : ''}

  ${scanResult.top_issues && scanResult.top_issues.length > 0 ? `
  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">⚠️ Top Issues</h2>
    ${scanResult.top_issues.map((issue: TopIssue) => `
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 15px; border-radius: 4px;">
        <div style="margin-bottom: 5px;">
          <strong style="color: #92400e;">${issue.category}</strong>
          ${severityBadge(issue.severity || 'low')}
        </div>
        <p style="margin: 5px 0 0 0; color: #78350f;">${issue.description}</p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🔒 Security Analysis</h2>
    <p><strong>Explanation:</strong> ${explanations.security}</p>
    <p><strong>Status:</strong> Expanded security scan completed (${securityStatus || 'N/A'})</p>
    <p><strong>Security issues detected:</strong> ${scanResult.security_results?.issues?.length || 0}</p>
    <p><strong>Score:</strong> <span style="color: ${scoreColor(securityScore || 0)};">${securityScore ?? 'N/A'}/100</span></p>
    <p><strong>Protocol:</strong> ${securityProtocol}</p>
    <p><strong>Checks passed:</strong> ${scanResult.security_results?.checks_passed ?? 0}/${scanResult.security_results?.checks_performed ?? securityHeaderChecks.length}</p>
    <p><strong>Scanner engine:</strong> ${scanResult.security_results?.scanner_engine || 'N/A'}</p>

    ${securityHeaderChecks.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin-top: 20px;">Header Hardening Checks (Full Report):</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; color: #374151;">Header</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; color: #374151;">Status</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; color: #374151;">Value</th>
          </tr>
        </thead>
        <tbody>
          ${securityHeaderCheckRows}
        </tbody>
      </table>
    ` : '<p><strong>Header hardening checks:</strong> N/A</p>'}
    
    ${scanResult.security_results?.issues && scanResult.security_results.issues.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin-top: 20px;">Issues Found:</h3>
      <ul style="list-style: none; padding: 0;">
        ${scanResult.security_results.issues.map((issue: SecurityIssue) => `
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
            ${severityBadge(issue.severity || 'low')} ${getSecurityIssueText(issue)}
          </li>
        `).join('')}
      </ul>
    ` : '<p style="color: #10b981;">✓ No security issues detected</p>'}

    ${securityRecommendations.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin-top: 20px;">Security Recommendations:</h3>
      <ul style="padding-left: 20px; color: #374151;">
        ${securityRecommendations.map((item) => `<li style="margin-bottom: 6px;">${item}</li>`).join('')}
      </ul>
    ` : ''}
  </div>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">⚡ Performance Result</h2>
    <p><strong>Explanation:</strong> ${explanations.performance}</p>
    <p><strong>Structure Score explanation:</strong> ${explanations.yslow}</p>
    <p><strong>Status:</strong> ${performanceStatus || 'N/A'}</p>
    <p><strong>Score:</strong> <span style="color: ${scoreColor(scanResult.performance_results?.score || 0)};">${scanResult.performance_results?.score || 'N/A'}/100</span></p>
    <p><strong>LCP:</strong> ${scanResult.performance_results?.core_web_vitals?.lcp ?? 'N/A'} ms</p>
    <p><strong>CLS:</strong> ${scanResult.performance_results?.core_web_vitals?.cls ?? 'N/A'}</p>
    <p><strong>TTFB:</strong> N/A (not collected by current scanner)</p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
        <div style="color: #6b7280; font-size: 14px;">Load Time</div>
        <div style="font-size: 24px; font-weight: bold; color: #111827;">${scanResult.performance_results?.load_time_ms || 'N/A'}ms</div>
      </div>
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
        <div style="color: #6b7280; font-size: 14px;">Page Size</div>
        <div style="font-size: 24px; font-weight: bold; color: #111827;">${scanResult.performance_results?.page_size_kb || 'N/A'}KB</div>
      </div>
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
        <div style="color: #6b7280; font-size: 14px;">Images</div>
        <div style="font-size: 24px; font-weight: bold; color: #111827;">${scanResult.performance_results?.images_count ?? scanResult.performance_results?.image_count ?? 0}</div>
      </div>
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
        <div style="color: #6b7280; font-size: 14px;">Scripts</div>
        <div style="font-size: 24px; font-weight: bold; color: #111827;">${scanResult.performance_results?.scripts_count || 0}</div>
      </div>
    </div>
  </div>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🚀 Structure Score Result</h2>
    <p><strong>Structure Score:</strong> ${scanResult.yslow_score ?? 'N/A'}/100</p>
    <p><strong>Best-Practice Optimization Score:</strong> ${scanResult.yslow_score ?? 'N/A'}/100</p>
    <p><strong>Grade:</strong> ${((scanResult.yslow_results || {}) as Record<string, unknown>).grade || 'N/A'}</p>
    <p><strong>Checked at:</strong> ${((scanResult.yslow_results || {}) as Record<string, unknown>).checked_at || 'N/A'}</p>
    <p><strong>Total requests:</strong> ${(((scanResult.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.total_requests ?? 'N/A'}</p>
    <p><strong>Average load time (ms):</strong> ${(((scanResult.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.avg_load_time_ms ?? 'N/A'}</p>
    <p><strong>Main document/code needs improvement:</strong> ${(((scanResult.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.compressed_main_doc === undefined ? 'N/A' : (((scanResult.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown>).compressed_main_doc ? 'Yes' : 'No'}</p>
    <p><strong>Minified asset ratio:</strong> ${(((scanResult.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.minified_asset_ratio ?? 'N/A'}</p>
    <p><strong>Average cache TTL (seconds):</strong> ${(((scanResult.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.avg_asset_cache_ttl_seconds ?? 'N/A'}</p>
    <p><strong>Rule scores:</strong> caching ${(((scanResult.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.caching ?? 'N/A'}, cookies ${(((scanResult.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.cookies ?? 'N/A'}, requests ${(((scanResult.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.requests ?? 'N/A'}, redirects ${(((scanResult.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.redirects ?? 'N/A'}, compression ${(((scanResult.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.compression ?? 'N/A'}, minification ${(((scanResult.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.minification ?? 'N/A'}</p>
    <p><strong>Recommendations:</strong> ${Array.isArray(((scanResult.yslow_results || {}) as Record<string, unknown>).recommendations) && (((scanResult.yslow_results || {}) as Record<string, unknown>).recommendations as unknown[]).length > 0 ? (((scanResult.yslow_results || {}) as Record<string, unknown>).recommendations as unknown[]).map((item) => String(item)).join(' | ') : 'N/A'}</p>
  </div>

  ${(Array.isArray(scanResult.crawl_results) && scanResult.crawl_results.length > 0) ? `
  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🕸️ Crawled Pages</h2>
    <p><strong>Total pages crawled:</strong> ${scanResult.pages_scanned || (scanResult.crawl_results as Array<Record<string, unknown>>).length}</p>
    <ul style="list-style: none; padding: 0; color: #374151;">
      ${(scanResult.crawl_results as Array<Record<string, unknown>>).slice(0, 20).map((page) => `
        <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
          • ${String(page.url || '')} (depth ${String(page.depth ?? 0)}, status ${String(page.status ?? 'N/A')}, load ${String(page.load_time_ms ?? 'N/A')}ms)
        </li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">👁️ Overall Accessibility Result</h2>
    <p><strong>Accessibility explanation:</strong> ${explanations.accessibility}</p>
    <p><strong>SEO explanation:</strong> ${explanations.seo}</p>
    <p><strong>Status:</strong> ${accessibilityStatus || 'N/A'}</p>
    <p><strong>Score:</strong> <span style="color: ${scoreColor(scanResult.accessibility_results?.score || 0)};">${scanResult.accessibility_results?.score || 'N/A'}/100</span></p>
    <p><strong>Total Issues:</strong> ${scanResult.accessibility_results?.total_issues || 0}</p>
    <p><strong>SEO score explanation:</strong> ${scanResult.seo_score ?? scanResult.performance_results?.lighthouse_scores?.seo ?? 0}/100</p>
    <p><strong>Missing meta tags:</strong> ${seoResults.missing_meta_tags.length > 0 ? seoResults.missing_meta_tags.join(', ') : 'None detected'}</p>
    <p><strong>Sitemap detected:</strong> ${seoResults.sitemap_detected === undefined ? 'Unknown' : seoResults.sitemap_detected ? 'Yes' : 'No'}</p>
    <p><strong>Missing structured data:</strong> ${seoResults.structured_data_missing === undefined ? 'Unknown' : seoResults.structured_data_missing ? 'Yes' : 'No'}</p>
    
    ${scanResult.accessibility_results?.issues && scanResult.accessibility_results.issues.length > 0 ? `
      <ul style="list-style: none; padding: 0;">
        ${scanResult.accessibility_results.issues.map((issue: AccessibilityIssue) => `
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
            ${severityBadge(issue.severity || 'low')} ${getAccessibilityIssueText(issue)}
          </li>
        `).join('')}
      </ul>
    ` : '<p style="color: #10b981;">✓ No accessibility issues detected</p>'}
  </div>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🔌 API Analysis Result</h2>
    <p><strong>Explanation:</strong> ${explanations.api}</p>
    <p><strong>Status:</strong> ${apiStatus || 'N/A'}</p>
    ${scanResult.api_results?.error ? `<p><strong>Error:</strong> ${scanResult.api_results.error}</p>` : ''}
    <p><strong>Endpoints Detected:</strong> ${apiEndpointsDetected}</p>
    ${apiEndpointsDetected === 0 ? '<p><strong>Why 0:</strong> No endpoints were detected from passive page-source analysis. APIs may be bundled, dynamically rendered, or behind runtime auth.</p>' : ''}

    ${scanResult.api_results?.endpoints && scanResult.api_results.endpoints.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin-top: 20px;">Endpoints:</h3>
      <ul style="list-style: none; padding: 0; color: #374151;">
        ${scanResult.api_results.endpoints.map((endpoint: APIEndpoint) => `
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
            • ${endpoint.method} ${endpoint.path}
          </li>
        `).join('')}
      </ul>
    ` : '<p style="color: #9ca3af;">No endpoints detected</p>'}
  </div>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🤖 E2E Testing Result</h2>
    <p><strong>Explanation:</strong> ${explanations.e2e}</p>
    <p><strong>Status:</strong> ${e2eStatus || 'N/A'}</p>
    ${scanResult.e2e_results?.error ? `<p><strong>Error:</strong> ${scanResult.e2e_results.error}</p>` : ''}
    <p><strong>Buttons Found:</strong> ${scanResult.e2e_results?.buttons_found || 0}</p>
    <p><strong>Links Found:</strong> ${scanResult.e2e_results?.links_found || 0}</p>
    <p><strong>Forms Found:</strong> ${scanResult.e2e_results?.forms_found || 0}</p>
    ${totalInteractiveElements === 0 ? '<p><strong>Why 0:</strong> The scanned page appears static or interactive elements are rendered only after client-side runtime.</p>' : ''}
    
    ${scanResult.e2e_results?.primary_actions && scanResult.e2e_results.primary_actions.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin-top: 20px;">Primary Actions Detected:</h3>
      <ul style="list-style: none; padding: 0; color: #374151;">
        ${scanResult.e2e_results.primary_actions.map((action: string) => `
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
            • ${action}
          </li>
        `).join('')}
      </ul>
    ` : '<p style="color: #9ca3af;">No primary actions detected</p>'}
  </div>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">📊 Accessibility & Performance Report</h2>
    <p style="line-height: 1.8; color: #374151;">
      ${scanResult.target_url || 'Your website'} has a ${scanResult.overall_score || 0}/100 score 
      ${scanResult.security_results?.issues && scanResult.security_results.issues.length === 0 ? 'with no security issues' : 'with security considerations'}, 
      but needs accessibility improvements and performance monitoring.
    </p>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 15px; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #92400e;">Note</h3>
      <p style="margin: 8px 0; color: #78350f;">
        Book a consultation with QA experts to implement the recommended accessibility and performance improvements.<a href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI" style="color: #3b82f6; text-decoration: underline;">here</a>
      </p>
    </div>
  </div>

  <div style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 12px; padding: 30px; text-align: center;">
    <h2 style="color: #111827; margin-top: 0;">Need Help?</h2>
    <p style="color: #4b5563; margin-bottom: 20px;">Book a consultation with our QA experts to implement these recommendations.</p>
    <a href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Schedule Consultation</a>
  </div>

  <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 14px;">
    <p>Report generated by Robo-Lab Web Scanner</p>
    <p>Non-intrusive scans • Respects robots.txt • Results stored 30 days</p>
  </div>

</body>
</html>
  `;
}

function generateTextReport(scanResult: DBScanRow): string {
  const sr = scanResult;
  const securityScore = getSecurityScore(scanResult);
  const securityProtocol = getSecurityProtocol(scanResult);
  const securityHeaderChecks = getSecurityHeaderChecks(scanResult);
  const securityRecommendations = (sr.security_results?.recommendations && sr.security_results.recommendations.length > 0)
    ? sr.security_results.recommendations
    : securityHeaderChecks.filter((check) => !check.present).map((check) => check.recommendation);
  const seoResults = getSEOResults(scanResult);
  const explanations = getAnalysisExplanations(scanResult);
  const totalInteractiveElements = (sr.e2e_results?.buttons_found || 0) + (sr.e2e_results?.links_found || 0) + (sr.e2e_results?.forms_found || 0);
  return `
=================================================
ROBO-LAB WEB SCANNER - COMPREHENSIVE REPORT
=================================================

Target URL: ${sr.target_url}
Scan Date: ${new Date(sr.created_at).toLocaleString()}
Scan Duration: ${sr.scan_duration_ms ? `${Math.max(1, Math.round(sr.scan_duration_ms / 1000))}s` : 'N/A'}
Pages Scanned: ${sr.pages_scanned || 1}
Scan Depth: ${sr.scan_depth || 1}
Environment: ${getDetectedEnvironment(sr)}
Structure Score: ${sr.yslow_score ?? 'N/A'}/100
Overall Score: ${sr.overall_score}/100
Overall Explanation: ${explanations.overall}

-------------------------------------------------
EXECUTIVE SUMMARY
-------------------------------------------------

${sr.top_issues && sr.top_issues.length > 0 ? 'Critical Issues Identified:' : 'No Critical Issues Detected'}
${sr.top_issues ? sr.top_issues.map((issue: TopIssue) => `
${sr.top_issues!.indexOf(issue) + 1}. [${(issue.severity || '').toUpperCase()}] ${issue.category}
  ${issue.description}
`).join('') : ''}

-------------------------------------------------
SECURITY ANALYSIS
-------------------------------------------------

Status: Expanded security scan completed (${sr.security_results?.status || 'N/A'})
Explanation: ${explanations.security}
Security issues detected: ${sr.security_results?.issues?.length || 0}
Score: ${securityScore ?? 'N/A'}/100
Protocol: ${securityProtocol}
Checks passed: ${sr.security_results?.checks_passed ?? 0}/${sr.security_results?.checks_performed ?? securityHeaderChecks.length}
Scanner engine: ${sr.security_results?.scanner_engine || 'N/A'}

Header Hardening Checks (Full Report):
${securityHeaderChecks.length > 0 ? securityHeaderChecks.map((check, idx) => `  ${idx + 1}. ${check.header} [${check.present ? 'PASS' : 'MISSING'}]
  Purpose: ${check.purpose}
  Value: ${check.value || 'Missing'}`).join('\n') : '  N/A'}

Issues Found:
${sr.security_results?.issues ? sr.security_results.issues.map((issue: SecurityIssue, idx: number) => `  ${idx + 1}. [${issue.severity}] ${getSecurityIssueText(issue)}`).join('\n') : '  None'}

Recommendations:
${securityRecommendations.length > 0 ? securityRecommendations.map((item) => `  - ${item}`).join('\n') : '  - No additional security recommendations at this time.'}

-------------------------------------------------
PERFORMANCE ANALYSIS
-------------------------------------------------

Status: ${sr.performance_results?.status || 'N/A'}
Explanation: ${explanations.performance}
Structure Score explanation: ${explanations.yslow}
Score: ${sr.performance_results?.score || 'N/A'}/100
Load Time: ${sr.performance_results?.load_time_ms || 'N/A'}ms
Page Size: ${sr.performance_results?.page_size_kb || 'N/A'}KB
Images: ${sr.performance_results?.images_count ?? sr.performance_results?.image_count ?? 0}
Scripts: ${sr.performance_results?.scripts_count || 0}
Stylesheets: ${sr.performance_results?.stylesheets_count || 0}

Recommendations:
  - Optimize images (WebP format, lazy loading)
  - Minimize and bundle JavaScript
  - Enable compression (gzip/brotli)
  - Implement caching strategies
  - Use CDN for static assets

-------------------------------------------------
ACCESSIBILITY ANALYSIS
-------------------------------------------------

Status: ${sr.accessibility_results?.status || 'N/A'}
Accessibility Explanation: ${explanations.accessibility}
SEO Explanation: ${explanations.seo}
Score: ${sr.accessibility_results?.score || 'N/A'}/100
Total Issues: ${sr.accessibility_results?.total_issues || 0}
SEO explanation score: ${sr.seo_score ?? sr.performance_results?.lighthouse_scores?.seo ?? 0}/100
Missing meta tags: ${seoResults.missing_meta_tags.length > 0 ? seoResults.missing_meta_tags.join(', ') : 'None detected'}
Sitemap detected: ${seoResults.sitemap_detected === undefined ? 'Unknown' : seoResults.sitemap_detected ? 'Yes' : 'No'}
Missing structured data: ${seoResults.structured_data_missing === undefined ? 'Unknown' : seoResults.structured_data_missing ? 'Yes' : 'No'}

Issues Found:
${sr.accessibility_results?.issues ? sr.accessibility_results.issues.map((issue: AccessibilityIssue, idx: number) => `  ${idx + 1}. [${issue.severity}] ${getAccessibilityIssueText(issue)}`).join('\n') : '  None'}

Recommendations:
  - Add alt text to all images
  - Ensure proper heading hierarchy
  - Add ARIA labels where needed
  - Test with screen readers
  - Maintain color contrast ratios (WCAG AA)

-------------------------------------------------
API ANALYSIS
-------------------------------------------------

Status: ${sr.api_results?.status || 'N/A'}
Explanation: ${explanations.api}
${sr.api_results?.error ? `Error: ${sr.api_results.error}` : ''}
Endpoints Detected: ${sr.api_results?.endpoints_detected || 0}
${(sr.api_results?.endpoints_detected || 0) === 0 ? 'Why 0: No endpoints were detected in passive page-source analysis (likely dynamic or bundled APIs).' : ''}

${sr.api_results?.endpoints ? sr.api_results.endpoints.map((ep: APIEndpoint, idx: number) => `  ${idx + 1}. ${ep.method} ${ep.path}`).join('\n') : '  None detected'}

Recommendations:
  - Implement proper CORS policies
  - Use API versioning
  - Add rate limiting
  - Implement proper authentication

-------------------------------------------------
E2E TESTING INSIGHTS
-------------------------------------------------

Status: ${sr.e2e_results?.status || 'N/A'}
Explanation: ${explanations.e2e}
${sr.e2e_results?.error ? `Error: ${sr.e2e_results.error}` : ''}
Buttons Found: ${sr.e2e_results?.buttons_found || 0}
Links Found: ${sr.e2e_results?.links_found || 0}
Forms Found: ${sr.e2e_results?.forms_found || 0}
${totalInteractiveElements === 0 ? 'Why 0: No interactive elements were detected on the scanned page (possibly static or runtime-rendered).' : ''}

Primary Actions:
${sr.e2e_results?.primary_actions ? sr.e2e_results.primary_actions.map((action: string, idx: number) => `  ${idx + 1}. ${action}`).join('\n') : '  None'}

-------------------------------------------------
STRUCTURE SCORE RESULT
-------------------------------------------------

Structure Score: ${sr.yslow_score ?? 'N/A'}/100
Best-Practice Optimization Score: ${sr.yslow_score ?? 'N/A'}/100
Grade: ${((sr.yslow_results || {}) as Record<string, unknown>).grade || 'N/A'}
Checked At: ${((sr.yslow_results || {}) as Record<string, unknown>).checked_at || 'N/A'}
Total Requests: ${(((sr.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.total_requests ?? 'N/A'}
Average Load Time (ms): ${(((sr.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.avg_load_time_ms ?? 'N/A'}
Main Document/Code Needs Improvement: ${(((sr.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.compressed_main_doc === undefined ? 'N/A' : (((sr.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown>).compressed_main_doc ? 'Yes' : 'No'}
Minified Asset Ratio: ${(((sr.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.minified_asset_ratio ?? 'N/A'}
Average Cache TTL (seconds): ${(((sr.yslow_results || {}) as Record<string, unknown>).metrics as Record<string, unknown> | undefined)?.avg_asset_cache_ttl_seconds ?? 'N/A'}
Rule Scores: caching ${(((sr.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.caching ?? 'N/A'}, cookies ${(((sr.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.cookies ?? 'N/A'}, requests ${(((sr.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.requests ?? 'N/A'}, redirects ${(((sr.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.redirects ?? 'N/A'}, compression ${(((sr.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.compression ?? 'N/A'}, minification ${(((sr.yslow_results || {}) as Record<string, unknown>).rule_scores as Record<string, unknown> | undefined)?.minification ?? 'N/A'}
Recommendations: ${Array.isArray(((sr.yslow_results || {}) as Record<string, unknown>).recommendations) && (((sr.yslow_results || {}) as Record<string, unknown>).recommendations as unknown[]).length > 0 ? (((sr.yslow_results || {}) as Record<string, unknown>).recommendations as unknown[]).map((item) => String(item)).join(' | ') : 'N/A'}
Structure Score Explanation: ${explanations.yslow}

-------------------------------------------------
CRAWLED PAGES
-------------------------------------------------

Total Crawled Pages: ${sr.pages_scanned || (Array.isArray(sr.crawl_results) ? sr.crawl_results.length : 0)}
${Array.isArray(sr.crawl_results) && sr.crawl_results.length > 0
  ? (sr.crawl_results as Array<Record<string, unknown>>).slice(0, 30).map((page, idx) => `  ${idx + 1}. ${String(page.url || '')} (depth ${String(page.depth ?? 0)}, status ${String(page.status ?? 'N/A')}, load ${String(page.load_time_ms ?? 'N/A')}ms)`).join('\n')
  : '  None'}

-------------------------------------------------
TECHNOLOGY STACK
-------------------------------------------------

${sr.tech_stack?.detected ? sr.tech_stack.detected.map((tech, idx) => `  ${idx + 1}. ${tech.name} (${tech.confidence} confidence)`).join('\n') : '  Unable to detect'}

-------------------------------------------------
NEXT STEPS
-------------------------------------------------

1. Address critical security issues immediately
2. Optimize performance bottlenecks
3. Fix accessibility violations for WCAG compliance
4. Implement comprehensive E2E testing
5. Set up continuous monitoring

Need help implementing these recommendations?
Book a 15-minute consultation with our QA experts.

=================================================
Report generated by Robo-Lab Web Scanner
=================================================
`;
}

