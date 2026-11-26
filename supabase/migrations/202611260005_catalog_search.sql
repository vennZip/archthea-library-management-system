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
