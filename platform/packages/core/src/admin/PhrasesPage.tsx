// The phrases page of both apps (docs/shared-parts.md C1), from COMPASS app/src/pages/admin/phrases/list.tsx. Changed:
// imports, texts under admin.phrases.*, German only where the app offers it, stored in translations.de.
import { useEffect, useState } from "react";
import { List } from "../kit/crud";
import { Table, Button, Modal, Form, Input, Select, Popconfirm, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { supabaseClient } from "../supabase";
import { useTranslation } from "react-i18next";
import { errorText } from "../errors";
import { getAppLanguages } from "../i18n";

type Phrase = {
  id: string;
  category: string;
  code: string | null;
  text_en: string;
  text_de: string | null;
  translations?: Record<string, string> | null;
  sequence: number;
};

export const PhrasesPage = () => {
  const { t } = useTranslation();
  // The German text only where the app offers German (RADAR is English only).
  const german = getAppLanguages().includes("de");
  const [categories, setCategories] = useState<string[]>([]);
  const { message } = AntdApp.useApp();
  const [category, setCategory] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Phrase | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.from("phrases").select("category");
      const distinct = Array.from(new Set((data ?? []).map((r) => r.category))).sort();
      setCategories(distinct);
      setCategory((current) => current || distinct[0] || "");
    })();
  }, [phrases.length]);

  const load = async (cat: string) => {
    setLoading(true);
    const { data } = await supabaseClient.from("phrases").select("*").eq("category", cat).order("sequence");
    // Platform: the German text is translations.de (COMPASS column text_de).
    setPhrases((data ?? []).map((p) => ({ ...p, text_de: p.translations?.de ?? null })));
    setLoading(false);
  };

  useEffect(() => {
    if (category) load(category);
    else setLoading(false);
  }, [category]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: category ? [category] : [] });
    setModalOpen(true);
  };

  const openEdit = (phrase: Phrase) => {
    setEditing(phrase);
    form.setFieldsValue({ ...phrase, category: [phrase.category] });
    setModalOpen(true);
  };

  const save = async () => {
    const raw = await form.validateFields().catch(() => null);
    if (!raw) return;
    const values = { ...raw, category: Array.isArray(raw.category) ? raw.category[0] : raw.category };
    try {
      if (editing) {
        const { error } = await supabaseClient
          .from("phrases")
          .update({ category: values.category, code: values.code, text_en: values.text_en, translations: german ? { ...editing.translations, de: values.text_de || undefined } : editing.translations })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: maxRow } = await supabaseClient
          .from("phrases")
          .select("sequence")
          .eq("category", values.category)
          .order("sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSequence = (maxRow?.sequence ?? 0) + 1;
        const { text_de, ...rest } = values;
        const { error } = await supabaseClient.from("phrases").insert({ ...rest, translations: text_de ? { de: text_de } : {}, sequence: nextSequence });
        if (error) throw error;
      }
      setModalOpen(false);
      // setCategory's own useEffect reloads when the category actually
      // changed; when it didn't, nothing else would trigger a refetch.
      if (values.category === category) load(category);
      else setCategory(values.category);
    } catch (e: any) {
      message.error(errorText(e));
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("phrases").delete().eq("id", id);
    if (error) {
      message.error(errorText(error));
      return;
    }
    load(category);
  };

  const move = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= phrases.length) return;
    const a = phrases[index];
    const b = phrases[targetIndex];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabaseClient.from("phrases").update({ sequence: b.sequence }).eq("id", a.id),
      supabaseClient.from("phrases").update({ sequence: a.sequence }).eq("id", b.id),
    ]);
    if (e1 || e2) {
      message.error(errorText(e1 ?? e2));
      return;
    }
    load(category);
  };

  return (
    <List
      headerButtons={
        <>
          <Select
            style={{ minWidth: 240 }}
            options={categories.map((c) => ({ value: c, label: c }))}
            value={category || undefined}
            onChange={setCategory}
          />
          <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>
            {t("admin.phrases.new")}
          </Button>
        </>
      }
    >
      <Table dataSource={phrases} rowKey="id" loading={loading} pagination={false}>
        <Table.Column dataIndex="code" title={t("admin.phrases.code")} width={160} />
        <Table.Column dataIndex="text_en" title={t("admin.phrases.textEn")} />
        <Table.Column
          title={t("admin.phrases.order")}
          width={90}
          render={(_, __, index) => (
            <>
              <Button icon={<ArrowUpOutlined />} type="text" size="small" disabled={index === 0} onClick={() => move(index, -1)} />
              <Button
                icon={<ArrowDownOutlined />}
                type="text"
                size="small"
                disabled={index === phrases.length - 1}
                onClick={() => move(index, 1)}
              />
            </>
          )}
        />
        <Table.Column
          title={t("admin.phrases.actions")}
          width={100}
          render={(_, record: Phrase) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
              <Popconfirm title={t("admin.phrases.deleteConfirm")} onConfirm={() => remove(record.id)}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>

      <Modal open={modalOpen} title={editing ? t("admin.phrases.edit") : t("admin.phrases.new")} onCancel={() => setModalOpen(false)} onOk={save}>
        <Form form={form} layout="vertical">
          <Form.Item label={t("admin.phrases.category")} name="category" rules={[{ required: true }]}>
            <Select mode="tags" maxCount={1} options={categories.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item label={t("admin.phrases.code")} name="code">
            <Input />
          </Form.Item>
          <Form.Item label={t("admin.phrases.textEn")} name="text_en" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          {german && (
            <Form.Item label={t("admin.phrases.textDe")} name="text_de">
              <Input.TextArea rows={2} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </List>
  );
};
