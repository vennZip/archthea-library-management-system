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
