// The DFT proposal for antifouling coat lines. The calculation (polishing rate, speed and temperature curves, derates, limits) runs
// in the database (rpc dft_proposal, migration 20261115140000_npm_products_dft_server.sql); the coefficient tables are readable
// by admins only, so no user's browser holds them. Before, this file held the calculation itself (ported from NPM's "ADECS-11"
// Excel calculator, see ~/npm_tool/docs/domain-model.md "DFT proposal calculation").
import { supabaseClient } from "@rbp/core";

// One of the three DFT-relevant hull zones (spec_areas.af_zone); every other area counts as "vertical" (no derate).
export type LocationKind = "vertical" | "flat_bottom" | "boottop";

export type DftProposalRequest = {
  packagingId: string;
  speed: number | null;
  seawaterTemperature: number | null;
  activityDaysPerYear: number | null;
  servicePeriodMonths: number | null;
  location: LocationKind;
  // Coat lines of the same product directly above this one: every coat but the last gets the maximum per coat, the last the rest.
  priorCoats: number;
};

// The DFT in um for this coat line, or null (product without coefficients, an input missing, more coats than the calculation
// calls for): the caller then keeps the product's own default. A failed call (server not reachable) throws, so the caller can say that the
// proposal is missing instead of leaving the product default looking like a calculated value.
export async function requestDftProposal(request: DftProposalRequest): Promise<number | null> {
  const { speed, seawaterTemperature, activityDaysPerYear, servicePeriodMonths } = request;
  if (speed == null || seawaterTemperature == null || activityDaysPerYear == null || servicePeriodMonths == null) return null;
  const { data, error } = await supabaseClient.rpc("dft_proposal", {
    p_packaging_id: request.packagingId,
    p_speed: speed,
    p_temperature: seawaterTemperature,
    p_activity_days: activityDaysPerYear,
    p_service_months: servicePeriodMonths,
    p_location: request.location,
    p_prior_coats: request.priorCoats,
  });
  if (error) throw error;
  return data == null ? null : Number(data);
}
