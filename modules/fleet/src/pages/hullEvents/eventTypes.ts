// Ported 1:1 from the NPM tool (app/src/pages/hullEvents/eventTypes.ts).
// Hull event types that are plain records of a visit, not a sales opportunity: Test Patch (TP), Inspection (INS) and
// Cleaning (CLN). They use the same hull_events row, but the pages hide the commercial parts (customer, dealer,
// facilitating partner, service period, offer, specifications). Only a test patch has an applied antifouling product.
const LIGHT_EVENT_TYPE_CODES = ["TP", "INS", "CLN"] as const;

export const isLightEventType = (code: string | null | undefined): boolean => !!code && (LIGHT_EVENT_TYPE_CODES as readonly string[]).includes(code);

export const hasAppliedProduct = (code: string | null | undefined): boolean => !isLightEventType(code) || code === "TP";
