-- Adding a file to a dock report needs edit, as in the NPM tool (platform 20261113140000).
update public.entity_types set attach_action = 'edit' where entity_type = 'dock_reports';
