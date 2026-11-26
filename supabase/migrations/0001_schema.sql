-- Drivers Ed Scheduler: schema + automatic placement
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

-- A class (e.g. "Spring 2027 Session A"). Status moves signup -> ranking -> closed.
create table if not exists classes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text not null default 'signup' check (status in ('signup','ranking','closed')),
  seats_per_group  int  not null default 2 check (seats_per_group between 1 and 10),
  min_ranks        int  not null default 3 check (min_ranks >= 1),
  created_at       timestamptz not null default now()
);

-- Everyone who signs up. `token` is the private link a student uses to come back.
create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  first_name    text not null,
  last_name     text not null,
  student_email text,
  parent_name   text,
  parent_email  text not null,
  phone         text,
  gender        text not null check (gender in ('F','M')),
  partner_pref  text not null default 'any' check (partner_pref in ('any','F','M')),
  ranked_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists students_class_idx on students(class_id);

-- Pre-built groups, each with its own fixed drive times.
create table if not exists groups (
  id        uuid primary key default gen_random_uuid(),
  class_id  uuid not null references classes(id) on delete cascade,
  name      text not null,
  sort      int  not null default 0,
  unique (class_id, name)
);

create table if not exists drives (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  drive_date  date not null,
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);
create index if not exists drives_group_idx on drives(group_id);

-- A student's ranked list of groups (1 = first choice).
create table if not exists rankings (
  student_id  uuid not null references students(id) on delete cascade,
  group_id    uuid not null references groups(id) on delete cascade,
  rank        int  not null check (rank >= 1),
  primary key (student_id, group_id),
  unique (student_id, rank)
);

-- Where each student ended up. One row per student at most.
create table if not exists placements (
  student_id  uuid primary key references students(id) on delete cascade,
  group_id    uuid not null references groups(id) on delete cascade,
  method      text not null default 'auto' check (method in ('auto','manual')),
  rank_got    int,
  placed_at   timestamptz not null default now()
);
create index if not exists placements_group_idx on placements(group_id);

-- Lock everything down: only the app's server (service role key) can read or write.
alter table classes    enable row level security;
alter table students   enable row level security;
alter table groups     enable row level security;
alter table drives     enable row level security;
alter table rankings   enable row level security;
alter table placements enable row level security;

-- Can student S sit in a car with everyone already placed in group G?
create or replace function compatible_with_group(p_student uuid, p_group uuid)
returns boolean language sql stable as $$
  select not exists (
    select 1
    from placements p
    join students o on o.id = p.student_id
    join students s on s.id = p_student
    where p.group_id = p_group
      and p.student_id <> p_student
      and not (
        (s.partner_pref = 'any' or s.partner_pref = o.gender) and
        (o.partner_pref = 'any' or o.partner_pref = s.gender)
      )
  );
$$;

-- Place one student into their highest-ranked group that has a seat and a
-- compatible partner. Returns the group id, or null if every ranked group is
-- full or incompatible (the student is then on the waitlist).
create or replace function place_student(p_student uuid)
returns uuid language plpgsql as $$
declare
  v_class uuid;
  v_seats int;
  v_existing uuid;
  r record;
begin
  select s.class_id, c.seats_per_group into v_class, v_seats
  from students s join classes c on c.id = s.class_id
  where s.id = p_student;
  if v_class is null then
    raise exception 'student not found';
  end if;

  -- One placement at a time per class, so two students can never take the last seat.
  perform pg_advisory_xact_lock(hashtext('place:' || v_class::text));

  select group_id into v_existing from placements where student_id = p_student;
  if v_existing is not null then
    return v_existing;
  end if;

  for r in
    select k.group_id, k.rank
    from rankings k
    where k.student_id = p_student
    order by k.rank
  loop
    if (select count(*) from placements where group_id = r.group_id) < v_seats
       and compatible_with_group(p_student, r.group_id) then
      insert into placements (student_id, group_id, method, rank_got)
      values (p_student, r.group_id, 'auto', r.rank);
      return r.group_id;
    end if;
  end loop;

  return null;
end;
$$;

-- Called from the student's private link. Saves their ranking and places them
-- immediately. Returns json: {status: 'placed'|'waitlist'|'error', ...}
create or replace function submit_rankings(p_token text, p_groups uuid[])
returns jsonb language plpgsql as $$
declare
  s students%rowtype;
  c classes%rowtype;
  v_group uuid;
  v_rank int;
  v_required int;
