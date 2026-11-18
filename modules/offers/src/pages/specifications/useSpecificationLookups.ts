// Ported 1:1 from the NPM tool (app/src/pages/specifications/useSpecificationLookups.ts).
// Reference data of the specification editor (dropdown options), loaded once per page. Suppliers depend on the
// tenant of the specification and are loaded by the page.
import { useEffect, useState } from "react";
import { loadPhraseId, loadPhraseOptions, type PhraseOption as Option } from "@rbp/core";
import { loadSpecAreas, type SpecArea } from "../../modules/specAreas/specAreas";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { countryOptions, loadCountries } from "@rbp/module-companies/src/modules/countries/countries.ts";
import { loadTenantOptions } from "@rbp/module-companies/src/modules/tenants/tenants.ts";

export type SpecificationLookups = {
  tenantOptions: Option[];
  userOptions: Option[];
  countryOptions: Option[];
  countryContinentById: Record<string, string | null>;
  areaOptions: Option[];
  areaAfZoneById: Map<string, SpecArea["af_zone"]>;
  substrateOptions: Option[];
  environmentOptions: Option[];
  coatModeOptions: Option[];
  applicationMethodOptions: Option[];
  // New coat lines start with "Airless spray" (a page default, not a per-product one).
  defaultApplicationMethodId: string | null;
  surfacePrepOptions: Option[];
  incotermOptions: Option[];
};

const EMPTY: SpecificationLookups = {
  tenantOptions: [],
  userOptions: [],
  countryOptions: [],
  countryContinentById: {},
  areaOptions: [],
  areaAfZoneById: new Map(),
  substrateOptions: [],
  environmentOptions: [],
  coatModeOptions: [],
  applicationMethodOptions: [],
  defaultApplicationMethodId: null,
  surfacePrepOptions: [],
  incotermOptions: [],
};

export function useSpecificationLookups(): SpecificationLookups & { ready: boolean } {
  const [lookups, setLookups] = useState<SpecificationLookups>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tenantOptions, userOptions, countries, specAreas, substrate, environment, coatMode, applicationMethod, airlessId, surfacePrep, incoterm] =
        await Promise.all([
          loadTenantOptions(),
          loadUserOptions(),
          loadCountries(),
          loadSpecAreas(),
          loadPhraseOptions("substrate"),
          loadPhraseOptions("environment_standard"),
          loadPhraseOptions("coat_mode"),
          loadPhraseOptions("application_method"),
          loadPhraseId("application_method", "airless"),
          loadPhraseOptions("surface_preparation"),
          loadPhraseOptions("incoterm"),
        ]);
      if (cancelled) return;
      setLookups({
        tenantOptions,
        userOptions,
        countryOptions: countryOptions(countries),
        countryContinentById: Object.fromEntries(countries.map((c) => [c.id, c.continent ?? null])),
        areaOptions: specAreas.map((a) => ({ value: a.id, label: a.name_en })),
        areaAfZoneById: new Map(specAreas.map((a) => [a.id, a.af_zone])),
        substrateOptions: substrate,
        environmentOptions: environment,
        coatModeOptions: coatMode,
        applicationMethodOptions: applicationMethod,
        defaultApplicationMethodId: airlessId,
        surfacePrepOptions: surfacePrep,
        incotermOptions: incoterm,
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...lookups, ready };
}
