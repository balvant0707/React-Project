import { setAppLanguages, startApp } from '@rbp/core/gate';
import { themes } from './theme';
import { brand } from './brand';

// English only while the NPM modules are (plan T10): no language switch.
setAppLanguages(['en']);

startApp({ appName: 'RADAR', themes, brand, loadApp: () => import('./app') });
