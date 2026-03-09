import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const MAX_JOBS_PER_RUN = Number(Deno.env.get("SCAN_WORKER_BATCH_SIZE") ?? "3");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!SUPABASE_URL) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const workerUrl = `${SUPABASE_URL}/functions/v1/web-scanner`;
    const batchLimit = Number.isFinite(MAX_JOBS_PER_RUN) && MAX_JOBS_PER_RUN > 0
      ? Math.min(MAX_JOBS_PER_RUN, 10)
      : 3;

    const processed: Array<Record<string, unknown>> = [];

    for (let index = 0; index < batchLimit; index += 1) {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "process-next" }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`web-scanner worker call failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      processed.push(result);

      if (!result?.processed) {
        break;
      }
    }

    const yslowResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "process-yslow" }),
    });

    let yslowResult: Record<string, unknown> | null = null;
    if (yslowResponse.ok) {
      yslowResult = await yslowResponse.json();
    }

    return new Response(
      JSON.stringify({
        success: true,
        runs: processed.length,
        processed,
        yslow: yslowResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "scan-worker execution failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
