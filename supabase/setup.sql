-- My Art Studio: Friends server setup for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then select Run.
-- It is safe to run again; it replaces functions and policies with the same names.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.invites (
  code text primary key,
  note text check (char_length(note) <= 80),
  created_at timestamptz not null default now(),
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null unique references auth.users (id) on delete cascade,
  parent_name text not null check (char_length(parent_name) between 1 and 40),
  status text not null default 'pending_consent'
    check (status in ('pending_consent', 'pending_review', 'approved')),
  consent_path text,
  consent_uploaded_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  tone text not null default 'sky' check (tone in ('sky', 'sun', 'gum')),
  created_at timestamptz not null default now()
);

create table if not exists public.family_links (
  family_a uuid not null references public.families (id) on delete cascade,
  family_b uuid not null references public.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_a, family_b),
  check (family_a < family_b)
);

create table if not exists public.link_codes (
  code text primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  title text not null default 'My art' check (char_length(title) between 1 and 40),
  image_path text not null,
  comments_on boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists posts_family_created on public.posts (family_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists comments_post on public.comments (post_id, created_at);
create index if not exists comments_child_time on public.comments (child_id, created_at);

create table if not exists public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  kind text not null check (kind in ('heart', 'star')),
  created_at timestamptz not null default now(),
  primary key (post_id, child_id, kind)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  reporter_family_id uuid not null references public.families (id) on delete cascade,
  reporter_child_id uuid references public.children (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_family_id)
);

alter table public.admins enable row level security;
alter table public.invites enable row level security;
alter table public.families enable row level security;
alter table public.children enable row level security;
alter table public.family_links enable row level security;
alter table public.link_codes enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions used by the security rules
-- ---------------------------------------------------------------------------

create or replace function public.my_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.families where parent_id = auth.uid();
$$;

create or replace function public.my_approved_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.families where parent_id = auth.uid() and status = 'approved';
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- True when the signed-in parent's family is approved and is either this
-- family or linked to it as friends (and this family is approved too).
create or replace function public.can_see_family(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.families mine
    join public.families other on other.id = f and other.status = 'approved'
    where mine.parent_id = auth.uid()
      and mine.status = 'approved'
      and (
        mine.id = f
        or exists (
          select 1 from public.family_links l
          where l.family_a = least(mine.id, f) and l.family_b = greatest(mine.id, f)
        )
      )
  );
$$;

create or replace function public.can_see_folder(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.can_see_family(p::uuid);
exception when others then
  return false;
end;
$$;

create or replace function public.can_see_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where id = p and public.can_see_family(family_id));
$$;

-- ---------------------------------------------------------------------------
-- Kindness check (runs on the server, so it can't be skipped)
-- Returns null when the text is fine, or 'private' / 'unkind' / 'empty'.
-- ---------------------------------------------------------------------------

create or replace function public.kindness_problem(p_text text) returns text
language plpgsql immutable set search_path = public as $$
declare
  t text := lower(coalesce(p_text, ''));
  norm text;
  joined text;
  tok text;
  clean text;
  unkind text[] := array[
    'ugly', 'stupid', 'dumb', 'idiot', 'idiotic', 'loser', 'hate', 'hates', 'hated', 'worst',
    'gross', 'lame', 'suck', 'sucks', 'trash', 'garbage', 'boring', 'terrible', 'horrible',
    'awful', 'disgusting', 'pathetic', 'moron', 'shutup', 'freak', 'kill', 'die', 'weirdo',
    'fuck', 'shit', 'crap', 'damn', 'bitch', 'ass', 'asshole', 'bastard', 'wtf', 'stfu',
    'piss', 'dick', 'hell', 'sucker', 'kys'];
  collapsed text[];
begin
  if char_length(trim(t)) = 0 then
    return 'empty';
  end if;

  -- Personal information and ways to contact someone
  if t ~ '(\d[\s().-]*){7,}'
     or t ~ '[^\s@]+@[^\s@]+\.[^\s@]+'
     or t ~ '(https?://|www\.|\.(com|net|org|io|co|gg|me|tv|app|ly)\y)'
     or t ~ '\y(address|street|avenue|where do you live|where you live|what school|which school|how old|my number|phone number|text me|call me|snapchat|snap me|instagram|insta|tiktok|discord|whatsapp|meet me|meet up|my house)\y'
  then
    return 'private';
  end if;

  -- Unkind words, including number swaps (5tup1d) and spaced letters (u g l y)
  norm := translate(t, '’‘01|34@57$', chr(39) || chr(39) || 'oiieaasts');
  if norm ~ '\y(shut up|nobody likes|no one likes|can''?t draw|cannot draw|looks bad|so bad|is bad|really bad|not good|bad at|go away|you''?re bad|you are bad|copied|copy ?cat)\y' then
    return 'unkind';
  end if;
  joined := regexp_replace(norm, '\y([a-z])[\s._*-]+(?=[a-z]\y)', '\1', 'g');
  select array_agg(regexp_replace(w, '(.)\1+', '\1', 'g')) into collapsed from unnest(unkind) as w;
  for tok in select regexp_split_to_table(norm || ' ' || joined, '[^a-z'']+') loop
    clean := replace(tok, chr(39), '');
    continue when clean = '';
    if clean = any (unkind)
       or regexp_replace(clean, '(.)\1+', '\1', 'g') = any (collapsed)
       or clean ~ '(fuck|shit|bitch)' then
      return 'unkind';
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checks that run when kids post, comment, or name themselves
-- ---------------------------------------------------------------------------

create or replace function public.check_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  problem text;
begin
  if not exists (select 1 from public.posts where id = new.post_id and comments_on) then
    raise exception 'comments_off';
  end if;
  if (select count(*) from public.comments
      where child_id = new.child_id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'comment_too_fast';
  end if;
  problem := public.kindness_problem(new.body);
  if problem is not null then
    raise exception 'comment_%', problem;
  end if;
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists comments_check on public.comments;
create trigger comments_check before insert on public.comments
  for each row execute function public.check_comment();

create or replace function public.check_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  problem text;
begin
  problem := public.kindness_problem(new.title);
  if problem is not null then
    raise exception 'title_%', problem;
  end if;
  if tg_op = 'INSERT' and new.image_path not like new.family_id::text || '/%' then
    raise exception 'image_path_invalid';
  end if;
  if tg_op = 'UPDATE' then
    new.image_path := old.image_path;
    new.family_id := old.family_id;
    new.child_id := old.child_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists posts_check on public.posts;
create trigger posts_check before insert or update on public.posts
  for each row execute function public.check_post();

create or replace function public.check_child() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  problem text;
begin
  new.display_name := trim(new.display_name);
  problem := public.kindness_problem(new.display_name);
  if problem is not null then
    raise exception 'name_%', problem;
  end if;
  return new;
end;
$$;
drop trigger if exists children_check on public.children;
create trigger children_check before insert or update on public.children
  for each row execute function public.check_child();

-- ---------------------------------------------------------------------------
-- Security rules (row level security)
-- ---------------------------------------------------------------------------

drop policy if exists "invites admin" on public.invites;
create policy "invites admin" on public.invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "families read" on public.families;
create policy "families read" on public.families
  for select to authenticated
  using (parent_id = auth.uid() or public.is_admin() or public.can_see_family(id));

drop policy if exists "children read" on public.children;
create policy "children read" on public.children
  for select to authenticated
  using (family_id = public.my_family_id() or public.can_see_family(family_id) or public.is_admin());
drop policy if exists "children write" on public.children;
create policy "children write" on public.children
  for all to authenticated
  using (family_id = public.my_approved_family_id())
  with check (family_id = public.my_approved_family_id());

drop policy if exists "links read" on public.family_links;
create policy "links read" on public.family_links
  for select to authenticated
  using (family_a = public.my_family_id() or family_b = public.my_family_id());
drop policy if exists "links remove" on public.family_links;
create policy "links remove" on public.family_links
  for delete to authenticated
  using (family_a = public.my_family_id() or family_b = public.my_family_id());

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts
  for select to authenticated using (public.can_see_family(family_id));
drop policy if exists "posts add" on public.posts;
create policy "posts add" on public.posts
  for insert to authenticated
  with check (
    family_id = public.my_approved_family_id()
    and exists (select 1 from public.children c where c.id = child_id and c.family_id = posts.family_id)
  );
drop policy if exists "posts change" on public.posts;
create policy "posts change" on public.posts
  for update to authenticated
  using (family_id = public.my_approved_family_id())
  with check (family_id = public.my_approved_family_id());
drop policy if exists "posts remove" on public.posts;
create policy "posts remove" on public.posts
  for delete to authenticated
  using (family_id = public.my_family_id() or public.is_admin());

drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments
  for select to authenticated
  using (public.can_see_post(post_id) and public.can_see_family(family_id));
drop policy if exists "comments add" on public.comments;
create policy "comments add" on public.comments
  for insert to authenticated
  with check (
    family_id = public.my_approved_family_id()
    and exists (select 1 from public.children c where c.id = child_id and c.family_id = comments.family_id)
    and public.can_see_post(post_id)
  );
drop policy if exists "comments remove" on public.comments;
create policy "comments remove" on public.comments
  for delete to authenticated
  using (
    family_id = public.my_family_id()
    or exists (select 1 from public.posts p where p.id = post_id and p.family_id = public.my_family_id())
    or public.is_admin()
  );

drop policy if exists "reactions read" on public.reactions;
create policy "reactions read" on public.reactions
  for select to authenticated
  using (public.can_see_post(post_id) and public.can_see_family(family_id));
drop policy if exists "reactions add" on public.reactions;
create policy "reactions add" on public.reactions
  for insert to authenticated
  with check (
    family_id = public.my_approved_family_id()
    and exists (select 1 from public.children c where c.id = child_id and c.family_id = reactions.family_id)
    and public.can_see_post(post_id)
  );
drop policy if exists "reactions remove" on public.reactions;
create policy "reactions remove" on public.reactions
  for delete to authenticated using (family_id = public.my_family_id());

drop policy if exists "reports add" on public.reports;
create policy "reports add" on public.reports
  for insert to authenticated
  with check (
    reporter_family_id = public.my_approved_family_id()
    and exists (select 1 from public.comments c where c.id = comment_id
                and public.can_see_post(c.post_id) and public.can_see_family(c.family_id))
  );
drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports
  for select to authenticated
  using (
    public.is_admin()
    or reporter_family_id = public.my_family_id()
    or exists (select 1 from public.comments c join public.posts p on p.id = c.post_id
               where c.id = comment_id and p.family_id = public.my_family_id())
  );
drop policy if exists "reports resolve" on public.reports;
create policy "reports resolve" on public.reports
  for delete to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.comments c join public.posts p on p.id = c.post_id
               where c.id = comment_id and p.family_id = public.my_family_id())
  );

-- admins and link_codes have no policies: only the functions below can use them.

-- ---------------------------------------------------------------------------
-- Actions the app calls
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(p_code text, p_parent_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  found_code text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select id into fid from public.families where parent_id = auth.uid();
  if fid is not null then return fid; end if;
  if char_length(trim(coalesce(p_parent_name, ''))) not between 1 and 40 then
    raise exception 'parent_name_invalid';
  end if;
  select code into found_code from public.invites
    where code = upper(trim(p_code)) and used_by is null
    for update;
  if found_code is null then raise exception 'invite_invalid'; end if;
  insert into public.families (parent_id, parent_name) values (auth.uid(), trim(p_parent_name))
    returning id into fid;
  update public.invites set used_by = auth.uid(), used_at = now() where code = found_code;
  return fid;
end;
$$;

create or replace function public.submit_consent(p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_family_id();
begin
  if fid is null then raise exception 'no_family'; end if;
  if p_path not like fid::text || '/%' then raise exception 'consent_path_invalid'; end if;
  update public.families
    set consent_path = p_path, consent_uploaded_at = now(),
        status = case when status = 'approved' then 'approved' else 'pending_review' end
    where id = fid;
end;
$$;

create or replace function public.admin_create_invite(p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invites (code, note) values (new_code, left(coalesce(p_note, ''), 80));
  return new_code;
end;
$$;

create or replace function public.admin_review_family(p_family uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.families
    set status = case when p_approve then 'approved' else 'pending_consent' end,
        approved_at = case when p_approve then now() else null end
    where id = p_family;
end;
$$;

create or replace function public.create_link_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_approved_family_id();
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text := '';
  i int;
begin
  if fid is null then raise exception 'not_approved'; end if;
  delete from public.link_codes where family_id = fid or expires_at < now();
  for i in 1..6 loop
    new_code := new_code || substr(alphabet, 1 + floor(random() * char_length(alphabet))::int, 1);
  end loop;
  insert into public.link_codes (code, family_id, expires_at) values (new_code, fid, now() + interval '7 days');
  return new_code;
end;
$$;

create or replace function public.redeem_link_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_approved_family_id();
  other uuid;
begin
  if fid is null then raise exception 'not_approved'; end if;
  select family_id into other from public.link_codes
    where code = upper(trim(p_code)) and expires_at > now();
  if other is null then raise exception 'link_code_invalid'; end if;
  if other = fid then raise exception 'link_code_own'; end if;
  if not exists (select 1 from public.families where id = other and status = 'approved') then
    raise exception 'link_code_invalid';
  end if;
  insert into public.family_links (family_a, family_b) values (least(fid, other), greatest(fid, other))
    on conflict do nothing;
  delete from public.link_codes where code = upper(trim(p_code));
  return other;
end;
$$;

-- Deletes the family and everything it shared. The app removes the image files first.
create or replace function public.withdraw_family() returns void
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_family_id();
begin
  if fid is not null then
    delete from public.families where id = fid;
  end if;
  begin
    delete from auth.users where id = auth.uid();
  exception when others then
    null; -- the owner can remove the sign-in from the Supabase dashboard
  end;
end;
$$;

revoke all on function public.redeem_invite(text, text) from public, anon;
revoke all on function public.submit_consent(text) from public, anon;
revoke all on function public.admin_create_invite(text) from public, anon;
revoke all on function public.admin_review_family(uuid, boolean) from public, anon;
revoke all on function public.create_link_code() from public, anon;
revoke all on function public.redeem_link_code(text) from public, anon;
revoke all on function public.withdraw_family() from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.submit_consent(text) to authenticated;
grant execute on function public.admin_create_invite(text) to authenticated;
grant execute on function public.admin_review_family(uuid, boolean) to authenticated;
grant execute on function public.create_link_code() to authenticated;
grant execute on function public.redeem_link_code(text) to authenticated;
grant execute on function public.withdraw_family() to authenticated;

-- ---------------------------------------------------------------------------
-- Picture storage: shared art and signed consent forms (both private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('art', 'art', false, 3145728, array['image/jpeg']),
  ('consent', 'consent', false, 8388608, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "art read" on storage.objects;
create policy "art read" on storage.objects for select to authenticated
  using (bucket_id = 'art' and public.can_see_folder((storage.foldername(name))[1]));
drop policy if exists "art add" on storage.objects;
create policy "art add" on storage.objects for insert to authenticated
  with check (bucket_id = 'art' and (storage.foldername(name))[1] = public.my_approved_family_id()::text);
drop policy if exists "art remove" on storage.objects;
create policy "art remove" on storage.objects for delete to authenticated
  using (bucket_id = 'art' and ((storage.foldername(name))[1] = public.my_family_id()::text or public.is_admin()));

drop policy if exists "consent read" on storage.objects;
create policy "consent read" on storage.objects for select to authenticated
  using (bucket_id = 'consent' and ((storage.foldername(name))[1] = public.my_family_id()::text or public.is_admin()));
drop policy if exists "consent add" on storage.objects;
create policy "consent add" on storage.objects for insert to authenticated
  with check (bucket_id = 'consent' and (storage.foldername(name))[1] = public.my_family_id()::text);
drop policy if exists "consent remove" on storage.objects;
create policy "consent remove" on storage.objects for delete to authenticated
  using (bucket_id = 'consent' and ((storage.foldername(name))[1] = public.my_family_id()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- After your first sign-in in the app, make yourself the owner by running
-- this line on its own, with your email in place of the example:
--
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------
