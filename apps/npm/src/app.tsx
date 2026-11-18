// The app itself: the module code and the shell. Loaded by main.tsx once the visitor may have it (behind the code gate: after
// sign-in), so nothing of the modules is in the public entry.
import { RefineRoot } from '@rbp/core';
import { modules } from './modules';
import { themes } from './theme';
import { brand, shellTitle, banner } from './brand';

export default function App() {
  return <RefineRoot appName="RADAR" modules={modules} themes={themes} brand={brand} shellTitle={shellTitle} banner={banner} />;
}
