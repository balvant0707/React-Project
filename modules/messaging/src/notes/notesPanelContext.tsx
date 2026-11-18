// Moved from npm-base into messaging on 2026-11-13; from the NPM tool (app/src/contexts/notesPanel.tsx). Hand-owned now.
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { useIsMobile } from "@rbp/ui";
import { requireEntityType } from "@rbp/core";

type PageKind = "list" | "detail";

const STORAGE_KEY = "npmtool_notes_open";
const readFlags = (): { list: boolean; detail: boolean } => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { list: parsed.list === true, detail: parsed.detail === true };
  } catch {
    return { list: false, detail: false };
  }
};

// `label` (list row peeks only) names the record in the panel header.
type NotesEntity = { type: string; id: string; label?: string } | null;

type NotesPanelContextValue = {
  entity: NotesEntity;
  setEntity: (entity: NotesEntity) => void;
  // Whichever entity should actually be displayed right now - a list row's
  // notes if one was just clicked open (see openEntity/isListOverride),
  // else the current page's own entity.
  effectiveEntity: NotesEntity;
  // True when effectiveEntity came from a list-row click rather than the
  // page's own subject - a "peek" at some other record's thread, not what
  // this page itself is. Drives components/notesPanel.tsx's choice
  // between a mobile modal (list peek) and the permanent inline panel (the
  // page's own notes) - see that component for why the two need
  // different mobile treatment.
  isListOverride: boolean;
  open: boolean;
  // "list" while a list page is mounted (see useListNotes), else "detail". The header Notes button
  // flips the flag of the current kind only, so notes switched on in a list don't also open on every
  // record you visit, and vice versa.
  pageKind: PageKind;
  setPageKind: (kind: PageKind) => void;
  // List mode on: a list's row click selects the row (notes in the panel) instead of navigating.
  listNotesActive: boolean;
  toggle: () => void;
  openEntity: (entity: NotesEntity) => void;
  closeListOverride: () => void;
};

const NotesPanelContext = createContext<NotesPanelContextValue | undefined>(undefined);

// Global, persistent side panel state - deliberately not a per-page Drawer.
// The user's standing preference (only the Notes button toggles it; one flag for lists, one for detail pages) and survives navigation entirely; the panel's actual
// visibility (`open`) is derived from that preference AND whether there's
// anything to show at all. So: open it once, and it keeps showing itself on
// every notes-capable page you visit, auto-hiding on ones that aren't
// (lists, admin) without you having to reopen it each time you land on
// another real record. Each page that supports notes registers/clears
// the active entity itself via useEffect (the cleanup on unmount nulls it
// again on navigating away); pages without note support simply never
// call setEntity.
//
// `listOverride` is a second, independent slot for "a list row's notes
// were just clicked open" (see utils/tableFilter.tsx's notesColumn) -
// kept separate from `entity` (the page's own subject) rather than
// overwriting it, so that closing a list-clicked peek can fall back to
// showing the page's own notes again instead of showing nothing.
export const NotesPanelProvider = ({ children }: PropsWithChildren) => {
  const [entity, setEntityState] = useState<NotesEntity>(null);
  const [listOverride, setListOverride] = useState<NotesEntity>(null);
  const [flags, setFlags] = useState(readFlags);
  const [pageKind, setPageKind] = useState<PageKind>("detail");
  const isMobile = useIsMobile();
  const wantOpen = flags[pageKind];
  const toggle = useCallback(() => {
    setFlags((f) => {
      const next = { ...f, [pageKind]: !f[pageKind] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // per-device convenience only
      }
      return next;
    });
  }, [pageKind]);

  // Registering a new page subject (including clearing to null on unmount)
  // also drops any stale list-row override left over from whatever you were
  // just looking at - a peek from the previous page has no business
  // surviving a navigation to a new one.
  const setEntity = useCallback((next: NotesEntity) => {
    setEntityState(next);
    setListOverride(null);
  }, []);

  // Unconditionally opens the panel for a specific entity - used by list
  // pages' (and a detail page's own child-list tables') note-icon clicks,
  // as opposed to `toggle`, which only flips the user's own standing
  // open/closed preference and would risk *closing* an already-open panel
  // instead of switching it to a different row's notes.
  const openEntity = useCallback((next: NotesEntity) => {
    setListOverride(next);
    setFlags((f) => {
      if (f[pageKind]) return f;
      const merged = { ...f, [pageKind]: true };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // per-device convenience only
      }
      return merged;
    });
  }, [pageKind]);

  const closeListOverride = useCallback(() => setListOverride(null), []);

  const effectiveEntity = listOverride ?? entity;
  // A list shows the panel (empty state "select a row") even with nothing selected.
  const open = wantOpen && (pageKind === "list" || effectiveEntity !== null);
  const listNotesActive = pageKind === "list" && flags.list && !isMobile;
  const isListOverride = listOverride !== null;

  return (
    <NotesPanelContext.Provider
      value={{ entity, setEntity, effectiveEntity, isListOverride, open, pageKind, setPageKind, listNotesActive, toggle, openEntity, closeListOverride }}
    >
      {children}
    </NotesPanelContext.Provider>
  );
};

export const useNotesPanel = () => {
  const ctx = useContext(NotesPanelContext);
  if (!ctx) throw new Error("useNotesPanel must be used within a NotesPanelProvider");
  return ctx;
};

// Registers/clears the active entity for a detail page - was hand-copied
// into every page's own useEffect (and, in vessels/edit.tsx's case, simply
// forgotten). `id: null` (e.g. a not-yet-saved "new" record) behaves the
// same as the entity not supporting notes at all - nothing to register.
export function useEntityNotes(entityType: string, id: string | null) {
  const { setEntity } = useNotesPanel();
  useEffect(() => {
    if (id && requireEntityType(entityType)?.notes) setEntity({ type: entityType, id });
    else setEntity(null);
    return () => setEntity(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, id]);
}

// Called by every list page: marks the route as a list (the Notes button and row clicks then use the list flag) and,
// like useEntityNotes, clears any previewed row on leaving.
export function useListNotes() {
  const { setPageKind, setEntity } = useNotesPanel();
  useEffect(() => {
    setPageKind("list");
    return () => {
      setPageKind("detail");
      setEntity(null);
    };
  }, [setPageKind, setEntity]);
}
