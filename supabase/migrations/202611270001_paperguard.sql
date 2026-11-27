create table public.users (
  clerk_user_id text primary key,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
create table public.user_preferences (
  user_id text primary key references public.users on delete cascade,
  retain_document_text boolean not null default false,
  retention_consent_at timestamptz,
  check (retain_document_text = (retention_consent_at is not null))
);
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users on delete cascade,
  document_name text not null,
  document_type text not null check(document_type in ('pdf','docx','txt','paste')),
  document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'),
  text_hash text not null check(text_hash ~ '^[a-f0-9]{64}$'),
  word_count integer not null check(word_count > 0),
  character_count integer not null check(character_count > 0),
  page_count integer check(page_count > 0),
  ai_score double precision check(ai_score between 0 and 1),
  writing_score integer check(writing_score between 0 and 100),
  ai jsonb,
  writing jsonb,
  ai_error text,
  writing_error text,
  processing_duration integer not null default 0,
  status text not null default 'processing' check(status in ('processing','complete','partial','failed')),
  active_until timestamptz not null default now() + interval '2 minutes',
  created_at timestamptz not null default now(),
  unique(user_id, document_hash, text_hash)
);
create table public.retained_document_text (
  scan_id uuid primary key references public.scans on delete cascade,
  extracted_text text not null,
  ai jsonb,
  writing jsonb,
  retention_consent_at timestamptz not null
);
create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.users on delete set null,
  scan_id uuid references public.scans on delete set null,
  provider text not null check(provider in ('sapling','gemini')),
  characters_processed integer not null check(characters_processed > 0),
  request_count integer not null check(request_count > 0),
  attempted_requests integer check(attempted_requests between 0 and request_count),
  charged_characters integer check(charged_characters between 0 and characters_processed),
  input_tokens integer,
  output_tokens integer,
  request_status text not null default 'reserved' check(request_status in ('reserved','success','failed')),
  estimated_cost numeric check(estimated_cost >= 0),
  created_at timestamptz not null default now()
);
create index scans_owner_date on public.scans(user_id,created_at desc);
create index api_usage_provider_date on public.api_usage(provider,created_at);
create index api_usage_user_date on public.api_usage(user_id,created_at);

alter table public.users enable row level security;
alter table public.user_preferences enable row level security;
alter table public.scans enable row level security;
alter table public.retained_document_text enable row level security;
alter table public.api_usage enable row level security;

revoke all on public.users,public.user_preferences,public.scans,public.retained_document_text,public.api_usage from anon,authenticated;
grant select on public.users,public.user_preferences,public.scans,public.retained_document_text to authenticated;
grant delete on public.scans to authenticated;
create policy own_user on public.users for select to authenticated using (clerk_user_id = (select auth.jwt()->>'sub'));
create policy own_preferences on public.user_preferences for select to authenticated using (user_id = (select auth.jwt()->>'sub'));
create policy own_scan on public.scans for select to authenticated using (user_id = (select auth.jwt()->>'sub'));
create policy delete_own_scan on public.scans for delete to authenticated using (user_id = (select auth.jwt()->>'sub') and (status <> 'processing' or active_until < now()));
create policy own_retained on public.retained_document_text for select to authenticated using (
  exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select auth.jwt()->>'sub'))
);
create function public.guard_scan_start() returns trigger language plpgsql set search_path = '' as $$
begin
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
create trigger guard_scan_insert before insert on public.scans for each row execute function public.guard_scan_start();
create trigger guard_scan_retry before update of active_until on public.scans for each row when(new.status='processing') execute function public.guard_scan_start();

create function public.reserve_quota(
  p_user text,p_scan uuid,p_provider text,p_characters integer,p_requests integer,
  p_daily bigint,p_monthly bigint,p_daily_requests bigint
) returns uuid language plpgsql set search_path = '' as $$
declare
  result uuid;
  day_start timestamptz := date_trunc('day',now(),'UTC');
  month_start timestamptz := date_trunc('month',now(),'UTC');
  day_chars bigint;
  month_chars bigint;
  day_requests bigint;
begin
  if not exists(select 1 from public.scans where id=p_scan and user_id=p_user and status='processing') then
    raise exception 'scan_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paperguard-provider-' || p_provider,0));
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
revoke all on function public.reserve_quota(text,uuid,text,integer,integer,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_quota(text,uuid,text,integer,integer,bigint,bigint,bigint) to service_role;

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
revoke all on function public.set_retention(text,boolean) from public,anon,authenticated;
grant execute on function public.set_retention(text,boolean) to service_role;

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
  where id=p_scan and user_id=p_user and active_until=p_lease and status='processing';
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
revoke all on function public.finish_scan(text,uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_scan(text,uuid,timestamptz,jsonb,jsonb) to service_role;

create function public.workspace_stats() returns jsonb language sql stable security invoker set search_path='' as $$
  with mine as (select * from public.scans where user_id = (select auth.jwt()->>'sub'))
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
revoke all on function public.workspace_stats() from public,anon;
grant execute on function public.workspace_stats() to authenticated;

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
revoke all on function public.admin_stats() from public,anon,authenticated;
grant execute on function public.admin_stats() to service_role;
