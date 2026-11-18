// Copied from COMPASS components/header.tsx (LanguageSwitch). Only imports changed.
import { Segmented } from 'antd';
import { useGetIdentity } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { currentLanguage, getAppLanguages, type Language } from '../i18n';
import { supabaseClient } from '../supabase';

export const LanguageSwitch = () => {
  const { i18n } = useTranslation();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const languages = getAppLanguages();
  if (languages.length < 2) return null;
  return (
    <Segmented<Language>
      size="small"
      value={currentLanguage()}
      options={languages.map((l) => ({ value: l, label: l.toUpperCase() }))}
      onChange={(language) => {
        i18n.changeLanguage(language);
        // Remember the choice per user (the browser keeps it for the login screen).
        if (identity?.id) {
          void supabaseClient.from('users').update({ language }).eq('id', identity.id);
        }
      }}
    />
  );
};
