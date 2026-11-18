// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/useDockReportDraft.ts).
import { useEffect, useRef, useState } from "react";
import { uuidv7 } from "@rbp/ui";
import { loadLocalDraft, saveLocalDraft, fetchDraftFromServer, putBlob, deleteBlob } from "./draftStore";
import { syncDraftToServer } from "./sync";
import { todayIso } from "@rbp/ui";
import {
  isEmptyWeatherReading,
  isEmptyActivity,
  type DockReportDraft,
  type DraftHeader,
  type DraftArea,
  type DraftDailyLog,
  type DraftWeatherReading,
  type DraftActivity,
  type DraftPhoto,
  type DraftSignature,
  type SignatureRole,
  type SyncStatus,
} from "./types";

const AUTO_SYNC_DEBOUNCE_MS = 3000;
const RETRY_INTERVAL_MS = 20000;

// A still-blank weather reading/activity (the always-present trailing row -
// see dailyJournalPanel.tsx) is `synced: false` forever, by design - it's
// never actually sent to the server (sync.ts skips it) unless a photo has
// been attached to it. That must NOT count as "pending": otherwise simply
// having a day open for editing keeps at least one permanently-unsynced row
// around, and the sync status can never settle on "synced" - it gets stuck
// showing "N changes waiting" indefinitely even once everything real has
// gone through.
const hasPendingChanges = (draft: DockReportDraft): boolean =>
  draft.dirty ||
  draft.dailyLogs.some(
    (l) =>
      !l.synced ||
      l.deleted ||
      l.weatherReadings.some((w) => w.deleted || (!w.synced && !isEmptyWeatherReading(w))) ||
      l.activities.some((a) => a.deleted || (!a.synced && !isEmptyActivity(a))),
  ) ||
  draft.photos.some((p) => !p.synced || p.deleted) ||
  draft.signatures.some((s) => !s.synced || s.deleted);

