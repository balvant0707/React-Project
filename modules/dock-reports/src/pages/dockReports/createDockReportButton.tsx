// Ported 1:1 from the NPM tool (app/src/pages/dockReports/createDockReportButton.tsx).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal, Select, Form, App as AntdApp } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { RemoteSelect } from "@rbp/ui";
import { searchHullEventOptions, loadHullEventOptionsByIds } from "@rbp/module-fleet/src/modules/hullEvents/hullEvents.ts";
import {
  createDockReport,
  findExistingDockReportId,
  loadHullEventSpecifications,
  type DockReportSpecCandidate,
} from "./createDockReport";
import { errorText } from "@rbp/core";

// Two entry points share this one flow (~/npm_tool/docs/dock-report-module.md
// "Navigation"): the Dock Reports list page (no hull event known yet - asks
// first) and a Hull Event's own show page (hullEventId passed straight in -
// skips that step). Either way: reuse an existing report for this hull event
// if there is one, else auto-pick its accepted specification, else ask which
// specification if that's ambiguous (per the confirmed decision - "auto-pick
// the accepted spec, user selection if more than one").
export const CreateDockReportButton = ({ hullEventId, label = "New Dock Report" }: { hullEventId?: string; label?: string }) => {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [pickHullEventOpen, setPickHullEventOpen] = useState(false);
  const [pendingHullEventId, setPendingHullEventId] = useState<string | undefined>(undefined);
  const [specCandidates, setSpecCandidates] = useState<DockReportSpecCandidate[] | null>(null);
  const [pickedSpecId, setPickedSpecId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const proceedWithHullEvent = async (heId: string) => {
    setBusy(true);
    try {
      const existingId = await findExistingDockReportId(heId);
      if (existingId) {
        navigate(`/dock-reports/${existingId}`);
        return;
      }
      const specs = await loadHullEventSpecifications(heId);
      if (specs.length === 0) {
        message.error("This hull event has no specification yet - create one first.");
        return;
      }
      const accepted = specs.filter((s) => s.status === "accepted");
      if (accepted.length === 1) {
        const newId = await createDockReport(heId, accepted[0].id);
        navigate(`/dock-reports/${newId}`);
        return;
      }
      // Ambiguous (no single accepted version) - ask which specification.
      setPendingHullEventId(heId);
      setSpecCandidates(specs);
      setPickedSpecId(accepted[0]?.id ?? specs[specs.length - 1]?.id);
    } catch (e: any) {
      message.error(errorText(e, "Could not create dock report"));
    } finally {
      setBusy(false);
    }
  };

  const openFlow = () => {
    if (hullEventId) {
      proceedWithHullEvent(hullEventId);
    } else {
      setPickHullEventOpen(true);
    }
  };

  const confirmSpecPick = async () => {
    const heId = pendingHullEventId;
    if (!heId || !pickedSpecId) return;
    setBusy(true);
    try {
      const newId = await createDockReport(heId, pickedSpecId);
      setSpecCandidates(null);
      setPendingHullEventId(undefined);
      navigate(`/dock-reports/${newId}`);
    } catch (e: any) {
      message.error(errorText(e, "Could not create dock report"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={openFlow} loading={busy && !pickHullEventOpen && !specCandidates}>
        {label}
      </Button>

      <Modal
        title="Pick a Hull Event"
        open={pickHullEventOpen}
        onCancel={() => setPickHullEventOpen(false)}
        onOk={() => {
          if (!pendingHullEventId) return;
          setPickHullEventOpen(false);
          proceedWithHullEvent(pendingHullEventId);
        }}
        okButtonProps={{ disabled: !pendingHullEventId }}
      >
        <Form layout="vertical">
          <Form.Item label="Vessel name / IMO">
            <RemoteSelect
              loadOptions={searchHullEventOptions}
              loadLabels={loadHullEventOptionsByIds}
              value={pendingHullEventId}
              onChange={setPendingHullEventId}
              placeholder="Type a vessel name or IMO - only DD/NB hull events can carry a Dock Report"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Which Specification does this Dock Report document?"
        open={!!specCandidates}
        onCancel={() => {
          setSpecCandidates(null);
          setPendingHullEventId(undefined);
        }}
        onOk={confirmSpecPick}
        confirmLoading={busy}
        okButtonProps={{ disabled: !pickedSpecId }}
      >
        <Select
          style={{ width: "100%" }}
          value={pickedSpecId}
          onChange={setPickedSpecId}
          options={(specCandidates ?? []).map((s) => ({
            value: s.id,
            label: `${s.specification_number} - v${s.version} (${s.status})`,
          }))}
        />
      </Modal>
    </>
  );
};
