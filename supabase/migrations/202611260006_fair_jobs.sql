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
