import { lazy, Suspense, type ComponentType } from 'react';
import { DashboardOutlined } from '@ant-design/icons';
import { defineModule } from '@rbp/core';

// NPM dashboard (RADAR's start page, replaces the platform's home module in apps/npm): greeting banner and self-loading
// widgets over specifications, hull events, companies and vessels. Ported 1:1.
const Dashboard = lazy(async () => ({ default: (await import('./pages/dashboard/index')).Dashboard as ComponentType }));

export default defineModule({
  key: 'npm-dashboard',
  requires: ['companies', 'products', 'fleet', 'offers', 'tasks'],
  resources: [{ name: 'dashboard', list: '/', label: 'Dashboard', icon: <DashboardOutlined />, menuOrder: -100 }],
  routes: [{ path: '/', element: <Suspense fallback={null}><Dashboard /></Suspense> }],
});
