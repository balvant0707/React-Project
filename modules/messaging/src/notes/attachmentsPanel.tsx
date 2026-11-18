// Started as a 1:1 port of the NPM tool (app/src/components/attachmentsPanel.tsx); hand-maintained since 2026-11-12.
// Changed: the list, upload, type, preview and delete are the shared record
// files panel of messaging (RecordFiles, docs/shared-parts.md B5); kept from NPM: the card, the file types of hull
// events and the "From (company)" field of a file (attachments.company_id, RADAR only).
import { Card } from "antd";
import { RemoteSelect } from "@rbp/ui";
import { RecordFiles } from "@rbp/module-messaging/src/recordFiles.tsx";
import { searchCompanyOptions, loadCompanyOptionsByIds } from "@rbp/module-companies/src/modules/companies/companies.ts";

// The phrases category of a record type's file types (each type gets its own list); types without one have no types.
const ATTACHMENT_CATEGORY_BY_ENTITY: Partial<Record<string, string>> = {
  hull_events: "attachement_type_hullevent",
};

// Files of any NPM record (the attachments table's generic entity_type / entity_id).
export const AttachmentsPanel = ({ entityType, entityId }: { entityType: string; entityId: string }) => (
  <Card title="Attachments" size="small" style={{ marginBottom: 16 }}>
    <RecordFiles
      entityType={entityType}
      entityId={entityId}
      typeCategory={ATTACHMENT_CATEGORY_BY_ENTITY[entityType]}
      extraColumns={["company_id"]}
      rowExtras={(file, update) => [
        // The company a document came from (e.g. a competitor's offer).
        <RemoteSelect
          key="company"
          style={{ width: 220 }}
          placeholder="From (company)"
          loadOptions={searchCompanyOptions}
          loadLabels={loadCompanyOptionsByIds}
          value={(file.company_id as string | null) ?? undefined}
          onChange={(value) => void update({ company_id: value ?? null })}
        />,
      ]}
    />
  </Card>
);
