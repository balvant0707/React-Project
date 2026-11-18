// Ported 1:1 from COMPASS (app/src/pages/people/personForm.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Button, DatePicker, Form, Input, Modal, Select, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { shrinkImage } from "@rbp/module-messaging/src/lib/image.ts";
import { personName, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";
import { useCanEditPeople, usePeople, usePersonPrivate } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { usersFor } from "@rbp/core";
import { errorText } from "@rbp/core";

type FormValues = {
  name: string;
  position?: string;
  email?: string;
  site?: string;
  phone_office?: string;
  phone_mobile?: string;
  hire_date?: Dayjs | null;
  exit_date?: Dayjs | null;
  birth_date?: Dayjs | null;
  supervisor_user_id?: string | null;
  deputy_user_id?: string | null;
};

const blank = (v?: string | null) => (v?.trim() ? v.trim() : null);

export const usePeopleRefresh = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["people"] });
    void queryClient.invalidateQueries({ queryKey: ["directory"] });
    void queryClient.invalidateQueries({ queryKey: ["person-private"] });
  };
};

// Photos are written by HR (people.edit) only, to the private bucket under <person id>/avatar-<timestamp>.
export const PersonPhotoUpload = ({ person }: { person: Pick<PersonRow, "id"> }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = usePeopleRefresh();

  const upload = async ({ file, onSuccess, onError }: UploadRequestOption) => {
    try {
      const blob = await shrinkImage(file as File, 640, 0.85);
      // A new path per upload: signed URLs are cached by path, so a changed photo shows at once.
      const path = `${person.id}/avatar-${Date.now()}`;
      const { error: uploadError } = await supabaseClient.storage.from("avatars").upload(path, blob, { contentType: blob.type || undefined });
      if (uploadError) throw uploadError;
      const { data: before } = await supabaseClient.from("users").select("photo_url").eq("id", person.id).maybeSingle();
      const { error } = await supabaseClient.from("users").update({ photo_url: path }).eq("id", person.id);
      if (!error && before?.photo_url && before.photo_url !== path && !/^https?:/.test(before.photo_url)) {
        await supabaseClient.storage.from("avatars").remove([before.photo_url]);
      }
      if (error) throw error;
      onSuccess?.({});
      message.success(t("people.photoUpdated"));
      refresh();
    } catch (e) {
      onError?.(e as Error);
      message.error(errorText(e));
    }
  };

  return (
    <Upload customRequest={upload} showUploadList={false} accept="image/*">
      <Button icon={<UploadOutlined />}>{t("people.changePhoto")}</Button>
    </Upload>
  );
};

// Create (no person) or edit a person. The full birth date and the exit date live in person_private; the directory only shows day and month.
export const PersonFormModal = ({ open, person, onClose, onSaved }: { open: boolean; person?: PersonRow | null; onClose: () => void; onSaved?: (id: string) => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const { data: people } = usePeople();
  // Birth and exit date are HR's (people.edit); a user manager (users.manage) adds people without them.
  const canPrivate = useCanEditPeople();
  const { data: privateData } = usePersonPrivate(person?.id, open && canPrivate);
  const refresh = usePeopleRefresh();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      name: person?.name ?? "",
      position: person?.position ?? undefined,
      email: person?.email ?? undefined,
      site: person?.site ?? undefined,
      phone_office: person?.phone_office ?? undefined,
      phone_mobile: person?.phone_mobile ?? undefined,
      hire_date: person?.hire_date ? dayjs(person.hire_date) : null,
      supervisor_user_id: person?.supervisor_user_id ?? null,
      deputy_user_id: person?.deputy_user_id ?? null,
    });
  }, [open, person, form]);
  useEffect(() => {
    if (!open) return;
    form.setFieldValue("birth_date", privateData?.birth_date ? dayjs(privateData.birth_date) : null);
    form.setFieldValue("exit_date", privateData?.exit_date ? dayjs(privateData.exit_date) : null);
  }, [open, privateData, form]);

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      const row = {
        name: values.name.trim(),
        position: blank(values.position),
        site: blank(values.site),
        phone_office: blank(values.phone_office),
        phone_mobile: blank(values.phone_mobile),
        hire_date: values.hire_date ? values.hire_date.format("YYYY-MM-DD") : null,
        supervisor_user_id: values.supervisor_user_id ?? null,
        deputy_user_id: values.deputy_user_id ?? null,
        // The e-mail of an account is the login: only a person without one has it edited here.
        ...(person?.has_login ? {} : { email: blank(values.email) }),
      };
      let id = person?.id;
      if (id) {
        const { error } = await supabaseClient.from("users").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from("users").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      const birth = values.birth_date ? values.birth_date.format("YYYY-MM-DD") : null;
      const exit = values.exit_date ? values.exit_date.format("YYYY-MM-DD") : null;
      if (!canPrivate) {
        // Nothing private to write.
      } else if (birth || exit) {
        const { error } = await supabaseClient.from("person_private").upsert({ user_id: id, birth_date: birth, exit_date: exit });
        if (error) throw error;
      } else if (person) {
        const { error } = await supabaseClient.from("person_private").delete().eq("user_id", id);
        if (error) throw error;
      }
      refresh();
      message.success(t("people.saved"));
      onSaved?.(id!);
      onClose();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  // A locked person is offered as supervisor or deputy only where already set.
  const others = usersFor(people, [person?.supervisor_user_id, person?.deputy_user_id].filter((id): id is string => !!id))
    .filter((p) => p.id !== person?.id)
    .map((p) => ({ value: p.id, label: personName(p) }));

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} destroyOnClose width={640} title={person ? t("people.editPerson") : t("people.addPerson")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true }]}>
          <Input maxLength={120} />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 16 }}>
          <Form.Item name="position" label={t("fields.position")}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="site" label={t("people.site")}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="email" label={t("fields.email")} extra={person?.has_login ? t("people.emailLocked") : undefined} rules={[{ type: "email" }]}>
            <Input disabled={person?.has_login} />
          </Form.Item>
          <Form.Item name="hire_date" label={t("people.hireDate")}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          {canPrivate ? (
            <Form.Item name="exit_date" label={t("people.exitDate")} extra={t("people.exitDateHint")}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          ) : <span />}
          <span />
          <Form.Item name="phone_office" label={t("people.phoneOffice")}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="phone_mobile" label={t("people.phoneMobile")}>
            <Input maxLength={40} />
          </Form.Item>
          {canPrivate ? (
            <Form.Item name="birth_date" label={t("people.birthDate")} extra={t("people.birthDateHint")}>
              <DatePicker style={{ width: "100%" }} disabledDate={(d) => d.isAfter(dayjs())} />
            </Form.Item>
          ) : <span />}
          <span />
          <Form.Item name="supervisor_user_id" label={t("people.supervisor")}>
            <Select allowClear showSearch optionFilterProp="label" options={others} />
          </Form.Item>
          <Form.Item name="deputy_user_id" label={t("people.deputy")}>
            <Select allowClear showSearch optionFilterProp="label" options={others} />
          </Form.Item>
        </div>
        {person ? <PersonPhotoUpload person={person} /> : <span style={{ opacity: 0.65 }}>{t("people.photoAfterSave")}</span>}
      </Form>
    </Modal>
  );
};