// The single place every Dock Report tab reads and writes through while
// editing - see ~/npm_tool/docs/dock-report-offline-sync.md for the full design.
// IndexedDB (via draftStore.ts), not React state, is the actual source of
// truth: every mutator persists immediately and synchronously with the
// state update, so a closed tab/browser never loses anything that made it
// into this hook. Syncing to Supabase (sync.ts) is a best-effort background
// concern layered on top - it never gates whether an edit "took".
export function useDockReportDraft(dockReportId: string, editingMode: boolean) {
  const [draft, setDraftState] = useState<DockReportDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");

  const draftRef = useRef<DockReportDraft | null>(null);
  const syncingRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const persist = async (next: DockReportDraft) => {
    draftRef.current = next;
    setDraftState(next);
    await saveLocalDraft(next);
  };

  const attemptSync = async () => {
    const current = draftRef.current;
    if (!current || syncingRef.current) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    if (!hasPendingChanges(current)) {
      setSyncStatus("synced");
      return;
    }
    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      const synced = await syncDraftToServer(current);
      await persist(synced);
      setSyncStatus(hasPendingChanges(synced) ? "pending" : "synced");
    } catch (e: any) {
      await persist({ ...current, lastSyncError: e?.message ?? "Sync failed" });
      setSyncStatus("error");
    } finally {
      syncingRef.current = false;
    }
  };

  const scheduleSync = () => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      attemptSync();
    }, AUTO_SYNC_DEBOUNCE_MS);
  };

  // Initialize: an in-progress LOCAL draft (one with unsynced changes) is
  // reused as-is - that's the whole point, it survives a reload/closed
  // browser. But a draft with nothing pending is just a cached mirror, not
  // something to protect - starting a NEW editing session pulls fresh
  // server state instead, so it doesn't silently resume a snapshot that's
  // gone stale since a previous session synced (see "Cold start / resuming
  // offline" in the design doc - this is the "not load a stale local
  // version while a newer exists" guarantee).
  useEffect(() => {
    let cancelled = false;
    if (!editingMode) {
      setDraftState(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setInitError(null);
      let local = await loadLocalDraft(dockReportId);
      // Only a draft with unsynced changes is something to protect from
      // being overwritten - one that's fully synced (or missing entirely)
      // has nothing at risk locally, so a NEW editing session should pull
      // the current server state rather than silently resuming whatever
      // this device happened to have from a previous session (which could
      // by now be stale - someone else may have edited and synced since).
      const localIsSafeToReuseAsIs = !!local && hasPendingChanges(local);
      if (!localIsSafeToReuseAsIs) {
        if (navigator.onLine) {
          try {
            const fresh = await fetchDraftFromServer(dockReportId);
            local = fresh;
            await saveLocalDraft(fresh);
          } catch (e: any) {
            // Couldn't reach the server - fall back to the local copy if
            // there is one (still better than nothing), otherwise this is a
            // genuine dead end.
            if (!local) {
              if (!cancelled) {
                setInitError(e?.message ?? "Could not load this Dock Report");
                setLoading(false);
              }
              return;
            }
          }
        } else if (!local) {
          if (!cancelled) {
            setInitError("No offline copy of this Dock Report on this device yet - connect once to start editing, then it works offline.");
            setLoading(false);
          }
          return;
        }
        // else: offline, but a fully-synced local copy already exists -
        // nothing fresher is reachable anyway, so it's fine to reuse.
      }
      if (!cancelled && local) {
        draftRef.current = local;
        setDraftState(local);
        setLoading(false);
        setSyncStatus(hasPendingChanges(local) ? "pending" : "synced");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dockReportId, editingMode]);

  // Connectivity tracking + auto-sync triggers. The interval is a backstop
  // for flaky connections that don't cleanly fire online/offline (common on
  // a tablet moving around a yard) - see design doc "Why poll as well as
  // listen for online/offline".
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      attemptSync();
    };
    const goOffline = () => {
      setOnline(false);
      setSyncStatus("offline");
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const interval = window.setInterval(() => {
      if (navigator.onLine) attemptSync();
    }, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(interval);
      window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = (fn: (d: DockReportDraft) => DockReportDraft) => {
    if (!draftRef.current) return;
    const next = fn(draftRef.current);
    persist(next);
    setSyncStatus(navigator.onLine ? "pending" : "offline");
    scheduleSync();
  };

  const updateHeader = (patch: Partial<DraftHeader>) => mutate((d) => ({ ...d, dirty: true, header: { ...d.header, ...patch } }));

  const setAreas = (areas: DraftArea[]) => mutate((d) => ({ ...d, dirty: true, areas }));

  // --- Daily log ---
  const addDailyLog = (log_date: string) =>
    mutate((d) => {
      if (d.dailyLogs.some((l) => l.log_date === log_date && !l.deleted)) return d;
      const log: DraftDailyLog = {
        id: uuidv7(),
        log_date,
        created_by_user_id: null,
        narrative_text: null,
        weatherReadings: [],
        activities: [],
        synced: false,
      };
      return { ...d, dailyLogs: [...d.dailyLogs, log].sort((a, b) => a.log_date.localeCompare(b.log_date)) };
    });
  const updateDailyLog = (logId: string, patch: Partial<DraftDailyLog>) =>
    mutate((d) => ({ ...d, dailyLogs: d.dailyLogs.map((l) => (l.id === logId ? { ...l, ...patch, synced: false } : l)) }));
  const removeDailyLog = (logId: string) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs
        .map((l) => (l.id === logId ? { ...l, deleted: true } : l))
        .filter((l) => l.id !== logId || l.synced), // never-synced logs can just disappear
    }));

  const addWeatherReading = (logId: string) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs.map((l) =>
        l.id === logId
          ? {
              ...l,
              weatherReadings: [
                ...l.weatherReadings,
                {
                  id: uuidv7(),
                  time_taken: null,
                  air_temperature_c: null,
                  surface_temperature_c: null,
                  dew_point_c: null,
                  relative_humidity_pct: null,
                  wind_condition_text: null,
                  synced: false,
                } satisfies DraftWeatherReading,
              ],
            }
          : l,
      ),
    }));
  const updateWeatherReading = (logId: string, readingId: string, patch: Partial<DraftWeatherReading>) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs.map((l) =>
        l.id === logId
          ? { ...l, weatherReadings: l.weatherReadings.map((w) => (w.id === readingId ? { ...w, ...patch, synced: false } : w)) }
          : l,
      ),
    }));
  const removeWeatherReading = (logId: string, readingId: string) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs.map((l) =>
        l.id === logId
          ? {
              ...l,
              weatherReadings: l.weatherReadings
                .map((w) => (w.id === readingId ? { ...w, deleted: true } : w))
                .filter((w) => w.id !== readingId || w.synced),
            }
          : l,
      ),
    }));

  const addActivity = (logId: string) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs.map((l) =>
        l.id === logId
          ? {
              ...l,
              activities: [
                ...l.activities,
                {
                  id: uuidv7(),
                  dock_report_area_id: null,
                  time_taken: null,
                  activity_text: null,
                  application_method_phrase_id: null,
                  synced: false,
                } satisfies DraftActivity,
              ],
            }
          : l,
      ),
    }));
  const updateActivity = (logId: string, activityId: string, patch: Partial<DraftActivity>) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs.map((l) =>
        l.id === logId
          ? { ...l, activities: l.activities.map((a) => (a.id === activityId ? { ...a, ...patch, synced: false } : a)) }
          : l,
      ),
    }));
  const removeActivity = (logId: string, activityId: string) =>
    mutate((d) => ({
      ...d,
      dailyLogs: d.dailyLogs.map((l) =>
        l.id === logId
          ? {
              ...l,
              activities: l.activities
                .map((a) => (a.id === activityId ? { ...a, deleted: true } : a))
                .filter((a) => a.id !== activityId || a.synced),
            }
          : l,
      ),
    }));

  // --- Photos ---
  // `initial` lets a caller that already knows where this photo belongs (the
  // Daily Journal view, capturing straight into "today") set that at
  // creation instead of leaving it to a later manual edit - the Photo
  // Library panel's own plain camera/upload button still calls this with no
  // second argument and behaves exactly as before. Returns the new photo's
  // id for the same reason.
  const addPhoto = async (blob: Blob, initial?: Partial<DraftPhoto>) => {
    const id = uuidv7();
    const blobKey = `photo:${dockReportId}:${id}`;
    await putBlob(blobKey, blob);
    mutate((d) => ({
      ...d,
      photos: [
        ...d.photos,
        {
          id,
          dock_report_area_id: null,
          dock_report_daily_log_id: null,
          dock_report_activity_id: null,
          stage_phrase_id: null,
          taken_at: todayIso(),
          caption_text: null,
          include_in_daily_report: false,
          include_in_final_report: false,
          storage_path: null,
          blobKey,
          synced: false,
          ...initial,
        } satisfies DraftPhoto,
      ],
    }));
    return id;
  };
  const updatePhoto = (id: string, patch: Partial<DraftPhoto>) =>
    mutate((d) => ({ ...d, photos: d.photos.map((p) => (p.id === id ? { ...p, ...patch, synced: false } : p)) }));
  const removePhoto = (id: string) =>
    mutate((d) => ({
      ...d,
      photos: d.photos.map((p) => (p.id === id ? { ...p, deleted: true } : p)).filter((p) => p.id !== id || p.synced),
    }));

  // --- Signatures ---
  const upsertSignatureBlob = async (role: SignatureRole, blob: Blob) => {
    const current = draftRef.current;
    const existing = current?.signatures.find((s) => s.role === role);
    if (existing?.blobKey) await deleteBlob(existing.blobKey);
    const id = existing?.id ?? uuidv7();
    const blobKey = `signature:${dockReportId}:${id}`;
    await putBlob(blobKey, blob);
    mutate((d) => {
      const others = d.signatures.filter((s) => s.role !== role);
      const prior = d.signatures.find((s) => s.role === role);
      return {
        ...d,
        signatures: [
          ...others,
          {
            id,
            role,
            signer_name: prior?.signer_name ?? null,
            signed_at: prior?.signed_at ?? new Date().toISOString(),
            signature_storage_path: null,
            blobKey,
            synced: false,
          } satisfies DraftSignature,
        ],
      };
    });
  };
  const updateSignatureField = (role: SignatureRole, patch: Partial<DraftSignature>) =>
    mutate((d) => {
      const existing = d.signatures.find((s) => s.role === role);
      if (!existing) {
        return { ...d, signatures: [...d.signatures, { id: uuidv7(), role, signer_name: null, signed_at: null, signature_storage_path: null, blobKey: null, synced: false, ...patch }] };
      }
      return { ...d, signatures: d.signatures.map((s) => (s.role === role ? { ...s, ...patch, synced: false } : s)) };
    });
  const clearSignature = (role: SignatureRole) =>
    mutate((d) => {
      const existing = d.signatures.find((s) => s.role === role);
      if (!existing) return d;
      if (existing.blobKey) deleteBlob(existing.blobKey);
      return {
        ...d,
        signatures: d.signatures
          .map((s) => (s.role === role ? { ...s, deleted: true } : s))
          .filter((s) => s.role !== role || s.synced),
      };
    });

  return {
    draft,
    loading,
    initError,
    online,
    syncStatus,
    pendingCount: draft ? countPending(draft) : 0,
    syncNow: attemptSync,
    updateHeader,
    setAreas,
    addDailyLog,
    updateDailyLog,
    removeDailyLog,
    addWeatherReading,
    updateWeatherReading,
    removeWeatherReading,
    addActivity,
    updateActivity,
    removeActivity,
    addPhoto,
    updatePhoto,
    removePhoto,
    upsertSignatureBlob,
    updateSignatureField,
    clearSignature,
  };
}

function countPending(draft: DockReportDraft): number {
  let n = draft.dirty ? 1 : 0;
  for (const l of draft.dailyLogs) {
    if (l.deleted || !l.synced) n++;
    for (const w of l.weatherReadings) if (w.deleted || (!w.synced && !isEmptyWeatherReading(w))) n++;
    for (const a of l.activities) if (a.deleted || (!a.synced && !isEmptyActivity(a))) n++;
  }
  for (const p of draft.photos) if (p.deleted || !p.synced) n++;
  for (const s of draft.signatures) if (s.deleted || !s.synced) n++;
  return n;
}
