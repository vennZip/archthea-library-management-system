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
