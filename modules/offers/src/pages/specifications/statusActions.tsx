// Ported 1:1 from the NPM tool (app/src/pages/specifications/statusActions.tsx).
import { Button, Popconfirm, Tag, Tooltip } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";

const ACCEPT_GREEN = "#389e0d";

type Props = {
  status: string | undefined;
  isNew: boolean;
  isLatestVersion: boolean;
  canEditSpec: boolean;
  canApproveSpec: boolean;
  usesAreaBreakdown: boolean;
  // Seastock offers need no approval: Accept straight from draft (migration 20261105100000).
  isSeastock: boolean;
  statusChanging: boolean;
  accepting: boolean;
  approvalHistoryLines: string[];
  onRequestApproval: () => void;
  onApprove: () => void;
  onSendBackToDraft: () => void;
  onAccept: () => void;
};

// The status tag and the status-change buttons in the header of a specification (draft -> under review -> approved ->
// accepted, or lost; a Seastock offer goes draft -> accepted). Which button shows depends on the status and on the viewer's edit / approve rights.
export const SpecificationStatusActions = ({
  status,
  isNew,
  isLatestVersion,
  canEditSpec,
  canApproveSpec,
  usesAreaBreakdown,
  isSeastock,
  statusChanging,
  accepting,
  approvalHistoryLines,
  onRequestApproval,
  onApprove,
  onSendBackToDraft,
  onAccept,
}: Props) => {
  const history = approvalHistoryLines.length > 0 ? <>{approvalHistoryLines.map((l) => <div key={l}>{l}</div>)}</> : undefined;
  const canApprove = !isNew && isLatestVersion && canApproveSpec;
  const canEdit = !isNew && isLatestVersion && canEditSpec;
  const sendBackToDraft = canApprove && (
    <Popconfirm
      title="Send this Specification back to Draft?"
      description="It becomes freely editable again for whoever has edit rights."
      onConfirm={onSendBackToDraft}
    >
      <Button loading={statusChanging}>Send back to Draft</Button>
    </Popconfirm>
  );

  if (status === "accepted") {
    return (
      <Tooltip title={history}>
        <Tag color="green" icon={<CheckCircleOutlined />} style={{ padding: "4px 10px", fontSize: 13 }}>
          Accepted
        </Tag>
      </Tooltip>
    );
  }
  if (status === "lost") return <Tag color="red">Lost</Tag>;
  if (status === "under_review") {
    return (
      <>
        <Tooltip title={history}>
          <Tag color="gold">Under Review</Tag>
        </Tooltip>
        {sendBackToDraft}
        {canApprove && (
          <Popconfirm title="Approve this Specification?" onConfirm={onApprove}>
            <Button type="primary" loading={statusChanging}>
              Approve
            </Button>
          </Popconfirm>
        )}
      </>
    );
  }
  if (status === "approved") {
    return (
      <>
        <Tooltip title={history}>
          <Tag color="blue">Approved</Tag>
        </Tooltip>
        {sendBackToDraft}
        {canEdit && (
          <Button loading={accepting} onClick={onAccept} style={{ background: ACCEPT_GREEN, borderColor: ACCEPT_GREEN, color: "#fff" }}>
            Accept
          </Button>
        )}
      </>
    );
  }
  if (isSeastock && !usesAreaBreakdown) {
    return (
      canEdit && (
        <Button loading={accepting} onClick={onAccept} style={{ background: ACCEPT_GREEN, borderColor: ACCEPT_GREEN, color: "#fff" }}>
          Accept
        </Button>
      )
    );
  }
  return (
    canEdit && (
      <Button type="primary" onClick={usesAreaBreakdown ? onRequestApproval : onApprove} loading={statusChanging}>
        {usesAreaBreakdown ? "Request Approval" : "Approve"}
      </Button>
    )
  );
};
