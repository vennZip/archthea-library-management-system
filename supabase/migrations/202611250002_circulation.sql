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
