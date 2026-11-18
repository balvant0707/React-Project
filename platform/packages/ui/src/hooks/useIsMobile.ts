import { Grid } from "antd";
import { useSyncExternalStore } from "react";

// The one definition of "phone": below antd's `md` breakpoint (768px); re-renders on resize.
export function useIsMobile() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}

// antd `xl` (1200 px and up). Read synchronously (Grid.useBreakpoint reports {} on the first render).
export const useIsWide = () => useSyncExternalStore(
  (onChange) => { const m = window.matchMedia('(min-width: 1200px)'); m.addEventListener('change', onChange); return () => m.removeEventListener('change', onChange); },
  () => window.matchMedia('(min-width: 1200px)').matches,
  () => false,
);
