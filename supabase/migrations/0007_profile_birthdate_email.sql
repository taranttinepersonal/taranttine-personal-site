-- Basic-info tab for the admin: birthday reminders + showing the login
-- email in the client editor (email itself lives in auth.users, which
-- browser JS can't read directly without service_role — this denormalized
-- copy is for display only; changing it here does NOT change the login
-- email, that still goes through the admin API).
alter table profiles add column birth_date date;
alter table profiles add column email text;
