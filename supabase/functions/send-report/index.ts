import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { ScanResult as DBScanRow, TopIssue, SecurityIssue, AccessibilityIssue, APIEndpoint } from '../../../src/types/scan';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

function getAccessibilityIssueText(issue: AccessibilityIssue): string {
  return issue.message || 'No details provided';
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
  const performanceStatus = scanResult.performance_results?.status;
  const accessibilityStatus = scanResult.accessibility_results?.status;
  const apiStatus = scanResult.api_results?.status;
  const e2eStatus = scanResult.e2e_results?.status;

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
              <a href="https://www.webscanner.robo-lab.io" style="display:inline-block;margin-top:14px;font-family:Arial, Helvetica, sans-serif;font-size:18px;color:#111827;text-decoration:none;font-weight:600;">🌐 www.webscanner.robo-lab.io</a>
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
        <td style="padding: 10px 0; font-weight: 600; color: #6b7280;">Overall Score:</td>
        <td style="padding: 10px 0;">
          <span style="font-size: 36px; font-weight: bold; color: ${scoreColor(scanResult.overall_score || 0)};">${scanResult.overall_score || 0}</span>
          <span style="font-size: 20px; color: #9ca3af;">/100</span>
        </td>
      </tr>
    </table>
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
    <p><strong>Status:</strong> ${securityStatus || 'N/A'}</p>
    <p><strong>Score:</strong> <span style="color: ${scoreColor(securityScore || 0)};">${securityScore ?? 'N/A'}/100</span></p>
    <p><strong>Protocol:</strong> ${securityProtocol}</p>
    
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
  </div>

  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">⚡ Detailed Performance Analysis</h2>
    <p><strong>Status:</strong> ${performanceStatus || 'N/A'}</p>
    <p><strong>Score:</strong> <span style="color: ${scoreColor(scanResult.performance_results?.score || 0)};">${scanResult.performance_results?.score || 'N/A'}/100</span></p>
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
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">👁️ Accessibility Issues</h2>
    <p><strong>Status:</strong> ${accessibilityStatus || 'N/A'}</p>
    <p><strong>Score:</strong> <span style="color: ${scoreColor(scanResult.accessibility_results?.score || 0)};">${scanResult.accessibility_results?.score || 'N/A'}/100</span></p>
    <p><strong>Total Issues:</strong> ${scanResult.accessibility_results?.total_issues || 0}</p>
    
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
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🔌 API Analysis</h2>
    <p><strong>Status:</strong> ${apiStatus || 'N/A'}</p>
    ${scanResult.api_results?.error ? `<p><strong>Error:</strong> ${scanResult.api_results.error}</p>` : ''}
    <p><strong>Endpoints Detected:</strong> ${scanResult.api_results?.endpoints_detected || 0}</p>

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
    <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🤖 End-to-End Testing Insights</h2>
    <p><strong>Status:</strong> ${e2eStatus || 'N/A'}</p>
    ${scanResult.e2e_results?.error ? `<p><strong>Error:</strong> ${scanResult.e2e_results.error}</p>` : ''}
    <p><strong>Buttons Found:</strong> ${scanResult.e2e_results?.buttons_found || 0}</p>
    <p><strong>Links Found:</strong> ${scanResult.e2e_results?.links_found || 0}</p>
    <p><strong>Forms Found:</strong> ${scanResult.e2e_results?.forms_found || 0}</p>
    
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
  return `
=================================================
ROBO-LAB WEB SCANNER - COMPREHENSIVE REPORT
=================================================

Target URL: ${sr.target_url}
Scan Date: ${new Date(sr.created_at).toLocaleString()}
Overall Score: ${sr.overall_score}/100

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

Status: ${sr.security_results?.status || 'N/A'}
Score: ${securityScore ?? 'N/A'}/100
Protocol: ${securityProtocol}

Security Headers:
${sr.security_results?.security_headers ? Object.entries(sr.security_results.security_headers).map(([key, value]) => `  - ${key}: ${value || 'Missing'}`).join('\n') : '  N/A'}

Issues Found:
${sr.security_results?.issues ? sr.security_results.issues.map((issue: SecurityIssue, idx: number) => `  ${idx + 1}. [${issue.severity}] ${getSecurityIssueText(issue)}`).join('\n') : '  None'}

Recommendations:
  - Implement HSTS with long max-age
  - Add Content-Security-Policy header
  - Enable Secure and HttpOnly flags on all cookies
  - Implement X-Frame-Options and X-Content-Type-Options

-------------------------------------------------
PERFORMANCE ANALYSIS
-------------------------------------------------

Status: ${sr.performance_results?.status || 'N/A'}
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
Score: ${sr.accessibility_results?.score || 'N/A'}/100
Total Issues: ${sr.accessibility_results?.total_issues || 0}

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
${sr.api_results?.error ? `Error: ${sr.api_results.error}` : ''}
Endpoints Detected: ${sr.api_results?.endpoints_detected || 0}

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
${sr.e2e_results?.error ? `Error: ${sr.e2e_results.error}` : ''}
Buttons Found: ${sr.e2e_results?.buttons_found || 0}
Links Found: ${sr.e2e_results?.links_found || 0}
Forms Found: ${sr.e2e_results?.forms_found || 0}

Primary Actions:
${sr.e2e_results?.primary_actions ? sr.e2e_results.primary_actions.map((action: string, idx: number) => `  ${idx + 1}. ${action}`).join('\n') : '  None'}

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

