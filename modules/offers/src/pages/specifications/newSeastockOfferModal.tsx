// Ported 1:1 from the NPM tool (app/src/pages/specifications/newSeastockOfferModal.tsx).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Typography, App as AntdApp } from "antd";
import { RemoteSelect } from "@rbp/ui";
import { searchVesselOptions, loadVesselOptionsByIds } from "@rbp/module-fleet/src/modules/vessels/vessels.ts";
import { createSeastockProject } from "../../modules/hullEvents/seastockProject";

// "New Seastock offer" from a list: a Seastock offer belongs to a vessel, so ask for it, start a new Seastock
// project on it and open the empty offer. (Adding an offer to an existing project is done on the vessel page.)
export const NewSeastockOfferModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [vesselId, setVesselId] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  const start = async () => {
    if (!vesselId) return;
    setCreating(true);
    const hullEventId = await createSeastockProject(vesselId);
    setCreating(false);
    if (!hullEventId) {
      message.error("Could not start the offer");
      return;
    }
    onClose();
    navigate(`/specifications/new?hull_event_id=${hullEventId}&vessel_id=${vesselId}`);
  };

  return (
    <Modal
      open={open}
      title="New Seastock offer"
      okText="Start offer"
      onOk={start}
      okButtonProps={{ disabled: !vesselId, loading: creating }}
      onCancel={onClose}
      afterClose={() => setVesselId(undefined)}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">Which vessel is the offer for?</Typography.Paragraph>
      <RemoteSelect
        value={vesselId}
        onChange={setVesselId}
        loadOptions={searchVesselOptions}
        loadLabels={loadVesselOptionsByIds}
        placeholder="Vessel name or IMO - type to search"
        autoFocus
        style={{ width: "100%" }}
      />
    </Modal>
  );
};
