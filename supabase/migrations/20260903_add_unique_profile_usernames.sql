do $$
begin
	if not exists (
		select 1
		from pg_indexes
		where schemaname = 'public'
			and tablename = 'profiles'
			and indexdef ilike '%unique%'
			and indexdef ilike '%username%'
	) then
		create unique index profiles_username_unique_idx
		on public.profiles (lower(username))
		where username is not null;
	end if;
end
$$;
