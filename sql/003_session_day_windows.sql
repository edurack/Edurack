-- Per-day availability windows for mentor session offerings.
--
-- Each element is {"days":[1,2,3,4,5],"start":"18:00","end":"19:00"}:
-- the weekdays (0 = Sun … 6 = Sat) it applies to and the IST time range inside
-- which students can book. Empty = older offering that uses fixed start_times.
--
-- Safe to run more than once. Existing offerings keep working unchanged.
alter table mentor_session_offerings
  add column if not exists day_windows jsonb not null default '[]'::jsonb;

alter table mentor_session_offerings
  drop constraint if exists mentor_session_offerings_day_windows_is_array;
alter table mentor_session_offerings
  add constraint mentor_session_offerings_day_windows_is_array
  check (jsonb_typeof(day_windows) = 'array');
