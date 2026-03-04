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
    
    // Check current preview image fields and ensure legacy PDF field is removed
    if (data && data[0]) {
      const hasOgImage = "og_image" in data[0];
      const hasPreviewSource = "preview_image_source" in data[0];
      const hasPdfReport = "pdf_report" in data[0];

      console.log(`\nog_image column exists: ${hasOgImage}`);
      console.log(`preview_image_source column exists: ${hasPreviewSource}`);
      console.log(`legacy pdf_report column exists (should be false): ${hasPdfReport}`);
      
      if (!hasOgImage || !hasPreviewSource) {
        console.log("\n⚠️  Missing expected preview-image columns. Run latest migrations.");
      } else {
        console.log("✅ Current schema fields are present.");
      }
    }
  }
} catch (err) {
  console.error("Error:", err);
}
