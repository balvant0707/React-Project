import { resolveModules, type ModuleManifest } from '@rbp/core';
import messaging from '@rbp/module-messaging';
import companies from '@rbp/module-companies';
import products from '@rbp/module-products';
import fleet from '@rbp/module-fleet';
import offers from '@rbp/module-offers';
import npmDashboard from '@rbp/module-npm-dashboard';
import dockReports from '@rbp/module-dock-reports';
import npmEmail from '@rbp/module-npm-email';
import tasks from '@rbp/module-tasks';

// Chosen at build time. Keep in sync with app.config.json (tools/compose.mjs --check enforces it).
export const modules: ModuleManifest[] = resolveModules([messaging, companies, products, fleet, offers, npmDashboard, dockReports, npmEmail, tasks]);
