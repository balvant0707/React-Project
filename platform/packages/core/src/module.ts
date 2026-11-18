import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ListRpc } from './refine/dataProvider';

/** A route a module contributes. The core translates it for the router. */
export interface ModuleRoute {
  path: string;
  element: ReactNode;
  /** Default: inside the app shell. 'print': signed in, no shell; 'public': no sign-in, no shell (QR report form). */
  layout?: 'print' | 'public';
}

/** A sidebar entry / list resource a module contributes. */
export interface ModuleResource {
  name: string;
  list?: string;
  show?: string;
  edit?: string;
  create?: string;
  label: string;
  icon?: ReactNode;
  /** Title in the page banner when it differs from the menu label (e.g. menu 'World Fleet', page 'Fleet'). */
  title?: string;
  /** Permission literal that gates the menu entry, e.g. 'tasks.view.all'. No literal = open. */
  permission?: string;
  /** An administration page: the Admin always, anybody else only with the delegated literal in `permission`. */
  admin?: boolean;
  /** Name of the resource this entry hangs under in the menu (e.g. 'admin'). */
  parent?: string;
  /** Menu target when it is not `list` (NPM World Fleet: the vessels list with preset filters). */
  menuLink?: string;
  /** Position among the top-level menu entries of all modules; lower first, default 0, ties keep the module order. */
  menuOrder?: number;
  /** Hidden resources drive breadcrumbs and access control but never appear in the menu. */
  hidden?: boolean;
}

/** An element a module puts into the app header (bell, help button, notes button ...). */
export interface HeaderItem {
  key: string;
  /** Left to right; lower first. */
  order: number;
  element: ReactNode;
  /** Shown in the phone header too (default: desktop only; the phone has the bottom tabs). */
  phone?: boolean;
}

/** A tab in the phone's bottom bar (between Home and More); the page it leads to is a route of the module. */
export interface PhoneTab {
  key: string;
  /** Left to right; lower first. */
  order: number;
  to: string;
  /** i18n key (or plain text) of the label. */
  label: string;
  icon: (props: { size: number; stroke: number; color: string }) => ReactNode;
}

/** A card on the Configuration page that leads to a configuration page of the module (a route of the module). */
export interface ConfigurationCard {
  key: string;
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
}

/** A card a module adds to the profile page (notification switches, reminders, push ...). */
export interface ProfileSection {
  key: string;
  /** Top to bottom; lower first. */
  order: number;
  Component: ComponentType<{ userId: string }>;
}

/**
 * A contribution to a named slot on a lower module's page (docs/module-dependencies.md rule 6). The slot's owner defines the
 * props of `Component` (e.g. 'vessels.tabs': `{ vesselId }`) and the shape of a non-visual `value` (a loader, a column ...).
 */
export interface RecordSlotItem {
  slot: string;
  key: string;
  /** Left to right / top to bottom; lower first. */
  order: number;
  label?: string;
  Component?: ComponentType<any>;
  value?: unknown;
}

/**
 * What a kind of record is called and what its page offers: the notes panel and the list helpers read it
 * through `getEntityType(key)`; a module also uses its own entries for page titles and menu labels. `key` is the entity type
 * the database knows (conversations.anchor_type, activity_events.entity_type).
 */
export interface EntityTypeConfig {
  /** Singular display name ("New {label}", page titles). */
  label: string;
  /** Plural display name (list titles, menu). */
  pluralLabel: string;
  /** List page route, or null when there is none. */
  listPath: string | null;
  /** Does the record's detail page support the notes panel? */
  notes: boolean;
  /** Does the record's detail page get an Attachments card? */
  attachments: boolean;
}

/** The manifest every module exports; the core translates it for Refine. New hooks: docs/architecture.md section 3. */
export interface ModuleManifest {
  key: string;
  requires?: string[];
  /** Load after these modules when they are part of the app; never fails when they are not (docs/module-dependencies.md). */
  optionalRequires?: string[];
  resources?: ModuleResource[];
  routes?: ModuleRoute[];
  permissions?: string[];
  /** Cards on the Admin > Configuration page. */
  configurationCards?: ConfigurationCard[];
  /** Elements in the app header, right of the search. */
  headerItems?: HeaderItem[];
  /** Replaces the platform's global search box in the header (rare). */
  headerSearch?: ReactNode;
  phoneTabs?: PhoneTab[];
  profileSections?: ProfileSection[];
  /** List resources (views) read through an rpc while certain filters are set; see refine/dataProvider.ts. */
  listRpcs?: Record<string, ListRpc>;
  /** A panel beside the page content on every page (NPM notes panel); it decides itself when to show. */
  contentAside?: ComponentType;
  /** Contributions to slots on pages of the modules this one requires. */
  recordSlots?: RecordSlotItem[];
  /** The record types this module owns, by entity type key (see EntityTypeConfig). */
  entityTypes?: Record<string, EntityTypeConfig>;
  /** Context providers wrapped around every route (inside the router and Refine), e.g. the NPM notes panel state. */
  providers?: ComponentType<PropsWithChildren>[];
}

export const defineModule = (manifest: ModuleManifest): ModuleManifest => manifest;
