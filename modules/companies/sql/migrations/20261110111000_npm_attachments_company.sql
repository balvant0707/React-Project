-- NPM attachments can name the company a document belongs to (NPM attachments.company_id, set in the attachments panel).
-- The platform attachments table is the COMPASS one; the column belongs to the companies module (decision D1 of the
-- attachments inventory), so it is added here.
alter table public.attachments add column company_id uuid references public.companies(id) on delete set null;
create index attachments_company_id_idx on public.attachments (company_id) where company_id is not null;