begin
  select * into s from students where token = p_token;
  if s.id is null then
    return jsonb_build_object('status','error','message','This link is not valid.');
  end if;
  select * into c from classes where id = s.class_id;
  if c.status <> 'ranking' then
    return jsonb_build_object('status','error','message','Group choices are not open for this class right now.');
  end if;
  if exists (select 1 from placements where student_id = s.id) then
    return jsonb_build_object('status','error','message','You are already placed in a group.');
  end if;
  -- Ask for min_ranks choices, or every open group if fewer are left.
  select least(c.min_ranks, greatest(count(*)::int, 1)) into v_required
  from groups g
  where g.class_id = c.id
    and (select count(*) from placements p where p.group_id = g.id) < c.seats_per_group
    and compatible_with_group(s.id, g.id);
  if p_groups is null or coalesce(array_length(p_groups,1),0) < v_required then
    return jsonb_build_object('status','error','message', case when v_required = 1 then 'Please rank at least 1 group.' else format('Please rank at least %s groups.', v_required) end);
  end if;
  if (select count(distinct g) from unnest(p_groups) g) <> array_length(p_groups,1) then
    return jsonb_build_object('status','error','message','Each group can only be ranked once.');
  end if;
  if exists (select 1 from unnest(p_groups) g where g not in (select id from groups where class_id = c.id)) then
    return jsonb_build_object('status','error','message','One of those groups is not part of this class.');
  end if;

  delete from rankings where student_id = s.id;
  insert into rankings (student_id, group_id, rank)
  select s.id, g, ord::int from unnest(p_groups) with ordinality as t(g, ord);
  update students set ranked_at = now() where id = s.id;

  v_group := place_student(s.id);
  if v_group is null then
    return jsonb_build_object('status','waitlist');
  end if;
  select rank_got into v_rank from placements where student_id = s.id;
  return jsonb_build_object('status','placed','group_id',v_group,'rank',v_rank);
end;
$$;

-- What the ranking page shows a student: every group in their class, with seats
-- left and whether this student can actually join it right now.
create or replace function groups_for_student(p_token text)
returns table (group_id uuid, name text, sort int, seats_left int, available boolean)
language sql stable as $$
  select g.id, g.name, g.sort,
         c.seats_per_group - (select count(*) from placements p where p.group_id = g.id)::int,
         (select count(*) from placements p where p.group_id = g.id) < c.seats_per_group
           and compatible_with_group(s.id, g.id)
  from students s
  join classes c on c.id = s.class_id
  join groups g on g.class_id = c.id
  where s.token = p_token
  order by g.sort, g.name;
$$;

-- When a seat opens (student removed or moved), place waiting students in the
-- order they submitted. Returns how many were placed.
create or replace function fill_waitlist(p_class uuid)
returns int language plpgsql as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select s.id from students s
    where s.class_id = p_class
      and s.ranked_at is not null
      and not exists (select 1 from placements p where p.student_id = s.id)
    order by s.ranked_at
  loop
    if place_student(r.id) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Admin move. Refuses if the target group is full unless p_force is true.
create or replace function move_student(p_student uuid, p_group uuid, p_force boolean default false)
returns jsonb language plpgsql as $$
declare
  v_class uuid;
  v_seats int;
  v_rank int;
begin
  select s.class_id, c.seats_per_group into v_class, v_seats
  from students s join classes c on c.id = s.class_id where s.id = p_student;
  if v_class is null or not exists (select 1 from groups where id = p_group and class_id = v_class) then
    return jsonb_build_object('status','error','message','Student or group not found in this class.');
  end if;
  perform pg_advisory_xact_lock(hashtext('place:' || v_class::text));
  if not p_force and (select count(*) from placements where group_id = p_group and student_id <> p_student) >= v_seats then
    return jsonb_build_object('status','error','message','That group is full.');
  end if;
  select rank into v_rank from rankings where student_id = p_student and group_id = p_group;
  insert into placements (student_id, group_id, method, rank_got)
  values (p_student, p_group, 'manual', v_rank)
  on conflict (student_id) do update set group_id = excluded.group_id, method = 'manual', rank_got = excluded.rank_got, placed_at = now();
  perform fill_waitlist(v_class);
  return jsonb_build_object('status','ok');
end;
$$;

-- Keep these functions away from the public API roles; the app calls them with the service role.
do $$
declare f text;
begin
  foreach f in array array[
    'compatible_with_group(uuid,uuid)','groups_for_student(text)','place_student(uuid)','submit_rankings(text,uuid[])',
    'fill_waitlist(uuid)','move_student(uuid,uuid,boolean)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- Newer Supabase projects don't grant table access to service_role automatically.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
