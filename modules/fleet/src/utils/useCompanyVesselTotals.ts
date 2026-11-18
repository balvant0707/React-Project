// Ported 1:1 from the NPM tool (app/src/utils/useCompanyVesselTotals.ts).
import { useEffect, useState } from "react";
import { useDataProvider, type CrudFilters } from "@rbp/core";

export type CompanyVesselTotals = {
  ships: number;
  npShips: number;
  owned: number;
  npOwned: number;
  managed: number;
  npManaged: number;
  operated: number;
  npOperated: number;
  npNb: number;
  surveyY0: number;
  surveyY1: number;
  surveyY2: number;
};

const SUM_COLUMNS: Record<keyof CompanyVesselTotals, string> = {
  ships: "unique_vessel_count",
  npShips: "np_unique_vessel_count",
  owned: "vessel_count",
  npOwned: "np_now_count",
  managed: "technical_manager_vessel_count",
  npManaged: "np_technical_manager_vessel_count",
  operated: "operator_vessel_count",
  npOperated: "np_operator_vessel_count",
  npNb: "np_nb_count",
  surveyY0: "survey_due_count_y0",
  surveyY1: "survey_due_count_y1",
  surveyY2: "survey_due_count_y2",
};
const SUM_SELECT = Object.entries(SUM_COLUMNS)
  .map(([alias, column]) => `${alias}:${column}.sum()`)
  .join(", ");

// Ship totals over the companies matching the list table's current filters
// (the same Refine filters passed to useTable), ignoring pagination: the sums
// of every vessel count column (owned / managed / operated with their Nippon Paint
// share, NP newbuildings, survey years), read in one PostgREST aggregate request
// off companies_overview (the per-company totals of the materialized rollup), or off the rpc companies_list() when
// the Ship Type filter is set - the data provider switches (src/dataProvider.ts), so the totals cover only vessels of
// the chosen types. A vessel that several
// listed companies hold in different roles is counted once per company, exactly as
// in the columns. dwt_sum is deliberately not summed (unique vessels, double counts).
export const useCompanyVesselTotals = (filters: CrudFilters): CompanyVesselTotals | null => {
  const dataProvider = useDataProvider()();
  const [totals, setTotals] = useState<CompanyVesselTotals | null>(null);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setTotals(null);
    dataProvider
      .getList<Record<keyof CompanyVesselTotals, number | null>>({
        resource: "companies_overview",
        filters: JSON.parse(filtersKey),
        pagination: { currentPage: 1, pageSize: 1 },
        meta: { select: SUM_SELECT },
      })
      .then(({ data }) => {
        if (cancelled) return;
        const row = data[0];
        setTotals(
          Object.fromEntries(
            (Object.keys(SUM_COLUMNS) as (keyof CompanyVesselTotals)[]).map((key) => [key, Number(row?.[key] ?? 0)]),
          ) as CompanyVesselTotals,
        );
      })
      .catch((error) => {
        console.error("Could not load company ship totals", error);
        if (!cancelled) setTotals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dataProvider, filtersKey]);

  return totals;
};
