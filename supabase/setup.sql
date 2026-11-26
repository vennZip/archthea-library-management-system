-- Archthea: run ONCE in the SQL editor of a fresh Supabase project.
-- For managed deployments prefer the individual CLI migrations.

-- 202611250001_schema.sql
-- Application schema. Supabase owns auth.users and storage.*.
begin;
create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 120),
  role text not null default 'STUDENT' check (role in ('STUDENT', 'LIBRARIAN')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.student_profiles (
  id uuid primary key references public.profiles(id) on delete restrict,
  student_number text not null unique check (char_length(student_number) between 2 and 40),
  program text not null default '',
  year_level integer check (year_level between 1 and 12),
  borrowing_restricted boolean not null default false
);
create table public.librarian_profiles (
  id uuid primary key references public.profiles(id) on delete restrict,
  staff_number text not null unique
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories(lower(name));
create table public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.books (
  id uuid primary key default gen_random_uuid(),
  isbn text unique check (isbn is null or isbn ~ '^([0-9]{13}|[0-9]{9}[0-9X])$'),
  title text not null check (char_length(title) between 1 and 240),
  publisher_id uuid references public.publishers(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  publication_year integer check (publication_year between 1000 and 2200),
  description text not null default '' check (char_length(description) <= 10000),
  cover_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.book_authors (
  book_id uuid not null references public.books(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete restrict,
  author_order integer not null default 0,
  primary key (book_id, author_id)
);
create table public.book_copies (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  barcode text not null unique check (char_length(barcode) between 2 and 80),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','BORROWED','RESERVED','DAMAGED','LOST','MAINTENANCE')),
  condition text not null default 'GOOD' check (condition in ('NEW','GOOD','WORN','DAMAGED','LOST')),
  notes text not null default '' check (char_length(notes) <= 2000),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,book_id),
  check (status not in ('AVAILABLE','BORROWED','RESERVED') or condition not in ('DAMAGED','LOST'))
);
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  book_id uuid not null references public.books(id) on delete restrict,
  copy_id uuid,
  status text not null default 'WAITING' check (status in ('WAITING','READY_FOR_PICKUP','COMPLETED','CANCELLED','EXPIRED')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  check (status <> 'READY_FOR_PICKUP' or (copy_id is not null and ready_at is not null and expires_at > ready_at)),
  foreign key(copy_id,book_id) references public.book_copies(id,book_id) on delete restrict,
  unique(id,student_id,copy_id)
);
create unique index reservations_active_student_book on public.reservations(student_id,book_id) where status in ('WAITING','READY_FOR_PICKUP');
create unique index reservations_active_copy on public.reservations(copy_id) where status = 'READY_FOR_PICKUP';
create table public.borrow_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  copy_id uuid not null references public.book_copies(id) on delete restrict,
  reservation_id uuid unique references public.reservations(id) on delete restrict,
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETURNED','LOST')),
  processed_by uuid references public.librarian_profiles(id) on delete restrict,
  returned_by uuid references public.librarian_profiles(id) on delete restrict,
  foreign key(reservation_id,student_id,copy_id) references public.reservations(id,student_id,copy_id) on delete restrict,
  check (due_at > borrowed_at),
  check ((status = 'ACTIVE' and returned_at is null) or (status <> 'ACTIVE' and returned_at is not null and returned_at >= borrowed_at))
);
create unique index loans_active_copy on public.borrow_transactions(copy_id) where status = 'ACTIVE';
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  type text not null,
  title text not null,
  message text not null,
  entity_id uuid,
  deduplication_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.library_settings (
  id boolean primary key default true check (id),
  max_books integer not null default 3 check (max_books between 1 and 50),
  loan_days integer not null default 14 check (loan_days between 1 and 365),
  max_reservations integer not null default 3 check (max_reservations between 1 and 50),
  collection_hours integer not null default 48 check (collection_hours between 1 and 720),
  restrict_overdue boolean not null default true,
  timezone text not null default 'Asia/Singapore',
  updated_by uuid references public.librarian_profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.library_settings(id) values(true);
create table public.idempotency_requests (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation text not null,
  key uuid not null,
  fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation,key)
);

create index books_category_idx on public.books(category_id);
create index books_publisher_idx on public.books(publisher_id);
create index books_title_idx on public.books(lower(title));
create index books_search_idx on public.books using gin(to_tsvector('simple', title || ' ' || coalesce(isbn,'')));
create index book_authors_author_idx on public.book_authors(author_id);
create index copies_book_status_idx on public.book_copies(book_id,status) where retired_at is null;
create index loans_student_idx on public.borrow_transactions(student_id,borrowed_at desc);
create index loans_overdue_idx on public.borrow_transactions(due_at) where status = 'ACTIVE';
create index loans_copy_idx on public.borrow_transactions(copy_id);
create index queue_order_idx on public.reservations(book_id,created_at,id) where status = 'WAITING';
create index reservations_student_idx on public.reservations(student_id,created_at desc);
create index reservations_copy_idx on public.reservations(copy_id);
create index reservations_expiry_idx on public.reservations(expires_at) where status = 'READY_FOR_PICKUP';
create index notifications_user_idx on public.notifications(user_id,created_at desc);
create index audit_created_idx on public.audit_logs(created_at desc);
create index audit_actor_idx on public.audit_logs(actor_id);

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare name text; begin
  foreach name in array array['profiles','books','book_copies'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',name);
  end loop;
end $$;

-- No trigger trusts raw_user_meta_data for role assignment. Profiles are explicitly
-- provisioned by the backend after Auth invitation, or by the first-admin script.
create function private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'ACTIVE');
$$;
create function private.is_librarian() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'ACTIVE' and role = 'LIBRARIAN');
$$;
grant usage on schema private to authenticated,service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active(),private.is_librarian() to authenticated,service_role;

do $$ declare name text; begin
  foreach name in array array['profiles','student_profiles','librarian_profiles','categories','authors','publishers','books','book_authors','book_copies','borrow_transactions','reservations','notifications','audit_logs','library_settings','idempotency_requests'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from anon,authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
grant select on public.profiles,public.student_profiles,public.librarian_profiles,public.categories,public.authors,public.publishers,public.books,public.book_authors,public.book_copies,public.borrow_transactions,public.reservations,public.notifications,public.audit_logs,public.library_settings to authenticated;
create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_librarian()));
create policy student_read on public.student_profiles for select to authenticated using ((id = (select auth.uid()) and (select private.is_active())) or (select private.is_librarian()));
create policy librarian_read on public.librarian_profiles for select to authenticated using ((select private.is_librarian()));
create policy categories_read on public.categories for select to authenticated using ((select private.is_active()));
create policy authors_read on public.authors for select to authenticated using ((select private.is_active()));
create policy publishers_read on public.publishers for select to authenticated using ((select private.is_active()));
create policy books_read on public.books for select to authenticated using ((select private.is_active()) and (archived_at is null or (select private.is_librarian())));
create policy book_authors_read on public.book_authors for select to authenticated using (exists(select 1 from public.books where id = book_id));
-- Copy metadata may include staff notes; students receive only aggregate counts via catalog.
create policy copies_read on public.book_copies for select to authenticated using ((select private.is_librarian()));
create policy loans_read on public.borrow_transactions for select to authenticated using ((student_id = (select auth.uid()) and (select private.is_active())) or (select private.is_librarian()));
create policy reservations_read on public.reservations for select to authenticated using ((student_id = (select auth.uid()) and (select private.is_active())) or (select private.is_librarian()));
create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()) and (select private.is_active()));
create policy audit_read on public.audit_logs for select to authenticated using ((select private.is_librarian()));
create policy settings_read on public.library_settings for select to authenticated using ((select private.is_active()));

