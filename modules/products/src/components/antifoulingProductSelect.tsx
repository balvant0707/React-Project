// Ported 1:1 from the NPM tool (app/src/components/antifoulingProductSelect.tsx).
import { useCallback, useEffect, useState } from "react";
import { Form, Modal, Select, Input, App as AntdApp } from "antd";
import type { FormInstance } from "antd";
import { supabaseClient } from "@rbp/core";
import type { PhraseOption as Option } from "@rbp/core";
import { errorText } from "@rbp/core";

export type AntifoulingProduct = { id: string; name: string; supplier_id: string; supplier_name: string };

// Same normalization as antifouling_products.name_normalized, so the client
// can spot a duplicate before the unique index does.
export const normalizeProductName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export const SUPPLIER_FIELD = "supplier_this_hullevent_id";
export const AF_PRODUCT_FIELDS = ["vertical_af_product_id", "flat_bottom_af_product_id"] as const;

export const useAntifoulingProducts = () => {
  const [products, setProducts] = useState<AntifoulingProduct[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabaseClient
      .from("antifouling_products")
      .select("id, name, supplier_id, companies(name)")
      .order("name");
    setProducts(
      (data ?? []).map((p: any) => ({ id: p.id, name: p.name, supplier_id: p.supplier_id, supplier_name: p.companies?.name ?? "?" })),
    );
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { products, reload };
};

const ADD_PREFIX = "__add__:";

type Props = {
  // Injected by Form.Item
  value?: string | null;
  onChange?: (value: string | null) => void;
  form: FormInstance;
  // Which of the two AF fields this instance is; the other one is cleared when a
  // supplier change makes its product invalid.
  fieldName: (typeof AF_PRODUCT_FIELDS)[number];
  products: AntifoulingProduct[];
  reloadProducts: () => Promise<void>;
  supplierOptions: Option[];
  // Called after this component wrote a new supplier into the form.
  onSupplierSet?: (supplierId: string) => void;
};

/**
 * Searches ALL suppliers' antifouling products (supplier shown in each option).
 * - supplier empty: picking a product fills the supplier
 * - supplier differs: asks before overriding the supplier (cancel = no change)
 * - "Add" creates a product under a chosen supplier (asked in a dialog,
 *   pre-filled with the hull event's supplier)
 */
export const AntifoulingProductSelect = ({ value, onChange, form, fieldName, products, reloadProducts, supplierOptions, onSupplierSet }: Props) => {
  const { message, modal } = AntdApp.useApp();
  const [search, setSearch] = useState("");
  const [addName, setAddName] = useState<string | null>(null);
  const [addSupplierId, setAddSupplierId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const otherField = AF_PRODUCT_FIELDS.find((f) => f !== fieldName)!;

  const supplierName = (id: string) => supplierOptions.find((o) => o.value === id)?.label ?? products.find((p) => p.supplier_id === id)?.supplier_name ?? "?";

  const apply = (product: AntifoulingProduct, clearOther: boolean) => {
    const patch: Record<string, unknown> = { [SUPPLIER_FIELD]: product.supplier_id, [fieldName]: product.id };
    if (clearOther) patch[otherField] = undefined;
    form.setFieldsValue(patch);
    onSupplierSet?.(product.supplier_id);
    onChange?.(product.id);
  };

  const select = (product: AntifoulingProduct) => {
    const currentSupplier: string | undefined = form.getFieldValue(SUPPLIER_FIELD);
    if (!currentSupplier || currentSupplier === product.supplier_id) {
      apply(product, false);
      return;
    }
    const otherProduct = products.find((p) => p.id === form.getFieldValue(otherField));
    const clearOther = !!otherProduct && otherProduct.supplier_id !== product.supplier_id;
    modal.confirm({
      title: "Change supplier?",
      content:
        `"${product.name}" belongs to ${product.supplier_name}. Change the supplier from ${supplierName(currentSupplier)} to ${product.supplier_name}?` +
        (clearOther ? ` The other antifouling product "${otherProduct!.name}" (${otherProduct!.supplier_name}) will be cleared.` : ""),
      okText: "Change supplier",
      onOk: () => apply(product, clearOther),
    });
  };

  const handleChange = (val: string | undefined) => {
    if (!val) {
      onChange?.(null);
      return;
    }
    if (val.startsWith(ADD_PREFIX)) {
      setAddName(val.slice(ADD_PREFIX.length));
      setAddSupplierId(form.getFieldValue(SUPPLIER_FIELD) ?? undefined);
      return;
    }
    const product = products.find((p) => p.id === val);
    if (product) select(product);
  };

  const confirmAdd = async () => {
    const name = addName?.trim();
    if (!name || !addSupplierId) return;
    setAdding(true);
    try {
      const existing = products.find((p) => p.supplier_id === addSupplierId && normalizeProductName(p.name) === normalizeProductName(name));
      if (existing) {
        message.info(`"${existing.name}" already exists for this supplier - selected it.`);
        setAddName(null);
        select(existing);
        return;
      }
      const { data, error } = await supabaseClient.from("antifouling_products").insert({ supplier_id: addSupplierId, name }).select("id").single();
      if (error) throw error;
      await reloadProducts();
      setAddName(null);
      select({ id: data.id, name, supplier_id: addSupplierId, supplier_name: supplierName(addSupplierId) });
    } catch (e: any) {
      message.error(errorText(e, "Could not add product"));
    } finally {
      setAdding(false);
    }
  };

  const trimmed = search.trim();
  const hasExactMatch = products.some((p) => normalizeProductName(p.name) === normalizeProductName(trimmed));
  const options = [
    ...products.map((p) => ({ value: p.id, label: `${p.name} (${p.supplier_name})` })),
    ...(trimmed && !hasExactMatch ? [{ value: ADD_PREFIX + trimmed, label: `Add "${trimmed}" as new product` }] : []),
  ];

  return (
    <>
      <Select
        value={value ?? undefined}
        options={options}
        showSearch
        allowClear
        optionFilterProp="label"
        onSearch={setSearch}
        onBlur={() => setSearch("")}
        onChange={handleChange}
        placeholder="Search products of any supplier"
      />
      <Modal
        title="Add antifouling product"
        open={addName !== null}
        onOk={confirmAdd}
        onCancel={() => setAddName(null)}
        okText="Add"
        okButtonProps={{ disabled: !addName?.trim() || !addSupplierId, loading: adding }}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="Product name" required>
            <Input value={addName ?? ""} onChange={(e) => setAddName(e.target.value)} />
          </Form.Item>
          <Form.Item label="Supplier" required>
            <Select options={supplierOptions} value={addSupplierId} onChange={setAddSupplierId} showSearch optionFilterProp="label" placeholder="Select supplier" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
