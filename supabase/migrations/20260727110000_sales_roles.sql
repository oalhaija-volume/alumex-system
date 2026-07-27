-- Phase 2: introduce the two sales roles required by the rebuilt workflow.
-- Keep legacy Sales Rep values for existing database compatibility.

alter type public.app_role add value if not exists 'Indoor Sales';
alter type public.app_role add value if not exists 'Outdoor Sales';
