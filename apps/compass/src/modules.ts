import { resolveModules, type ModuleManifest } from '@rbp/core';
import messaging from '@rbp/module-messaging';
import tasks from '@rbp/module-tasks';
import taskFamily from '@rbp/module-task-family';
import workflows from '@rbp/module-workflows';
import assets from '@rbp/module-assets';
import tickets from '@rbp/module-tickets';
import items from '@rbp/module-items';
import people from '@rbp/module-people';
import leave from '@rbp/module-leave';
import home from '@rbp/module-home';
import help from '@rbp/module-help';

// Chosen at build time. Keep in sync with app.config.json (tools/compose.mjs --check enforces it).
export const modules: ModuleManifest[] = resolveModules([messaging, tasks, taskFamily, workflows, assets, tickets, items, people, leave, home, help]);
