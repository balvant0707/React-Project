-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): the module's rule
-- <type>_row_allows(action, id, ctx) is the registered function; the wrappers <type>_access (by user) and <type>_ctx_allows
-- (by context) go. The rule is private: row policies and policy helpers ask the guarded dispatcher can_access_entity_ctx(),
-- which answers only for the caller's own context.

update public.entity_types set access_function = 'companies_row_allows' where entity_type = 'companies';
drop function public.companies_access(uuid, uuid, text);
select public.entity_types_rebuild();
