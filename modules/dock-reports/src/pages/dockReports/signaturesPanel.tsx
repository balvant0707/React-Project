// Ported 1:1 from the NPM tool (app/src/pages/dockReports/signaturesPanel.tsx).
import { useEffect, useState } from "react";
import { Card, Row, Col, Input, DatePicker, Upload, Button, Popconfirm, Typography, Space } from "antd";
import { UploadOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { UploadRequestOption } from "@rbp/module-messaging/src/notes/uploadTypes.ts";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { getBlob } from "./offline/draftStore";
import { SignaturePadModal } from "./signaturePadModal";
import type { DraftSignature, SignatureRole } from "./offline/types";
import { ATTACHMENT_BUCKET } from "@rbp/module-messaging/src/notes/attachments.ts";


const ROLES: { value: SignatureRole; label: string }[] = [
  { value: "owner_representative", label: "Owner Representative" },
  { value: "npm_representative", label: "NPM Representative" },
  { value: "shipyard_representative", label: "Shipyard Representative" },
];

// Controlled component, same pattern as dailyLogPanel.tsx/photosPanel.tsx -
// mutations go through the offline draft; this panel only resolves a
// display URL (signed Storage URL once uploaded, a local blob: URL while
// still only in this device's IndexedDB) and renders the three fixed rows.
export const SignaturesPanel = ({
  signatures,
  canEdit,
  onSignBlob,
  onUpdateField,
  onClear,
}: {
  signatures: DraftSignature[];
  canEdit: boolean;
  onSignBlob: (role: SignatureRole, blob: Blob) => void;
  onUpdateField: (role: SignatureRole, patch: Partial<DraftSignature>) => void;
  onClear: (role: SignatureRole) => void;
}) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [padRole, setPadRole] = useState<SignatureRole | null>(null);

  const rowForRole = (role: SignatureRole) => signatures.find((s) => s.role === role && !s.deleted);

  useEffect(() => {
    let cancelled = false;
    const localUrls: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      const withPath = signatures.filter((s) => !s.deleted && s.signature_storage_path);
      if (withPath.length) {
        const { data: signed } = await supabaseClient.storage
          .from(ATTACHMENT_BUCKET)
          .createSignedUrls(withPath.map((s) => s.signature_storage_path!) as string[], 3600);
        (signed ?? []).forEach((s, i) => {
          if (s.signedUrl) next[withPath[i].id] = s.signedUrl;
        });
      }
      for (const s of signatures) {
        if (s.deleted || s.signature_storage_path || !s.blobKey) continue;
        const blob = await getBlob(s.blobKey);
        if (blob) {
          const url = URL.createObjectURL(blob);
          localUrls.push(url);
          next[s.id] = url;
        }
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      localUrls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatures.map((s) => `${s.id}:${s.signature_storage_path ?? ""}:${s.blobKey ?? ""}:${s.deleted ?? ""}`).join(",")]);

  const customUpload = (role: SignatureRole) => async ({ file, onSuccess }: UploadRequestOption) => {
    onSignBlob(role, file as File);
    onSuccess?.({});
  };

  return (
    <Card title="Signatures" size="small" style={{ marginBottom: 16 }}>
      <Row gutter={[12, 12]}>
        {ROLES.map(({ value: role, label }) => {
          const row = rowForRole(role);
          return (
            <Col key={role} xs={24} md={8}>
              <Card size="small" title={label}>
                {row?.signature_storage_path || row?.blobKey ? (
                  <>
                    {!row.signature_storage_path && (
                      <Typography.Text type="warning" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
                        Not uploaded yet
                      </Typography.Text>
                    )}
                    <img
                      src={urls[row.id]}
                      alt={label}
                      style={{ width: "100%", height: 100, objectFit: "contain", marginBottom: 8, background: "#fafafa" }}
                    />
                  </>
                ) : (
                  <div style={{ height: 100, background: "#f5f5f5", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Not signed yet
                    </Typography.Text>
                  </div>
                )}
                <Input
                  placeholder="Signer name"
                  size="small"
                  value={row?.signer_name ?? ""}
                  onChange={(e) => onUpdateField(role, { signer_name: e.target.value || null })}
                  disabled={!canEdit}
                  style={{ marginBottom: 6 }}
                />
                <DatePicker
                  placeholder="Signed at"
                  size="small"
                  value={row?.signed_at ? dayjs(row.signed_at) : null}
                  onChange={(d) => onUpdateField(role, { signed_at: d ? d.toISOString() : null })}
                  disabled={!canEdit}
                  style={{ width: "100%", marginBottom: 6 }}
                />
                {canEdit && (
                  <Space wrap>
                    <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => setPadRole(role)}>
                      {row ? "Re-sign" : "Sign"}
                    </Button>
                    <Upload customRequest={customUpload(role)} showUploadList={false} accept="image/*">
                      <Button size="small" icon={<UploadOutlined />}>
                        Upload
                      </Button>
                    </Upload>
                    {row && (
                      <Popconfirm title="Clear this signature?" onConfirm={() => onClear(role)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <SignaturePadModal
        open={!!padRole}
        title={`Sign - ${ROLES.find((r) => r.value === padRole)?.label ?? ""}`}
        onCancel={() => setPadRole(null)}
        onSave={async (blob) => {
          if (!padRole) return;
          onSignBlob(padRole, blob);
          setPadRole(null);
        }}
      />
    </Card>
  );
};
