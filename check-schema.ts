import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

try {
  // Try to query the scan_results table to see its structure
  const { data, error } = await supabase
    .from("scan_results")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Query error:", error);
  } else {
    console.log("Database connection successful!");
    console.log("First scan_result columns:", Object.keys(data?.[0] || {}));
    
    // Check if pdf_report exists
    if (data && data[0]) {
      const hasPdfReport = "pdf_report" in data[0];
      console.log(`\npdf_report column exists: ${hasPdfReport}`);
      
      if (!hasPdfReport) {
        console.log("\n⚠️  pdf_report column NOT FOUND - you need to run the migration!");
        console.log("\nRun this SQL in Supabase Dashboard > SQL Editor:");
        console.log("ALTER TABLE scan_results ADD COLUMN IF NOT EXISTS pdf_report TEXT;");
      } else {
        console.log("✅ pdf_report column found - you're all set!");
      }
    }
  }
} catch (err) {
  console.error("Error:", err);
}
