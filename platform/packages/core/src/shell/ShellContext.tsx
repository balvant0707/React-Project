import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react';
import type { ConfigurationCard, HeaderItem, PhoneTab, ProfileSection, RecordSlotItem } from '../module';

/** What the app shell (header, sider) needs from the app and its modules. */
export interface BannerImage { src: string; position?: string; size?: string }

export interface ShellConfig {
  appName: string;
  /** Logo and name for the sign-in and password pages. */
  brand: ReactNode;
  banner: {
    /** CSS gradient over the photo, e.g. 'linear-gradient(90deg, #0F9ED5 0%, #4560DC 50%, transparent 100%)'. */
    gradient: string;
    defaultImage?: BannerImage;
    /** Photo per resource name. */
    images?: Record<string, BannerImage>;
  };
  /** Title of the sider and the phone header: full (logo + name) and collapsed (icon only). */
  title: { expanded: ReactNode; collapsed: ReactNode };
  headerItems: HeaderItem[];
  phoneTabs: PhoneTab[];
  profileSections: ProfileSection[];
  configurationCards: ConfigurationCard[];
  headerSearch?: ReactNode;
  recordSlots: RecordSlotItem[];
  contentAsides: ComponentType[];
}

const ShellContext = createContext<ShellConfig>({ appName: '', brand: null, banner: { gradient: 'none' }, title: { expanded: null, collapsed: null }, headerItems: [], phoneTabs: [], profileSections: [], configurationCards: [], recordSlots: [], contentAsides: [] });
export const ShellProvider = ShellContext.Provider;
export const useShell = () => useContext(ShellContext);

/** The contributions to one slot, sorted by `order` (see RecordSlotItem). */
export const useRecordSlot = (slot: string): RecordSlotItem[] => {
  const { recordSlots } = useShell();
  // Stable between renders: pages use the result as an effect dependency (vessel timeline).
  return useMemo(() => recordSlots.filter((s) => s.slot === slot).sort((a, b) => a.order - b.order), [recordSlots, slot]);
};

/** Renders every `Component` contributed to a slot with the given props, in order. */
export const RecordSlot = ({ slot, ...props }: { slot: string } & Record<string, unknown>) => (
  <>{useRecordSlot(slot).map((s) => (s.Component ? <s.Component key={s.key} {...props} /> : null))}</>
);