-- Backend-only catalog view. It never exposes copy notes or borrower identities.
create view public.catalog with (security_invoker = true) as
select b.*, c.name as category, p.name as publisher,
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by ba.author_order,a.name)
    from public.book_authors ba join public.authors a on a.id=ba.author_id where ba.book_id=b.id),'[]'::jsonb) as authors,
  coalesce((select string_agg(a.name,' ' order by ba.author_order) from public.book_authors ba join public.authors a on a.id=ba.author_id where ba.book_id=b.id),'') as author_names,
  (select count(*)::integer from public.book_copies cp where cp.book_id=b.id and cp.retired_at is null) as total_copies,
  (select count(*)::integer from public.book_copies cp where cp.book_id=b.id and cp.retired_at is null and cp.status='AVAILABLE') as available_copies,
  (select count(*)::integer from public.book_copies cp where cp.book_id=b.id and cp.retired_at is null and cp.status='BORROWED') as borrowed_copies,
  (select count(*)::integer from public.book_copies cp where cp.book_id=b.id and cp.retired_at is null and cp.status='RESERVED') as reserved_copies,
  (select count(*)::integer from public.borrow_transactions bt join public.book_copies cp on cp.id=bt.copy_id where cp.book_id=b.id) as borrow_count
from public.books b join public.categories c on c.id=b.category_id left join public.publishers p on p.id=b.publisher_id;
revoke all on public.catalog from public,anon,authenticated;
grant select on public.catalog to service_role;

