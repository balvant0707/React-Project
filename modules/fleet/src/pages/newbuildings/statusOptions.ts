// Ported 1:1 from the NPM tool (app/src/pages/newbuildings/statusOptions.ts).
import { HULL_EVENT_STATUS_OPTIONS } from "../hullEvents/statusOptions";

// A newbuilding project has the hull event status pipeline, minus the inspection statuses (a project is a bid, nothing is
// inspected) and "Not set" (only the legacy backfill value; a new project always has a status, default "Open"). The colors
// are the hull events' own: HULL_EVENT_STATUS_COLOR for tags, HULL_EVENT_STATUS_HEX for the list's row strip.
const NOT_FOR_PROJECTS = ["Planned inspection", "Inspected", "Not set"];

export const NEWBUILDING_PROJECT_STATUS_OPTIONS = HULL_EVENT_STATUS_OPTIONS.filter((o) => !NOT_FOR_PROJECTS.includes(o.value));
