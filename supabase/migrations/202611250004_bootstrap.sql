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
