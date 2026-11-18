// The app itself: the module code and the shell. Loaded by main.tsx once the visitor may have it (behind the code gate: after
// sign-in), so nothing of the modules is in the public entry.
import { RefineRoot } from '@rbp/core';
import { CI_RED, setActionColor } from '@rbp/ui';
import { modules } from './modules';
import { themes } from './theme';
import { brand, shellTitle, banner } from './brand';

// COMPASS's main "new" button (round + on a phone) in the CI red, as in the COMPASS app.
setActionColor(CI_RED);

export default function App() {
  return <RefineRoot appName="COMPASS" modules={modules} themes={themes} brand={brand} shellTitle={shellTitle} banner={banner} />;
}
