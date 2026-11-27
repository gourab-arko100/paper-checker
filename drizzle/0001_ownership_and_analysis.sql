-- The connection role is the migration owner. Request transactions drop to this
-- non-login role before binding a verified Clerk subject.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'paperchecker_user') then
    create role paperchecker_user nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  execute format('grant paperchecker_user to %I', current_user);
end
$$;
--> statement-breakpoint
grant usage on schema public to paperchecker_user;
--> statement-breakpoint
revoke all on public.users, public.user_preferences, public.scans, public.retained_document_text, public.api_usage from public;
--> statement-breakpoint
grant select, insert, delete on public.users to paperchecker_user;
--> statement-breakpoint
grant select, insert, update on public.user_preferences to paperchecker_user;
--> statement-breakpoint
grant select, insert, update, delete on public.scans, public.retained_document_text to paperchecker_user;
--> statement-breakpoint
grant select on public.api_usage to paperchecker_user;
--> statement-breakpoint
grant update (attempted_requests, charged_characters, input_tokens, output_tokens, request_status, estimated_cost)
  on public.api_usage to paperchecker_user;
--> statement-breakpoint
create function public.current_clerk_id() returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('paperchecker.clerk_user_id', true), '')
$$;
--> statement-breakpoint
alter table public.users enable row level security;
--> statement-breakpoint
create policy users_select_own on public.users for select to paperchecker_user using (clerk_user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy users_insert_own on public.users for insert to paperchecker_user with check (clerk_user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy users_delete_own on public.users for delete to paperchecker_user using (clerk_user_id = (select public.current_clerk_id()));
--> statement-breakpoint
alter table public.user_preferences enable row level security;
--> statement-breakpoint
create policy user_preferences_select_own on public.user_preferences for select to paperchecker_user using (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy user_preferences_insert_own on public.user_preferences for insert to paperchecker_user with check (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy user_preferences_update_own on public.user_preferences for update to paperchecker_user using (user_id = (select public.current_clerk_id())) with check (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
alter table public.scans enable row level security;
--> statement-breakpoint
create policy scans_select_own on public.scans for select to paperchecker_user using (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy scans_insert_own on public.scans for insert to paperchecker_user with check (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy scans_update_own on public.scans for update to paperchecker_user using (user_id = (select public.current_clerk_id())) with check (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy scans_delete_own on public.scans for delete to paperchecker_user using (user_id = (select public.current_clerk_id()) and (status <> 'processing' or active_until <= now()));
--> statement-breakpoint
alter table public.retained_document_text enable row level security;
--> statement-breakpoint
create policy retained_document_text_select_own on public.retained_document_text for select to paperchecker_user using (exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select public.current_clerk_id())));
--> statement-breakpoint
create policy retained_document_text_insert_own on public.retained_document_text for insert to paperchecker_user with check (exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select public.current_clerk_id())));
--> statement-breakpoint
create policy retained_document_text_update_own on public.retained_document_text for update to paperchecker_user using (exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select public.current_clerk_id()))) with check (exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select public.current_clerk_id())));
--> statement-breakpoint
create policy retained_document_text_delete_own on public.retained_document_text for delete to paperchecker_user using (exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select public.current_clerk_id())));
--> statement-breakpoint
alter table public.api_usage enable row level security;
--> statement-breakpoint
create policy api_usage_select_own on public.api_usage for select to paperchecker_user using (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create policy api_usage_update_own on public.api_usage for update to paperchecker_user using (user_id = (select public.current_clerk_id())) with check (user_id = (select public.current_clerk_id()));
--> statement-breakpoint
create function public.guard_scan_start() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'processing' or new.active_until <= clock_timestamp() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paperguard-user-' || new.user_id,0));
  if exists(select 1 from public.scans where user_id=new.user_id and status='processing' and active_until>now() and id<>new.id) then
    raise exception 'active_scan' using errcode='P0001';
  end if;
  if (select count(*) from public.api_usage where user_id=new.user_id and created_at>now()-interval '1 minute') >= 12 then
    raise exception 'request_rate' using errcode='P0001';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger guard_scan_insert before insert on public.scans for each row execute function public.guard_scan_start();
--> statement-breakpoint
create trigger guard_scan_retry before update of active_until on public.scans for each row when(new.status='processing') execute function public.guard_scan_start();
--> statement-breakpoint
-- Quota is shared across accounts. Elevate only this checked, atomic operation.
create function public.reserve_quota(
  p_user text,p_scan uuid,p_lease timestamptz,p_provider text,p_characters integer,p_requests integer,
  p_daily bigint,p_monthly bigint,p_daily_requests bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result uuid;
  day_start timestamptz := date_trunc('day',now(),'UTC');
  month_start timestamptz := date_trunc('month',now(),'UTC');
  day_chars bigint;
  month_chars bigint;
  day_requests bigint;
begin
  if p_user is null or p_user is distinct from public.current_clerk_id() then
    raise exception 'scan_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paperguard-provider-' || p_provider,0));
  perform 1 from public.scans where id=p_scan and user_id=p_user and status='processing'
    and active_until=p_lease and active_until>clock_timestamp() for update;
  if not found then raise exception 'scan_unavailable'; end if;
  select coalesce(sum(coalesce(charged_characters,characters_processed)) filter(where created_at>=day_start),0),
         coalesce(sum(coalesce(charged_characters,characters_processed)),0),
         coalesce(sum(coalesce(attempted_requests,request_count)) filter(where created_at>=day_start),0)
  into day_chars,month_chars,day_requests
  from public.api_usage where provider=p_provider and created_at>=month_start;
  if (p_daily is not null and day_chars+p_characters>p_daily)
     or (p_monthly is not null and month_chars+p_characters>p_monthly)
     or (p_daily_requests is not null and day_requests+p_requests>p_daily_requests) then
    return null;
  end if;
  insert into public.api_usage(user_id,scan_id,provider,characters_processed,request_count)
  values(p_user,p_scan,p_provider,p_characters,p_requests) returning id into result;
  return result;
