// Delete button of the company page (new: neither app had one; the delete itself follows COMPASS's asset page,
// modules/assets/src/pages/assets/show.tsx `remove`). Shown with `companies.delete.all`, or with
// `companies.delete.created` on a company the user created; RLS checks the same (migration
// modules/companies/sql/migrations/20261113120000_npm_companies_delete.sql). A SeaWeb company is refused with its SeaWeb
// name here and by the trigger `companies_guard_seaweb_delete`.
import { App as AntdApp, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { errorText, supabaseClient, useIdentity, usePermissions } from "@rbp/core";
import { confirmAsync } from "@rbp/ui";

type CompanyForDelete = { id: string; name: string; source?: string | null; seaweb_match_name?: string | null; created_by_user_id?: string | null };

export const seawebDeleteText = (c: CompanyForDelete) =>
  `This company comes from SeaWeb ("${c.seaweb_match_name ?? c.name}") and cannot be deleted.`;

export function CompanyDeleteButton({ company, onDeleted }: { company: CompanyForDelete; onDeleted: () => void }) {
  const { modal, message } = AntdApp.useApp();
  const { identity } = useIdentity();
  const { has } = usePermissions();
  const queryClient = useQueryClient();
  const canDelete =
    has("companies.delete.all") || (has("companies.delete.created") && !!identity?.id && company.created_by_user_id === identity.id);
  // A SeaWeb company keeps the button for whoever may delete companies at all, so the reason is said instead of hidden.
  const isSeaweb = company.source === "seaweb";
  if (!canDelete && !(isSeaweb && (has("companies.delete.all") || has("companies.delete.created")))) return null;

  const remove = async () => {
    if (isSeaweb) {
      message.error(seawebDeleteText(company));
      return;
    }
    const ok = await confirmAsync(modal, {
      title: `Delete ${company.name}?`,
      content: "The company, its team roles and its notes are removed. This cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
    });
    if (!ok) return;
    const { data, error } = await supabaseClient.from("companies").delete().eq("id", company.id).select("id");
    if (error) {
      message.error(
        errorText(error, {
          byCode: {
            "23503":
              "This company is still in use (members of its group, products, orders, specifications, transport quotes or newbuilding projects) and cannot be deleted.",
          },
        }),
      );
      return;
    }
    if (!data?.length) {
      message.error("You may not delete this company.");
      return;
    }
    message.success(`${company.name} deleted`);
    await queryClient.invalidateQueries();
    onDeleted();
  };

  return (
    <Button danger icon={<DeleteOutlined />} onClick={remove}>
      Delete
    </Button>
  );
}
