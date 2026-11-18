-- Auth-schema triggers, role settings and realtime publication, copied from the COMPASS database.
CREATE TRIGGER auth_users_login_email_guard BEFORE UPDATE OF email ON auth.users FOR EACH ROW WHEN (((new.email)::text IS DISTINCT FROM (old.email)::text)) EXECUTE FUNCTION public.auth_users_login_email_guard();
CREATE TRIGGER discard_recovery_token_for_sso_accounts BEFORE INSERT OR UPDATE ON auth.one_time_tokens FOR EACH ROW WHEN ((new.token_type = 'recovery_token'::auth.one_time_token_type)) EXECUTE FUNCTION public.discard_recovery_token_for_sso_accounts();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_user();
CREATE TRIGGER reject_password_for_sso_user BEFORE UPDATE OF encrypted_password ON auth.users FOR EACH ROW WHEN ((((new.encrypted_password)::text IS DISTINCT FROM (old.encrypted_password)::text) AND ((COALESCE(new.encrypted_password, ''::character varying))::text <> ''::text))) EXECUTE FUNCTION public.reject_password_for_sso_user();
CREATE TRIGGER require_sso_for_azure_identity BEFORE INSERT ON auth.identities FOR EACH ROW WHEN ((new.provider = 'azure'::text)) EXECUTE FUNCTION public.require_sso_for_azure_identity();
alter role authenticator set pgrst.db_pre_request = 'public.api_pre_request';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';
alter role authenticated set statement_timeout = '8s';
alter role anon set statement_timeout = '3s';
