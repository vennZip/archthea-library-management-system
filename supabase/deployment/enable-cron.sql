-- Run this file once in the SQL editor of the EXISTING Archthea project.
-- It is safe to repeat: the same job names update the existing schedules.
-- Do not rerun setup.sql or recreate any application tables for deployment.
begin;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'archthea-library-jobs',
  '* * * * *',
  'select public.run_library_jobs();'
);

-- Retain 14 days of only Archthea's scheduler logs. Library audit/loan records
-- and other projects' Cron jobs and logs are not affected.
select cron.schedule(
  'archthea-cron-history-cleanup',
  '17 3 * * *',
  $$delete from cron.job_run_details
    where jobid in (select jobid from cron.job where jobname in ('archthea-library-jobs','archthea-cron-history-cleanup'))
    and end_time < now() - interval '14 days';$$
);
commit;
