/*
  # Schedule always-on scan worker

  Runs the scan-worker edge function every minute so queued scan jobs are processed
  even when no user is active in the frontend.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $body$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'scan-worker-every-minute'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'scan-worker-every-minute',
    '* * * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://cxyswtdklznjqrfzzelj.supabase.co/functions/v1/scan-worker',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cmd$
  );
END $body$;
