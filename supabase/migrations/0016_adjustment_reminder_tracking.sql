-- Tracks whether the trainer has already been pushed a reminder for the
-- CURRENT pending-adjustment window, so check-program-adjustments.js doesn't
-- re-notify every day once a client crosses the 28-day mark.
alter table workout_programs add column adjustment_reminder_sent_at timestamptz;