end;
$$;
--> statement-breakpoint
create function public.set_retention(p_user text,p_enabled boolean) returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('paperguard-retention-' || p_user,0));
  insert into public.user_preferences(user_id,retain_document_text,retention_consent_at)
  values(p_user,p_enabled,case when p_enabled then now() end)
  on conflict(user_id) do update set retain_document_text=excluded.retain_document_text,
    retention_consent_at=case when p_enabled then coalesce(user_preferences.retention_consent_at,now()) end;
  if not p_enabled then
    delete from public.retained_document_text where scan_id in (select id from public.scans where user_id=p_user);
  end if;
end;
$$;
--> statement-breakpoint
create function public.finish_scan(p_user text,p_scan uuid,p_lease timestamptz,p_data jsonb,p_retained jsonb)
returns boolean language plpgsql set search_path='' as $$
declare consent timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('paperguard-retention-' || p_user,0));
  update public.scans set
    ai=p_data->'ai', writing=p_data->'writing', ai_score=(p_data->>'ai_score')::double precision,
    writing_score=(p_data->>'writing_score')::integer, ai_error=p_data->>'ai_error',
    writing_error=p_data->>'writing_error', status=p_data->>'status',
    processing_duration=processing_duration+(p_data->>'processing_duration')::integer
  where id=p_scan and user_id=p_user and active_until=p_lease and active_until>now() and status='processing';
  if not found then return false; end if;
  select retention_consent_at into consent from public.user_preferences where user_id=p_user;
  if p_retained is not null and consent is not null and consent <= p_lease-interval '2 minutes' then
    insert into public.retained_document_text(scan_id,extracted_text,ai,writing,retention_consent_at)
    values(p_scan,p_retained->>'text',p_retained->'ai',p_retained->'writing',consent)
    on conflict(scan_id) do update set ai=excluded.ai,writing=excluded.writing;
  end if;
  return true;
end;
$$;
--> statement-breakpoint
create function public.workspace_stats() returns jsonb language sql stable security invoker set search_path='' as $$
  with mine as (select * from public.scans where user_id = (select public.current_clerk_id()))
  select jsonb_build_object(
    'total',(select count(*) from mine where status in ('complete','partial')),
    'words',(select coalesce(sum(word_count),0) from mine where status in ('complete','partial')),
    'ai',(select avg(ai_score)*100 from mine),
    'writing',(select avg(writing_score) from mine),
    'formats',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from (select upper(document_type) as name,count(*) as count from mine group by document_type) f),
    'issues',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from (select issue->>'category' as name,count(*) as count from mine cross join lateral jsonb_array_elements(coalesce(nullif(writing->'issues','null'),'[]')) issue group by issue->>'category' order by count(*) desc limit 8) i),
    'trend',(select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]') from (select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as name, round(avg(ai_score*100)::numeric,1) as ai, round(avg(writing_score),1) as writing from mine where created_at > now()-interval '30 days' and (ai_score is not null or writing_score is not null) group by 1) t)
  )
$$;
--> statement-breakpoint
create function public.admin_stats() returns jsonb language sql stable set search_path='' as $$
  with usage as (select *,date_trunc('day',now(),'UTC') as day_start from public.api_usage where created_at>=date_trunc('month',now(),'UTC'))
  select jsonb_build_object(
    'users',(select count(*) from public.users),
    'scans',(select count(*) from public.scans),
    'completed',(select count(*) from public.scans where status='complete'),
    'partial',(select count(*) from public.scans where status='partial'),
    'failed',(select count(*) from public.scans where status='failed'),
    'usage',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from (
      select provider,sum(coalesce(charged_characters,characters_processed)) as characters,
        coalesce(sum(coalesce(charged_characters,characters_processed)) filter(where created_at>=day_start),0) as daily_characters,
        sum(coalesce(attempted_requests,request_count)) as requests,
        coalesce(sum(coalesce(attempted_requests,request_count)) filter(where created_at>=day_start),0) as daily_requests,
        coalesce(sum(input_tokens),0) as input_tokens,coalesce(sum(output_tokens),0) as output_tokens,
        count(*) filter(where request_status='success') as successful_runs,count(*) filter(where request_status='failed') as failed_runs,
        sum(estimated_cost) as estimated_cost
      from usage group by provider) p)
  )
$$;
--> statement-breakpoint
revoke all on function public.guard_scan_start() from public;
--> statement-breakpoint
revoke all on function public.reserve_quota(text,uuid,timestamptz,text,integer,integer,bigint,bigint,bigint) from public;
--> statement-breakpoint
grant execute on function public.reserve_quota(text,uuid,timestamptz,text,integer,integer,bigint,bigint,bigint) to paperchecker_user;
--> statement-breakpoint
revoke all on function public.set_retention(text,boolean) from public;
--> statement-breakpoint
grant execute on function public.set_retention(text,boolean) to paperchecker_user;
--> statement-breakpoint
revoke all on function public.finish_scan(text,uuid,timestamptz,jsonb,jsonb) from public;
--> statement-breakpoint
grant execute on function public.finish_scan(text,uuid,timestamptz,jsonb,jsonb) to paperchecker_user;
--> statement-breakpoint
revoke all on function public.workspace_stats() from public;
--> statement-breakpoint
grant execute on function public.workspace_stats() to paperchecker_user;
--> statement-breakpoint
revoke all on function public.admin_stats() from public;
