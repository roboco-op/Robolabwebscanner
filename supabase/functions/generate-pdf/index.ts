import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib";
import type { ScanResult as DBScanRow, TopIssue, SecurityIssue, AccessibilityIssue, APIEndpoint } from '../../../src/types/scan';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PDFGenerationRequest {
  scanId: string;
}

Deno.serve(async (req: Request) => {
  console.log(`[generate-pdf] Received request: ${req.method} ${req.url}`);
  console.log(`[generate-pdf] Headers:`, {
    contentType: req.headers.get('Content-Type'),
    auth: req.headers.get('Authorization') ? 'Present' : 'Missing'
  });

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log(`[generate-pdf] Parsing request body...`);
    const { scanId }: PDFGenerationRequest = await req.json();
    console.log(`[generate-pdf] Generating PDF for scan ${scanId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch scan result
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

    let pdfBase64: string | null = null;
    try {
      console.log("Generating professional PDF...");
      const pdfDoc = await PDFDocument.create();
      
      // Helper: Add page with header
      const addPage = (title: string = "ROBO-LAB Web Scanner Report") => {
        const page = pdfDoc.addPage([595, 842]); // A4
        const { height } = page.getSize();
        
        // Dark blue header bar
        page.drawRectangle({
          x: 0,
          y: height - 70,
          width: 595,
          height: 70,
          color: rgb(0.05, 0.15, 0.35),
        });
        
        // Logo text: "Robo" in white, "Lab" in blue-ish
        page.drawText("Robo", {
          x: 50,
          y: height - 38,
          size: 22,
          color: rgb(1, 1, 1),
        });
        
        page.drawText("Lab", {
          x: 140,
          y: height - 38,
          size: 22,
          color: rgb(0.6, 0.8, 1),
        });
        
        page.drawText("®", {
          x: 200,
          y: height - 35,
          size: 12,
          color: rgb(0.6, 0.8, 1),
        });
        
        // Page title on right side
        page.drawText(title, {
          x: 280,
          y: height - 40,
          size: 13,
          color: rgb(1, 1, 1),
        });
        
        // Footer line
        page.drawRectangle({
          x: 0,
          y: 30,
          width: 595,
          height: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
        
        page.drawText("Robo-Lab Web Scanner - Automated Security & Performance Analysis", {
          x: 50,
          y: 10,
          size: 8,
          color: rgb(0.6, 0.6, 0.6),
        });
        
        return page;
      };
      
      const scoreColor = (score: number) => {
        if (score >= 80) return rgb(0.1, 0.6, 0.2);
        if (score >= 60) return rgb(1, 0.7, 0);
        return rgb(0.8, 0.1, 0.1);
      };
      
      const score = scanResult.overall_score || 0;
      
      // Page 1: Executive Summary
      const page1 = addPage("Executive Summary");
      let y = page1.getSize().height - 90;
      
      // Website info box
      page1.drawRectangle({
        x: 50,
        y: y - 40,
        width: 495,
        height: 40,
        color: rgb(0.95, 0.98, 1),
        borderColor: rgb(0.3, 0.3, 0.5),
        borderWidth: 1,
      });
      
      page1.drawText("Website Analyzed:", {
        x: 70,
        y: y - 15,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      page1.drawText(scanResult.target_url, {
        x: 70,
        y: y - 30,
        size: 11,
        color: rgb(0, 0, 0.7),
      });
      
      y -= 60;
      
      page1.drawText(`Scan Date: ${new Date(scanResult.created_at).toLocaleString()}`, {
        x: 50,
        y: y,
        size: 10,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      y -= 40;
      
      // Overall Score - Large Box
      page1.drawRectangle({
        x: 50,
        y: y - 100,
        width: 495,
        height: 100,
        color: rgb(0.98, 0.98, 1),
        borderColor: scoreColor(score),
        borderWidth: 3,
      });
      
      page1.drawText("OVERALL SCORE", {
        x: 70,
        y: y - 35,
        size: 14,
        color: rgb(0.05, 0.15, 0.35),
      });
      
      page1.drawText(`${score}/100`, {
        x: 350,
        y: y - 70,
        size: 48,
        color: scoreColor(score),
      });
      
      const statusText = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor";
      page1.drawText(statusText, {
        x: 70,
        y: y - 70,
        size: 14,
        color: scoreColor(score),
      });
      
      y -= 130;
      
      // Key Metrics Section
      page1.drawText("Performance Scorecard", {
        x: 50,
        y: y,
        size: 13,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 25;
      
      const metricsData = [
        { label: "Performance", value: `${scanResult.performance_score || 0}/100` },
        { label: "SEO", value: `${scanResult.seo_score || 0}/100` },
        { label: "Security", value: `${scanResult.security_checks_passed || 0}/${scanResult.security_checks_total || 7}` },
        { label: "Accessibility", value: `${scanResult.accessibility_issue_count || 0} issues` },
      ];
      
      for (const metric of metricsData) {
        page1.drawRectangle({
          x: 50,
          y: y - 25,
          width: 235,
          height: 25,
          color: rgb(0.98, 0.98, 1),
          borderColor: rgb(0.7, 0.7, 0.9),
          borderWidth: 1,
        });
        
        page1.drawText(`${metric.label}:`, {
          x: 70,
          y: y - 18,
          size: 10,
          color: rgb(0.3, 0.3, 0.3),
        });
        
        page1.drawText(metric.value, {
          x: 180,
          y: y - 18,
          size: 10,
          color: rgb(0.05, 0.15, 0.35),
        });
        
        y -= 30;
      }
      
      y -= 15;
      
      // Top Issues
      if (scanResult.top_issues && scanResult.top_issues.length > 0) {
        page1.drawText("Critical Issues Found", {
          x: 50,
          y: y,
          size: 12,
          color: rgb(0.8, 0.1, 0.1),
        });
        y -= 20;
        
        for (const issue of scanResult.top_issues.slice(0, 5)) {
          const severity = issue.severity || 'medium';
          const severityColor = severity === 'critical' ? rgb(0.9, 0, 0) :
                              severity === 'high' ? rgb(1, 0.4, 0) :
                              severity === 'medium' ? rgb(1, 0.7, 0) :
                              rgb(0.5, 0.5, 0.5);
          
          page1.drawRectangle({
            x: 50,
            y: y - 32,
            width: 495,
            height: 32,
            color: rgb(1, 0.98, 0.98),
            borderColor: severityColor,
            borderWidth: 1,
          });
          
          page1.drawText(`[${severity.toUpperCase()}]`, {
            x: 70,
            y: y - 12,
            size: 9,
            color: severityColor,
          });
          
          page1.drawText(issue.category, {
            x: 140,
            y: y - 12,
            size: 9,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          page1.drawText(issue.description.substring(0, 50), {
            x: 70,
            y: y - 22,
            size: 8,
            color: rgb(0.4, 0.4, 0.4),
          });
          
          y -= 37;
        }
      }
      
      // Page 2: Detailed Analysis
      const page2 = addPage("Technical Details");
      y = page2.getSize().height - 90;
      
      // Performance Section
      page2.drawText("Performance Metrics", {
        x: 50,
        y: y,
        size: 12,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 20;
      
      if (scanResult.performance_results?.core_web_vitals) {
        const cwv = scanResult.performance_results.core_web_vitals;
        const perfMetrics = [
          { label: "First Contentful Paint (FCP)", value: `${((cwv.fcp || 0) / 1000).toFixed(2)}s` },
          { label: "Largest Contentful Paint (LCP)", value: `${((cwv.lcp || 0) / 1000).toFixed(2)}s` },
          { label: "Cumulative Layout Shift (CLS)", value: `${(cwv.cls || 0).toFixed(3)}` },
          { label: "Total Blocking Time (TBT)", value: `${Math.round(cwv.tbt || 0)}ms` },
        ];
        
        for (const metric of perfMetrics) {
          page2.drawText(`• ${metric.label}: ${metric.value}`, {
            x: 70,
            y: y,
            size: 9,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= 18;
        }
      }
      
      y -= 15;
      
      // Security Section
      page2.drawText("Security Headers", {
        x: 50,
        y: y,
        size: 12,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 20;
      
      if (scanResult.security_results?.security_headers) {
        const headers = scanResult.security_results.security_headers;
        let headerCount = 0;
        for (const [name, value] of Object.entries(headers)) {
          if (headerCount >= 7) break;
          page2.drawText(`${name}`, {
            x: 70,
            y: y,
            size: 9,
            color: rgb(0.2, 0.2, 0.2),
          });
          
          page2.drawRectangle({
            x: 290,
            y: y - 8,
            width: 8,
            height: 8,
            color: value ? rgb(0.1, 0.5, 0.1) : rgb(0.8, 0.1, 0.1),
          });
          
          page2.drawText(value ? "✓" : "✗", {
            x: 292,
            y: y - 7,
            size: 7,
            color: rgb(1, 1, 1),
          });
          
          y -= 18;
          headerCount++;
        }
      }
      
      y -= 15;
      
      // E2E Testing
      page2.drawText("Interactive Elements Detected", {
        x: 50,
        y: y,
        size: 12,
        color: rgb(0.05, 0.15, 0.35),
      });
      y -= 20;
      
      if (scanResult.e2e_results) {
        const e2e = scanResult.e2e_results;
        page2.drawText(`Buttons: ${e2e.buttons_found || 0} | Links: ${e2e.links_found || 0} | Forms: ${e2e.forms_found || 0}`, {
          x: 70,
          y: y,
          size: 10,
          color: rgb(0.2, 0.2, 0.2),
        });
        
        if (e2e.primary_actions && e2e.primary_actions.length > 0) {
          y -= 20;
          page2.drawText("Primary Actions:", {
            x: 50,
            y: y,
            size: 10,
            color: rgb(0.05, 0.15, 0.35),
          });
          y -= 15;
          
          for (const action of e2e.primary_actions.slice(0, 5)) {
            page2.drawText(`◦ ${action}`, {
              x: 70,
              y: y,
              size: 9,
              color: rgb(0.3, 0.3, 0.3),
            });
            y -= 15;
          }
        }
      }
      
      y -= 15;
      
      // AI Analysis
      if (scanResult.ai_summary) {
        page2.drawText("AI-Powered Analysis & Recommendations", {
          x: 50,
          y: y,
          size: 12,
          color: rgb(0.05, 0.15, 0.35),
        });
        y -= 20;
        
        let aiText = String(scanResult.ai_summary);
        if (aiText.startsWith('```')) {
          aiText = aiText.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
        }
        try {
          const parsed = JSON.parse(aiText);
          aiText = parsed.summary || aiText;
        } catch {}
        
        // Draw AI summary in box
        page2.drawRectangle({
          x: 50,
          y: y - 50,
          width: 495,
          height: 50,
          color: rgb(0.95, 0.98, 1),
          borderColor: rgb(0.4, 0.5, 0.7),
          borderWidth: 1,
        });
        
        const summary = aiText.substring(0, 280);
        page2.drawText(summary, {
          x: 70,
          y: y - 15,
          size: 8,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      
      if (scanResult.ai_recommendations && Array.isArray(scanResult.ai_recommendations) && scanResult.ai_recommendations.length > 0) {
        y -= 70;
        page2.drawText("Recommendations:", {
          x: 50,
          y: y,
          size: 11,
          color: rgb(0.1, 0.5, 0.1),
        });
        y -= 18;
        
        for (const rec of scanResult.ai_recommendations.slice(0, 6)) {
          page2.drawText(`✓ ${rec}`, {
            x: 70,
            y: y,
            size: 8,
            color: rgb(0.1, 0.5, 0.1),
          });
          y -= 16;
          
          if (y < 50) break;
        }
      }
      
      // Save PDF
      const pdfBytes = await pdfDoc.save();
      pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
      console.log(`Professional PDF generated successfully. Size: ${pdfBytes.length} bytes`);
    } catch (pdfErr) {
      console.error("PDF generation error:", {
        message: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
        stack: pdfErr instanceof Error ? pdfErr.stack : undefined,
        type: typeof pdfErr
      });
    }

    // Save PDF to scan_results
    if (pdfBase64) {
      console.log(`[generate-pdf] Attempting to save PDF (size: ${Math.round(pdfBase64.length / 1024)} KB) to scan_results...`);
      
      try {
        console.log(`[generate-pdf] Updating scan_results table with pdf_report for scan ${scanId}`);
        const { error: updateError } = await supabase
          .from("scan_results")
          .update({ pdf_report: pdfBase64 })
          .eq("id", scanId);

        if (updateError) {
          // Check if it's a column not found error
          if (updateError.message?.includes('pdf_report') || updateError.message?.includes('column')) {
            console.error("[generate-pdf] pdf_report column not found - migration may not have been applied:", updateError.message);
            console.log("[generate-pdf] NOTE: Database migration for pdf_report column needs to be manually applied.");
            console.log("[generate-pdf] Run: ALTER TABLE scan_results ADD COLUMN pdf_report TEXT;");
          } else {
            console.error("[generate-pdf] Failed to save PDF to database:", updateError);
          }
        } else {
          console.log("[generate-pdf] PDF saved to scan_results successfully");
        }
      } catch (saveError) {
        console.error("[generate-pdf] Error saving PDF:", saveError instanceof Error ? saveError.message : String(saveError));
      }
    } else {
      console.warn("[generate-pdf] No PDF data to save");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "PDF generated successfully",
        pdfSize: pdfBase64 ? Math.round(pdfBase64.length / 1024) : 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[generate-pdf] FATAL ERROR:", error);
    console.error("[generate-pdf] Error type:", typeof error);
    console.error("[generate-pdf] Error message:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error("[generate-pdf] Stack:", error.stack);
    }
    return new Response(
      JSON.stringify({ 
        error: "Failed to generate PDF",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
