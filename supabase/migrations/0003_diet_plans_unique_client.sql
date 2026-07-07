-- One diet plan row per client (the admin UI upserts by client_id).
alter table diet_plans add constraint diet_plans_client_id_key unique (client_id);
