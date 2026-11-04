-- EZD-110a Step 1 (vault/plans/EZD-110a.md section 1 Data M1, Decided D4): the job kind notification_email,
-- one job per notification (the email). Widening the check only; existing rows stay valid.
alter table public.job
  drop constraint job_kind_check,
  add constraint job_kind_check check (
    kind in ('import', 'export', 'render', 'ai_read', 'thumbnail', 'diff', 'cleanup', 'test', 'notification_email')
  );
