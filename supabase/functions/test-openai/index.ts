import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    
    const result = {
      keyExists: !!openaiApiKey,
      keyLength: openaiApiKey ? openaiApiKey.length : 0,
      keyPrefix: openaiApiKey ? openaiApiKey.substring(0, 7) : "none",
      allEnvKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes("OPENAI") || k.includes("API")),
    };

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not found", debug: result }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Testing OpenAI API with key:", openaiApiKey.substring(0, 10) + "...");

    const testResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Say hello in JSON format: {greeting: string}"
          }
        ],
        max_tokens: 50,
      }),
    });

    const responseText = await testResponse.text();
    console.log("OpenAI response status:", testResponse.status);
    console.log("OpenAI response:", responseText.substring(0, 200));
    
    return new Response(
      JSON.stringify({
        success: testResponse.ok,
        status: testResponse.status,
        keyInfo: result,
        response: responseText.substring(0, 500),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Test error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});