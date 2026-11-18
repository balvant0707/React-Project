// Ported 1:1 from the NPM tool (app/src/components/companyVesselRoleStats.tsx).
import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { supabaseClient } from "@rbp/core";
import { buildVesselCompanyRoleUrl, buildCompanyRolesFilterUrl, NP_FILTER } from "@rbp/module-companies/src/utils/crossFilterNav.ts";

type Level = { owner: number; shipManager: number; technicalManager: number; operator: number; unique: number };
type Counts = { total: Level; np: Level };
type RoleKey = Exclude<keyof Level, "unique">;

// Every number is "vessels | of which Nippon Paint applied".
//
// The first number is the company's whole GROUP: the company plus every
// subordinate company (one whose group_company_id points at it, e.g. CMB NV
// under CMB.Tech NV). A company without subordinates is its own group, so it
// shows just its own vessels. The second number is the subset of those vessels
// whose current maker is our own maker company - "currently" meaning the latest
// DD/NB hull event dated up to today (event_date, never created_at - see
// 20261006100000_current_maker_by_event_date.sql).
//
// Counts are independent per role, not a partition - a vessel where the group
// holds two roles at once (e.g. owner and technical manager) counts in both.
// "Unique vessels" is the number of distinct vessels tied to the group in ANY of
// the four roles; it is also reported upward via onUniqueCount so the overview's
// supplier chart can use it as its "of N ships" denominator without a second
// query.
//
// Links open the vessels list filtered the same way the number was counted:
// assigned to the company or to any of its subsidiaries (see
// VESSEL_COMPANY_ROLES), the same for every company. The second number adds
// current_maker_is_own on top. A zero stays plain text, since the
// list behind it would be empty.
//
// One indexed lookup for all ten numbers (see
// 20261006100000_current_maker_by_event_date.sql); count queries on
// vessels_overview scanned every vessel (~1 s for a big group).
export const CompanyVesselRoleStats = ({ companyId, onUniqueCount }: { companyId: string; onUniqueCount?: (count: number) => void }) => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    supabaseClient.rpc("company_vessel_role_counts", { p_company_id: companyId }).then(({ data }) => {
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as
        | {
            owner_count: number;
            ship_manager_count: number;
            technical_manager_count: number;
            operator_count: number;
            unique_count: number;
            np_owner_count: number;
            np_ship_manager_count: number;
            np_technical_manager_count: number;
            np_operator_count: number;
            np_unique_count: number;
          }
        | undefined;
      const total: Level = {
        owner: Number(row?.owner_count ?? 0),
        shipManager: Number(row?.ship_manager_count ?? 0),
        technicalManager: Number(row?.technical_manager_count ?? 0),
        operator: Number(row?.operator_count ?? 0),
        unique: Number(row?.unique_count ?? 0),
      };
      const np: Level = {
        owner: Number(row?.np_owner_count ?? 0),
        shipManager: Number(row?.np_ship_manager_count ?? 0),
        technicalManager: Number(row?.np_technical_manager_count ?? 0),
        operator: Number(row?.np_operator_count ?? 0),
        unique: Number(row?.np_unique_count ?? 0),
      };
      setCounts({ total, np });
      onUniqueCount?.(total.unique);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const link = (count: number, url: string) =>
    count > 0 ? (
      <a
        onClick={(e) => {
          e.stopPropagation();
          navigate(url);
        }}
      >
        {count}
      </a>
    ) : (
      <span>{count}</span>
    );

  const pair = (total: number, np: number, totalUrl: string, npUrl: string) => (
    <>
      {link(total, totalUrl)}
      <span style={{ margin: "0 8px", opacity: 0.45 }}>|</span>
      <Tooltip title="Of these, vessels with Nippon Paint currently applied">{link(np, npUrl)}</Tooltip>
    </>
  );

  const statisticValue = (role: RoleKey, title: string) => (
    <Card size="small">
      <Statistic
        title={title}
        value={counts?.total[role] ?? 0}
        loading={!counts}
        formatter={() => {
          if (!counts) return null;
          return pair(
            counts.total[role],
            counts.np[role],
            buildVesselCompanyRoleUrl(role, companyId),
            buildVesselCompanyRoleUrl(role, companyId, [NP_FILTER]),
          );
        }}
      />
    </Card>
  );

  return (
    <Row gutter={[16, 16]}>
      <Col flex="1 1 180px">{statisticValue("owner", "Vessels as Group Owner")}</Col>
      <Col flex="1 1 180px">{statisticValue("shipManager", "Vessels as Ship Manager")}</Col>
      <Col flex="1 1 180px">{statisticValue("technicalManager", "Vessels as Technical Manager")}</Col>
      <Col flex="1 1 180px">{statisticValue("operator", "Vessels as Operator")}</Col>
      <Col flex="1 1 180px">
        <Card size="small">
          <Statistic
            title="Unique vessels"
            value={counts?.total.unique ?? 0}
            loading={!counts}
            formatter={() =>
              counts
                ? pair(
                    counts.total.unique,
                    counts.np.unique,
                    buildCompanyRolesFilterUrl(companyId),
                    buildCompanyRolesFilterUrl(companyId, [NP_FILTER]),
                  )
                : null
            }
          />
        </Card>
      </Col>
    </Row>
  );
};
