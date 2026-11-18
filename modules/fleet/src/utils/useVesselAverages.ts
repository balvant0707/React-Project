// Ported 1:1 from the NPM tool (app/src/utils/useVesselAverages.ts).
import { useEffect, useState } from "react";
import { useDataProvider, type CrudFilters } from "@rbp/core";

export type VesselAverages = { deadweightTonnage: number | null; ageYears: number | null };

// Average DWT and age of the vessels matching the list table's current
// filters (the same Refine filters passed to useTable), ignoring pagination
// and sorting - so it describes the whole filtered result, not just the page.
// Computed on the server (~175k vessels) in one PostgREST aggregate request
// (needs pgrst.db_aggregates_enabled - see
// 20260921130000_enable_postgrest_aggregates.sql). Age comes from the view's
// integer built_year column (20261005130000), since PostgREST can't average a
// date; like the detail page's "N years old", it is whole calendar years.
// Vessels without a value are left out of the respective average.
export const useVesselAverages = (filters: CrudFilters): VesselAverages | null => {
  const dataProvider = useDataProvider()();
  const [averages, setAverages] = useState<VesselAverages | null>(null);
  // Filters are a fresh array every render; key the effect on their content.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setAverages(null);
    dataProvider
      .getList<{ deadweight_tonnage_avg: number | null; built_year_avg: number | null }>({
        resource: "vessels_overview",
        filters: JSON.parse(filtersKey),
        pagination: { currentPage: 1, pageSize: 1 },
        meta: { select: "deadweight_tonnage_avg:deadweight_tonnage.avg(), built_year_avg:built_year.avg()" },
      })
      .then(({ data }) => {
        if (cancelled) return;
        const row = data[0];
        setAverages({
          deadweightTonnage: row?.deadweight_tonnage_avg != null ? Number(row.deadweight_tonnage_avg) : null,
          ageYears: row?.built_year_avg != null ? new Date().getFullYear() - Number(row.built_year_avg) : null,
        });
      })
      .catch((error) => {
        console.error("Could not load vessel averages", error);
        if (!cancelled) setAverages({ deadweightTonnage: null, ageYears: null });
      });
    return () => {
      cancelled = true;
    };
  }, [dataProvider, filtersKey]);

  return averages;
};
