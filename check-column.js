const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkColumn() {
  const { data, error } = await supabase
    .from('scan_results')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (data && data.length > 0) {
    const columns = Object.keys(data[0]);
    console.log('Columns in scan_results:', columns);
    console.log('Has og_image column:', columns.includes('og_image'));
    console.log('Has preview_image_source column:', columns.includes('preview_image_source'));
    console.log('Has legacy pdf_report column (should be false):', columns.includes('pdf_report'));
  } else {
    console.log('No rows in scan_results table');
  }
}

checkColumn();
