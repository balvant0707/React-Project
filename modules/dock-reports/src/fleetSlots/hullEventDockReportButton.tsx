// The hull event page's "Dock Report" button (slot hull_events.show.actions), cut from the NPM tool's pages/hullEvents/show.tsx:
// DD/NB only, matching dock_reports.hull_event_id's own CHECK constraint (prepare_dock_report()) - a Seastock hull event can never
// carry a Dock Report. CreateDockReportButton itself opens the existing one if this hull event already has one.
import { CreateDockReportButton } from "../pages/dockReports/createDockReportButton";

export const HullEventDockReportButton = ({ hullEventId, eventTypeCode }: { hullEventId: string; eventTypeCode: string | null }) =>
  eventTypeCode === "DD" || eventTypeCode === "NB" ? <CreateDockReportButton hullEventId={hullEventId} label="Dock Report" /> : null;
