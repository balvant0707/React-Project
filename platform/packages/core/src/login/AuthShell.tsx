// Copied from COMPASS pages/login/authShell.tsx. Change: the brand (logo + name) is passed in by the app.
import type { ReactNode } from 'react';
import { Card } from 'antd';
import { LanguageSwitch } from './LanguageSwitch';

// Frame of the pages before sign-in (login, forgot password, activation): logo, language, one card.
export const AuthShell = ({ brand, children }: { brand: ReactNode; children: ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 16 }}>
    <Card style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ textAlign: 'right', marginBottom: 8 }}>
        <LanguageSwitch />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>{brand}</div>
      {children}
    </Card>
  </div>
);