-- Stock Supabase Storage tables are created by Supabase, not this application.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('book-covers','book-covers',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- Private bucket: uploads and expiring signed download URLs are issued by Express.
commit;


-- 202611250002_circulation.sql
begin;
create function private.lock_circulation() returns void language sql set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(71002210);
$$;

create function private.assert_actor(p_actor uuid,p_admin boolean default false)
returns public.profiles language plpgsql set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id=p_actor;
  if not found or actor.status <> 'ACTIVE' then raise exception 'ACCOUNT_INACTIVE'; end if;
  if p_admin and actor.role <> 'LIBRARIAN' then raise exception 'FORBIDDEN'; end if;
  return actor;
end $$;

create function private.assert_student(p_student uuid,p_check_limit boolean default true)
returns void language plpgsql set search_path = '' as $$
declare student record; policy public.library_settings;
begin
  select p.status,p.role,s.borrowing_restricted into student
    from public.student_profiles s join public.profiles p on p.id=s.id where s.id=p_student for update of s,p;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  if student.status <> 'ACTIVE' or student.role <> 'STUDENT' then raise exception 'ACCOUNT_INACTIVE'; end if;
  if student.borrowing_restricted then raise exception 'BORROWING_RESTRICTED'; end if;
  select * into strict policy from public.library_settings where id=true;
  if policy.restrict_overdue and exists(select 1 from public.borrow_transactions where student_id=p_student and status='ACTIVE' and due_at<=clock_timestamp())
    then raise exception 'OVERDUE_RESTRICTION'; end if;
  if p_check_limit and (select count(*) from public.borrow_transactions where student_id=p_student and status='ACTIVE') >= policy.max_books
    then raise exception 'BORROW_LIMIT_REACHED'; end if;
end $$;

create function private.audit(p_actor uuid,p_action text,p_entity text,p_id uuid,p_details jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(p_actor,p_action,p_entity,p_id,p_details);
$$;
create function private.notify(p_user uuid,p_type text,p_title text,p_message text,p_entity uuid,p_key text default null)
returns void language sql set search_path = '' as $$
  insert into public.notifications(user_id,type,title,message,entity_id,deduplication_key)
  values(p_user,p_type,p_title,p_message,p_entity,p_key) on conflict(deduplication_key) do nothing;
$$;
create function private.replay(p_actor uuid,p_operation text,p_key uuid,p_fingerprint jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare saved public.idempotency_requests;
begin
  if p_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into saved from public.idempotency_requests where actor_id=p_actor and operation=p_operation and key=p_key;
  if found then
    if saved.fingerprint <> p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return saved.result;
  end if;
  return null;
end $$;

-- Caller holds the shared circulation lock. Expire old holds before assigning
-- available copies. Never skip locked queue rows: that would violate FIFO.
create function private.rebalance(p_book uuid) returns void language plpgsql set search_path = '' as $$
declare hold public.reservations; cp public.book_copies; candidate public.reservations;
  policy public.library_settings; book_title text; deadline timestamptz;
begin
  select * into strict policy from public.library_settings where id=true;
  select title into book_title from public.books where id=p_book;
  for hold in select * from public.reservations where book_id=p_book and status='READY_FOR_PICKUP' and expires_at<=clock_timestamp() for update loop
    update public.reservations set status='EXPIRED',closed_at=clock_timestamp() where id=hold.id;
    update public.book_copies set status='AVAILABLE' where id=hold.copy_id and status='RESERVED' and retired_at is null;
    perform private.notify(hold.student_id,'RESERVATION_EXPIRED','Reservation expired',book_title || ' was not collected before the pickup deadline.',hold.id,'expired:'||hold.id);
    perform private.audit(null,'RESERVATION_EXPIRED','reservation',hold.id);
  end loop;
  if exists(select 1 from public.books where id=p_book and archived_at is not null) then return; end if;
  for cp in select * from public.book_copies where book_id=p_book and status='AVAILABLE' and retired_at is null order by created_at,id for update loop
    select r.* into candidate from public.reservations r
      join public.profiles p on p.id=r.student_id join public.student_profiles s on s.id=p.id
      where r.book_id=p_book and r.status='WAITING' and p.status='ACTIVE' and not s.borrowing_restricted
      and (not policy.restrict_overdue or not exists(select 1 from public.borrow_transactions bt where bt.student_id=r.student_id and bt.status='ACTIVE' and bt.due_at<=clock_timestamp()))
      order by r.created_at,r.id limit 1 for update of r;
    if not found then exit; end if;
    deadline := clock_timestamp() + make_interval(hours=>policy.collection_hours);
    update public.book_copies set status='RESERVED' where id=cp.id;
    update public.reservations set status='READY_FOR_PICKUP',copy_id=cp.id,ready_at=clock_timestamp(),expires_at=deadline where id=candidate.id;
    perform private.notify(candidate.student_id,'RESERVATION_READY','Your book is ready',book_title || ' is ready for collection. Check your reservation for the deadline.',candidate.id,'ready:'||candidate.id);
    perform private.audit(null,'RESERVATION_READY','reservation',candidate.id,jsonb_build_object('copy_id',cp.id,'expires_at',deadline));
  end loop;
end $$;

create function public.borrow_book(p_actor uuid,p_student uuid,p_book uuid,p_key uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare actor public.profiles; cp public.book_copies; hold public.reservations;
  loan public.borrow_transactions; policy public.library_settings; fingerprint jsonb; result jsonb; book_title text;
begin
  perform private.lock_circulation();
  actor := private.assert_actor(p_actor);
  if actor.role='STUDENT' and p_student<>p_actor then raise exception 'FORBIDDEN'; end if;
  fingerprint := jsonb_build_object('student_id',p_student,'book_id',p_book);
  result := private.replay(p_actor,'borrow',p_key,fingerprint);
  if result is not null then return result; end if;
  perform private.assert_student(p_student);
  select title into book_title from public.books where id=p_book and archived_at is null for update;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  perform private.rebalance(p_book);
  select * into hold from public.reservations where student_id=p_student and book_id=p_book and status='READY_FOR_PICKUP' and expires_at>clock_timestamp() for update;
  if found then
    select * into cp from public.book_copies where id=hold.copy_id and status='RESERVED' and retired_at is null for update;
  else
    select * into cp from public.book_copies where book_id=p_book and status='AVAILABLE' and retired_at is null order by created_at,id limit 1 for update;
  end if;
  if cp.id is null then raise exception 'COPY_UNAVAILABLE'; end if;
  select * into strict policy from public.library_settings where id=true;
  insert into public.borrow_transactions(student_id,copy_id,reservation_id,due_at,processed_by)
    values(p_student,cp.id,hold.id,clock_timestamp()+make_interval(days=>policy.loan_days),case when actor.role='LIBRARIAN' then p_actor end)
    returning * into loan;
  update public.book_copies set status='BORROWED' where id=cp.id;
  if hold.id is not null then update public.reservations set status='COMPLETED',closed_at=clock_timestamp() where id=hold.id; end if;
  -- Any older waiting reservation by this borrower is no longer needed.
  update public.reservations set status='COMPLETED',closed_at=clock_timestamp() where student_id=p_student and book_id=p_book and status='WAITING';
  perform private.notify(p_student,'BORROW_CONFIRMED','Borrowing confirmed',book_title || ' has been added to your loans.',loan.id,'borrow:'||loan.id);
  perform private.audit(p_actor,'BOOK_BORROWED','loan',loan.id,jsonb_build_object('student_id',p_student,'copy_id',cp.id,'due_at',loan.due_at));
  result := to_jsonb(loan);
  insert into public.idempotency_requests values(p_actor,'borrow',p_key,fingerprint,result,clock_timestamp());
  return result;
end $$;

create function public.return_book(p_actor uuid,p_loan uuid,p_condition text,p_key uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare loan public.borrow_transactions; cp public.book_copies; result jsonb; fingerprint jsonb; copy_status text;
begin
  perform private.lock_circulation(); perform private.assert_actor(p_actor,true);
  if p_condition not in ('NEW','GOOD','WORN','DAMAGED','LOST') then raise exception 'INVALID_CONDITION'; end if;
  fingerprint := jsonb_build_object('loan_id',p_loan,'condition',p_condition);
  result := private.replay(p_actor,'return',p_key,fingerprint); if result is not null then return result; end if;
  select * into loan from public.borrow_transactions where id=p_loan for update;
  if not found then raise exception 'LOAN_NOT_FOUND'; end if;
  if loan.status<>'ACTIVE' then raise exception 'LOAN_ALREADY_CLOSED'; end if;
  select * into strict cp from public.book_copies where id=loan.copy_id for update;
  copy_status := case p_condition when 'DAMAGED' then 'DAMAGED' when 'LOST' then 'LOST' else 'AVAILABLE' end;
  update public.borrow_transactions set returned_at=clock_timestamp(),returned_by=p_actor,status=case when p_condition='LOST' then 'LOST' else 'RETURNED' end where id=p_loan returning * into loan;
  update public.book_copies set status=copy_status,condition=p_condition where id=cp.id;
  perform private.rebalance(cp.book_id);
  perform private.notify(loan.student_id,'RETURN_CONFIRMED','Loan closed','Your library return has been recorded.',loan.id,'return:'||loan.id);
  perform private.audit(p_actor,'BOOK_RETURNED','loan',loan.id,jsonb_build_object('condition',p_condition,'was_overdue',loan.returned_at>loan.due_at));
  result := to_jsonb(loan);
  insert into public.idempotency_requests values(p_actor,'return',p_key,fingerprint,result,clock_timestamp());
  return result;
end $$;

create function public.reserve_book(p_actor uuid,p_book uuid,p_key uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare hold public.reservations; actor public.profiles; policy public.library_settings; fingerprint jsonb; result jsonb;
begin
  perform private.lock_circulation(); actor := private.assert_actor(p_actor);
  if actor.role<>'STUDENT' then raise exception 'STUDENT_REQUIRED'; end if;
  fingerprint:=jsonb_build_object('book_id',p_book);
  result:=private.replay(p_actor,'reserve',p_key,fingerprint); if result is not null then return result; end if;
  perform private.assert_student(p_actor,false);
  if not exists(select 1 from public.books where id=p_book and archived_at is null) then raise exception 'BOOK_NOT_FOUND'; end if;
  perform private.rebalance(p_book);
  if exists(select 1 from public.reservations where student_id=p_actor and book_id=p_book and status in ('WAITING','READY_FOR_PICKUP')) then raise exception 'RESERVATION_EXISTS'; end if;
  if exists(select 1 from public.book_copies where book_id=p_book and status='AVAILABLE' and retired_at is null) then raise exception 'BOOK_AVAILABLE'; end if;
  select * into strict policy from public.library_settings where id=true;
  if (select count(*) from public.reservations where student_id=p_actor and status in ('WAITING','READY_FOR_PICKUP'))>=policy.max_reservations then raise exception 'RESERVATION_LIMIT_REACHED'; end if;
  insert into public.reservations(student_id,book_id,created_at) values(p_actor,p_book,clock_timestamp()) returning * into hold;
  perform private.audit(p_actor,'RESERVATION_CREATED','reservation',hold.id,jsonb_build_object('book_id',p_book));
  result := to_jsonb(hold);
  insert into public.idempotency_requests values(p_actor,'reserve',p_key,fingerprint,result,clock_timestamp());
  return result;
end $$;

create function public.cancel_reservation(p_actor uuid,p_reservation uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare actor public.profiles; hold public.reservations;
begin
  perform private.lock_circulation(); actor:=private.assert_actor(p_actor);
  select * into hold from public.reservations where id=p_reservation for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if actor.role<>'LIBRARIAN' and hold.student_id<>p_actor then raise exception 'FORBIDDEN'; end if;
  if hold.status='CANCELLED' then return to_jsonb(hold); end if;
  if hold.status not in ('WAITING','READY_FOR_PICKUP') then raise exception 'RESERVATION_CLOSED'; end if;
  update public.reservations set status='CANCELLED',closed_at=clock_timestamp() where id=hold.id returning * into hold;
  if hold.copy_id is not null then update public.book_copies set status='AVAILABLE' where id=hold.copy_id and status='RESERVED'; end if;
  perform private.rebalance(hold.book_id);
  perform private.audit(p_actor,'RESERVATION_CANCELLED','reservation',hold.id);
  return to_jsonb(hold);
end $$;

create function public.run_library_jobs() returns jsonb language plpgsql set search_path = '' as $$
declare book uuid; loan record; hold record; affected integer:=0;
begin
  perform private.lock_circulation();
  for book in select distinct book_id from public.reservations where status in ('WAITING','READY_FOR_PICKUP') limit 500 loop
    perform private.rebalance(book); affected:=affected+1;
  end loop;
  for loan in select bt.*,b.title from public.borrow_transactions bt join public.book_copies cp on cp.id=bt.copy_id join public.books b on b.id=cp.book_id
    where bt.status='ACTIVE' and bt.due_at<=clock_timestamp()+interval '2 days' loop
    if loan.due_at<=clock_timestamp() then
      perform private.notify(loan.student_id,'OVERDUE','A book is overdue',loan.title || ' is overdue. Please return it to the library.',loan.id,'overdue:'||loan.id);
    else
      perform private.notify(loan.student_id,'DUE_SOON','A due date is approaching',loan.title || ' is due within two days.',loan.id,'due:'||loan.id);
    end if;
  end loop;
  for hold in select * from public.reservations where status='READY_FOR_PICKUP' and expires_at>clock_timestamp() and expires_at<=clock_timestamp()+interval '12 hours' loop
    perform private.notify(hold.student_id,'PICKUP_REMINDER','Pickup deadline approaching','Collect your reserved book before the deadline.',hold.id,'pickup-reminder:'||hold.id);
  end loop;
  delete from public.idempotency_requests where created_at<clock_timestamp()-interval '30 days';
  return jsonb_build_object('books_checked',affected);
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active(),private.is_librarian() to authenticated;
grant execute on all functions in schema private to service_role;
revoke execute on function public.borrow_book(uuid,uuid,uuid,uuid),public.return_book(uuid,uuid,text,uuid),public.reserve_book(uuid,uuid,uuid),public.cancel_reservation(uuid,uuid),public.run_library_jobs() from public,anon,authenticated;
grant execute on function public.borrow_book(uuid,uuid,uuid,uuid),public.return_book(uuid,uuid,text,uuid),public.reserve_book(uuid,uuid,uuid),public.cancel_reservation(uuid,uuid),public.run_library_jobs() to service_role;
commit;


-- 202611250003_management.sql
begin;
create function public.save_book(p_actor uuid,p_id uuid,p_data jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare book public.books; author uuid; i integer:=0; quantity integer;
begin
  perform private.lock_circulation(); perform private.assert_actor(p_actor,true);
  if jsonb_array_length(p_data->'author_ids')<1 then raise exception 'AUTHOR_REQUIRED'; end if;
  if p_id is null then
    insert into public.books(title,isbn,category_id,publisher_id,publication_year,description)
    values(p_data->>'title',nullif(p_data->>'isbn',''),(p_data->>'category_id')::uuid,nullif(p_data->>'publisher_id','')::uuid,(p_data->>'publication_year')::integer,coalesce(p_data->>'description','')) returning * into book;
  else
    update public.books set title=p_data->>'title',isbn=nullif(p_data->>'isbn',''),category_id=(p_data->>'category_id')::uuid,
      publisher_id=nullif(p_data->>'publisher_id','')::uuid,publication_year=(p_data->>'publication_year')::integer,description=coalesce(p_data->>'description','')
      where id=p_id returning * into book;
    if not found then raise exception 'BOOK_NOT_FOUND'; end if;
    delete from public.book_authors where book_id=p_id;
  end if;
  for author in select jsonb_array_elements_text(p_data->'author_ids')::uuid loop
    insert into public.book_authors(book_id,author_id,author_order) values(book.id,author,i); i:=i+1;
  end loop;
  quantity:=coalesce((p_data->>'initial_copies')::integer,0);
  if quantity<0 or quantity>100 or (p_id is not null and quantity<>0) then raise exception 'INVALID_COPY_COUNT'; end if;
  for i in 1..quantity loop
    insert into public.book_copies(book_id,barcode) values(book.id,'ARC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)));
  end loop;
  perform private.audit(p_actor,case when p_id is null then 'BOOK_CREATED' else 'BOOK_UPDATED' end,'book',book.id,jsonb_build_object('title',book.title));
  return to_jsonb(book);
end $$;

create function public.archive_book(p_actor uuid,p_id uuid,p_archive boolean default true)
returns jsonb language plpgsql set search_path = '' as $$
declare book public.books;
begin
  perform private.lock_circulation(); perform private.assert_actor(p_actor,true);
  if p_archive and (exists(select 1 from public.reservations where book_id=p_id and status in ('WAITING','READY_FOR_PICKUP')) or exists(select 1 from public.borrow_transactions bt join public.book_copies cp on cp.id=bt.copy_id where cp.book_id=p_id and bt.status='ACTIVE')) then raise exception 'BOOK_HAS_ACTIVITY'; end if;
  update public.books set archived_at=case when p_archive then clock_timestamp() end where id=p_id returning * into book;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  perform private.audit(p_actor,case when p_archive then 'BOOK_ARCHIVED' else 'BOOK_RESTORED' end,'book',p_id);
  return to_jsonb(book);
end $$;

create function public.set_book_cover(p_actor uuid,p_id uuid,p_path text)
returns jsonb language plpgsql set search_path = '' as $$
declare book public.books;
begin
  perform private.assert_actor(p_actor,true);
  if p_path is not null and (p_path not like p_id::text || '/%' or char_length(p_path)>200) then raise exception 'INVALID_COVER_PATH'; end if;
  update public.books set cover_path=p_path where id=p_id returning * into book;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  perform private.audit(p_actor,'BOOK_COVER_UPDATED','book',p_id);
  return to_jsonb(book);
end $$;

create function public.manage_copy(p_actor uuid,p_book uuid,p_id uuid,p_data jsonb,p_retire boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare cp public.book_copies; new_status text; new_condition text; book uuid;
begin
  perform private.lock_circulation(); perform private.assert_actor(p_actor,true);
  if p_id is null then
    if not exists(select 1 from public.books where id=p_book and archived_at is null) then raise exception 'BOOK_NOT_FOUND'; end if;
    new_status:=coalesce(p_data->>'status','AVAILABLE');
    if new_status not in ('AVAILABLE','DAMAGED','LOST','MAINTENANCE') then raise exception 'INVALID_COPY_STATUS'; end if;
    new_condition:=case new_status when 'DAMAGED' then 'DAMAGED' when 'LOST' then 'LOST' else coalesce(p_data->>'condition','GOOD') end;
    if new_status='AVAILABLE' and new_condition in ('DAMAGED','LOST') then raise exception 'INVALID_COPY_STATUS'; end if;
    insert into public.book_copies(book_id,barcode,status,condition,notes)
      values(p_book,coalesce(nullif(p_data->>'barcode',''),'ARC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),new_status,new_condition,coalesce(p_data->>'notes','')) returning * into cp;
  else
    select * into cp from public.book_copies where id=p_id and retired_at is null for update;
    if not found then raise exception 'COPY_NOT_FOUND'; end if;
    if cp.status in ('BORROWED','RESERVED') then raise exception 'COPY_IN_USE'; end if;
    new_status:=coalesce(p_data->>'status',cp.status);
    if new_status not in ('AVAILABLE','DAMAGED','LOST','MAINTENANCE') then raise exception 'INVALID_COPY_STATUS'; end if;
    new_condition:=case new_status when 'DAMAGED' then 'DAMAGED' when 'LOST' then 'LOST' else coalesce(p_data->>'condition',cp.condition) end;
    if new_status='AVAILABLE' and new_condition in ('DAMAGED','LOST') then raise exception 'INVALID_COPY_STATUS'; end if;
    update public.book_copies set barcode=coalesce(p_data->>'barcode',barcode),status=new_status,
      condition=new_condition,notes=coalesce(p_data->>'notes',notes),retired_at=case when p_retire then clock_timestamp() end where id=cp.id returning * into cp;
  end if;
  perform private.rebalance(cp.book_id);
  perform private.audit(p_actor,case when p_retire then 'COPY_RETIRED' when p_id is null then 'COPY_CREATED' else 'COPY_UPDATED' end,'copy',cp.id,to_jsonb(cp));
  return to_jsonb(cp);
end $$;

create function public.manage_reference(p_actor uuid,p_entity text,p_id uuid,p_name text,p_delete boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb; table_name text;
begin
  perform private.assert_actor(p_actor,true);
  if p_entity not in ('categories','authors','publishers') then raise exception 'INVALID_ENTITY'; end if;
  if not p_delete and (char_length(trim(p_name))<1 or char_length(p_name)>100) then raise exception 'INVALID_NAME'; end if;
  -- Identifiers are allowlisted above, values are always bound parameters.
  if p_delete then
    execute format('delete from public.%I where id=$1 returning to_jsonb(%I.*)',p_entity,p_entity) into result using p_id;
  elsif p_id is null then
    execute format('insert into public.%I(name) values($1) returning to_jsonb(%I.*)',p_entity,p_entity) into result using trim(p_name);
  else
    execute format('update public.%I set name=$1 where id=$2 returning to_jsonb(%I.*)',p_entity,p_entity) into result using trim(p_name),p_id;
  end if;
  if result is null then raise exception 'RECORD_NOT_FOUND'; end if;
  perform private.audit(p_actor,case when p_delete then 'REFERENCE_DELETED' else 'REFERENCE_SAVED' end,p_entity,(result->>'id')::uuid,result);
  return result;
end $$;

create function public.save_student(p_actor uuid,p_id uuid,p_data jsonb,p_create boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb; hold record;
begin
  perform private.lock_circulation(); perform private.assert_actor(p_actor,true);
  if p_create then
    insert into public.profiles(id,full_name,role,status) values(p_id,p_data->>'full_name','STUDENT','ACTIVE');
    insert into public.student_profiles(id,student_number,program,year_level)
      values(p_id,p_data->>'student_number',coalesce(p_data->>'program',''),(p_data->>'year_level')::integer);
  else
    if not exists(select 1 from public.student_profiles where id=p_id) then raise exception 'STUDENT_NOT_FOUND'; end if;
    update public.profiles set full_name=coalesce(p_data->>'full_name',full_name),status=coalesce(p_data->>'status',status) where id=p_id and role='STUDENT';
    update public.student_profiles set student_number=coalesce(p_data->>'student_number',student_number),program=coalesce(p_data->>'program',program),
      year_level=case when p_data ? 'year_level' then (p_data->>'year_level')::integer else year_level end,
      borrowing_restricted=coalesce((p_data->>'borrowing_restricted')::boolean,borrowing_restricted) where id=p_id;
    if exists(select 1 from public.profiles p join public.student_profiles s on s.id=p.id where p.id=p_id and (p.status='INACTIVE' or s.borrowing_restricted)) then
      for hold in select id from public.reservations where student_id=p_id and status in ('WAITING','READY_FOR_PICKUP') loop
        perform public.cancel_reservation(p_actor,hold.id);
      end loop;
    end if;
  end if;
  select to_jsonb(p)||to_jsonb(s) into result from public.profiles p join public.student_profiles s on s.id=p.id where p.id=p_id;
  perform private.audit(p_actor,case when p_create then 'STUDENT_REGISTERED' else 'STUDENT_UPDATED' end,'student',p_id,result);
  return result;
end $$;

create function public.update_own_profile(p_actor uuid,p_name text)
returns jsonb language plpgsql set search_path = '' as $$
declare profile public.profiles;
begin
  perform private.assert_actor(p_actor);
  update public.profiles set full_name=p_name where id=p_actor returning * into profile;
  perform private.audit(p_actor,'PROFILE_UPDATED','profile',p_actor,jsonb_build_object('full_name',p_name));
  return to_jsonb(profile);
end $$;

create function public.update_settings(p_actor uuid,p_data jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare policy public.library_settings;
begin
  perform private.lock_circulation(); perform private.assert_actor(p_actor,true);
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  update public.library_settings set max_books=(p_data->>'max_books')::integer,loan_days=(p_data->>'loan_days')::integer,
    max_reservations=(p_data->>'max_reservations')::integer,collection_hours=(p_data->>'collection_hours')::integer,
    restrict_overdue=(p_data->>'restrict_overdue')::boolean,timezone=p_data->>'timezone',updated_by=p_actor,updated_at=clock_timestamp()
    where id=true returning * into policy;
  perform private.audit(p_actor,'POLICY_UPDATED','settings',null,to_jsonb(policy));
  return to_jsonb(policy);
end $$;

create function public.read_notifications(p_actor uuid,p_id uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare affected integer;
begin
  perform private.assert_actor(p_actor);
  update public.notifications set read_at=coalesce(read_at,clock_timestamp()) where user_id=p_actor and (p_id is null or id=p_id);
  get diagnostics affected=row_count;
  if p_id is not null and affected=0 then raise exception 'RECORD_NOT_FOUND'; end if;
  return jsonb_build_object('updated',affected);
end $$;

create function public.library_report(p_actor uuid) returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_actor(p_actor,true);
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'students',(select count(*) from public.student_profiles),
      'books',(select count(*) from public.books where archived_at is null),
      'copies',(select count(*) from public.book_copies where retired_at is null),
      'available',(select count(*) from public.book_copies cp join public.books b on b.id=cp.book_id where cp.retired_at is null and cp.status='AVAILABLE' and b.archived_at is null),
      'borrowed',(select count(*) from public.borrow_transactions where status='ACTIVE'),
      'reservations',(select count(*) from public.reservations where status in ('WAITING','READY_FOR_PICKUP')),
      'overdue',(select count(*) from public.borrow_transactions where status='ACTIVE' and due_at<=clock_timestamp()),
      'returned',(select count(*) from public.borrow_transactions where status='RETURNED'),
      'damaged',(select count(*) from public.book_copies where status='DAMAGED' and retired_at is null),
      'lost',(select count(*) from public.book_copies where status='LOST' and retired_at is null)),
    'monthly',coalesce((select jsonb_agg(to_jsonb(m) order by m.month) from (
      select to_char(month,'YYYY-MM') as month,
        (select count(*) from public.borrow_transactions where borrowed_at>=month and borrowed_at<month+interval '1 month') as borrowed,
        (select count(*) from public.borrow_transactions where status='RETURNED' and returned_at>=month and returned_at<month+interval '1 month') as returned
      from generate_series(date_trunc('month',now())-interval '11 months',date_trunc('month',now()),interval '1 month') month
    ) m),'[]'::jsonb),
    'popular_books',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select b.id,b.title,count(bt.id)::integer as count from public.books b join public.book_copies cp on cp.book_id=b.id join public.borrow_transactions bt on bt.copy_id=cp.id
      group by b.id,b.title order by count(bt.id) desc,b.title limit 10
    ) x),'[]'::jsonb),
    'active_borrowers',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.id,p.full_name,s.student_number,count(bt.id)::integer as count from public.profiles p join public.student_profiles s on s.id=p.id join public.borrow_transactions bt on bt.student_id=p.id
      group by p.id,p.full_name,s.student_number order by count(bt.id) desc,p.full_name limit 10
    ) x),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.id,c.name,count(bt.id)::integer as count from public.categories c left join public.books b on b.category_id=c.id left join public.book_copies cp on cp.book_id=b.id left join public.borrow_transactions bt on bt.copy_id=cp.id
      group by c.id,c.name order by count(bt.id) desc,c.name
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Explicit ACLs prevent calling backend mutations with a browser JWT.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('save_book','archive_book','set_book_cover','manage_copy','manage_reference','save_student','update_own_profile','update_settings','read_notifications','library_report') loop
    execute format('revoke execute on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
commit;


-- 202611250004_bootstrap.sql
begin;
create function public.bootstrap_first_librarian(p_id uuid,p_name text,p_staff text)
returns jsonb language plpgsql set search_path = '' as $$
declare profile public.profiles;
begin
  perform private.lock_circulation();
  if exists(select 1 from public.librarian_profiles) then raise exception 'LIBRARIAN_ALREADY_EXISTS'; end if;
  insert into public.profiles(id,full_name,role) values(p_id,p_name,'LIBRARIAN') returning * into profile;
  insert into public.librarian_profiles(id,staff_number) values(p_id,p_staff);
  perform private.audit(p_id,'FIRST_LIBRARIAN_CREATED','profile',p_id);
  return to_jsonb(profile);
end $$;
revoke execute on function public.bootstrap_first_librarian(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_first_librarian(uuid,text,text) to service_role;
commit;


-- 202611260005_catalog_search.sql
begin;
-- Values arrive as bound RPC parameters. Punctuation and wildcard characters in
-- a title/author are literal search text, never PostgREST filter syntax.
create function public.search_catalog(p_actor uuid,p_query jsonb default '{}')
returns jsonb language plpgsql set search_path = '' as $$
declare actor public.profiles; result jsonb; term text; isbn_term text;
  page_number integer; page_size integer; sort_by text; archived boolean;
begin
  actor:=private.assert_actor(p_actor);
  term:=lower(left(trim(coalesce(p_query->>'q','')),160));
  isbn_term:=replace(replace(term,'-',''),' ','');
  page_number:=greatest(1,least(100000,coalesce((p_query->>'page')::integer,1)));
  page_size:=greatest(1,least(100,coalesce((p_query->>'page_size')::integer,12)));
  sort_by:=coalesce(p_query->>'sort','title');
  archived:=coalesce((p_query->>'archived')::boolean,false);
  if archived and actor.role<>'LIBRARIAN' then raise exception 'FORBIDDEN'; end if;
  with filtered as (
    select * from public.catalog c where
      ((archived and c.archived_at is not null) or (not archived and c.archived_at is null))
      and (term='' or strpos(lower(c.title),term)>0 or strpos(lower(c.author_names),term)>0 or (isbn_term<>'' and strpos(lower(coalesce(c.isbn,'')),isbn_term)>0))
      and (nullif(p_query->>'category_id','') is null or c.category_id=(p_query->>'category_id')::uuid)
      and (coalesce(p_query->>'availability','')<>'available' or c.available_copies>0)
      and (coalesce(p_query->>'availability','')<>'unavailable' or c.available_copies=0)
      and (nullif(p_query->>'year_from','') is null or c.publication_year>=(p_query->>'year_from')::integer)
      and (nullif(p_query->>'year_to','') is null or c.publication_year<=(p_query->>'year_to')::integer)
  ), ordered as (
    select c.*,row_number() over(order by
      case when sort_by='newest' then c.created_at end desc,
      case when sort_by='year' then c.publication_year end desc nulls last,
      case when sort_by='popular' then c.borrow_count end desc,
      lower(c.title),c.id) as sort_position
    from filtered c
  ), paged as (
    select * from ordered order by sort_position
    limit page_size offset ((page_number-1)*page_size)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)-'sort_position' order by sort_position) from paged),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',page_number,'page_size',page_size) into result;
  return result;
end $$;
revoke execute on function public.search_catalog(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.search_catalog(uuid,jsonb) to service_role;
commit;


-- 202611260006_fair_jobs.sql
begin;
-- A durable, backend-only cursor makes bounded reservation batches fair even
-- when earlier waiting lists cannot currently progress.
create table private.job_state (
  name text primary key,
  last_book_id uuid
);
insert into private.job_state(name) values('reservation_rebalance');
revoke all on private.job_state from public,anon,authenticated;
grant select,update on private.job_state to service_role;

create or replace function public.run_library_jobs() returns jsonb language plpgsql set search_path = '' as $$
declare book uuid; book_ids uuid[]; cursor_book uuid; loan record; hold record; affected integer:=0;
begin
  perform private.lock_circulation();
  select last_book_id into cursor_book from private.job_state where name='reservation_rebalance' for update;
  select array_agg(batch.book_id order by batch.book_id) into book_ids from (
    select distinct book_id from public.reservations
    where status in ('WAITING','READY_FOR_PICKUP') and (cursor_book is null or book_id>cursor_book)
    order by book_id limit 500
  ) batch;
  if book_ids is null and cursor_book is not null then
    select array_agg(batch.book_id order by batch.book_id) into book_ids from (
      select distinct book_id from public.reservations where status in ('WAITING','READY_FOR_PICKUP')
      order by book_id limit 500
    ) batch;
  end if;
  foreach book in array coalesce(book_ids,array[]::uuid[]) loop
    perform private.rebalance(book); affected:=affected+1;
  end loop;
  update private.job_state set last_book_id=book_ids[array_length(book_ids,1)] where name='reservation_rebalance';
  for loan in select bt.*,b.title from public.borrow_transactions bt
    join public.book_copies cp on cp.id=bt.copy_id join public.books b on b.id=cp.book_id
    where bt.status='ACTIVE' and bt.due_at<=clock_timestamp()+interval '2 days'
      and not exists(select 1 from public.notifications n where n.deduplication_key=(case when bt.due_at<=clock_timestamp() then 'overdue:' else 'due:' end)||bt.id)
    order by bt.due_at,bt.id limit 500 loop
    if loan.due_at<=clock_timestamp() then
      perform private.notify(loan.student_id,'OVERDUE','A book is overdue',loan.title || ' is overdue. Please return it to the library.',loan.id,'overdue:'||loan.id);
    else
      perform private.notify(loan.student_id,'DUE_SOON','A due date is approaching',loan.title || ' is due within two days.',loan.id,'due:'||loan.id);
    end if;
  end loop;
  for hold in select r.* from public.reservations r where r.status='READY_FOR_PICKUP'
    and r.expires_at>clock_timestamp() and r.expires_at<=clock_timestamp()+interval '12 hours'
    and not exists(select 1 from public.notifications n where n.deduplication_key='pickup-reminder:'||r.id)
    order by r.expires_at,r.id limit 500 loop
    perform private.notify(hold.student_id,'PICKUP_REMINDER','Pickup deadline approaching','Collect your reserved book before the deadline.',hold.id,'pickup-reminder:'||hold.id);
  end loop;
  delete from public.idempotency_requests where created_at<clock_timestamp()-interval '30 days';
  return jsonb_build_object('books_checked',affected);
end $$;
revoke execute on function public.run_library_jobs() from public,anon,authenticated;
grant execute on function public.run_library_jobs() to service_role;
commit;
