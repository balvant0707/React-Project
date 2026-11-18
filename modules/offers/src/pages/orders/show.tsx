// Ported 1:1 from the NPM tool (app/src/pages/orders/show.tsx).
// Order page: view and edit in one (`/orders/:id`, `/orders/new` for a direct order). Database access is in
// orderApi.ts, the line type and prices in orderLines.ts, the PDFs' data in pdfExport.ts; header card, lines grid and
// the discounts / totals cards are components of their own.
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRecordSlot } from "@rbp/core";
import { useGetIdentity, useWarnAboutChange } from "@rbp/core";
import { Show } from "@rbp/core";
import { Form, Button, Dropdown, type MenuProps, Tag, Spin, Tabs, App as AntdApp } from "antd";
import { DeleteOutlined, FilePdfOutlined, SendOutlined, MoreOutlined, MailOutlined } from "@ant-design/icons";
import { pdf } from "@react-pdf/renderer";
import { usePdfPreview } from "@rbp/module-messaging/src/usePdfPreview.tsx";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { ViewModeFields } from "@rbp/ui";
import { ENTITY_CONFIG } from "@rbp/module-offers/src/entityTypes.ts";
import { usePageBannerTitle } from "@rbp/core";
import { ResponsibleHandover } from "../../components/responsibleHandover";
import { TransportPanel } from "../../components/transportPanel";
import { EntityEmailsPanel } from "../../emailBridge/emailBridge";
import { GoodsFlowBand } from "../../components/goodsFlowBand";
import { DiscountsAndTotals } from "../../components/dealTotals";
import { loadPhraseOptions, type PhraseOption as Option } from "@rbp/core";
import { useDefaultIncoterm } from "../../modules/phrases/incoterm";
import { loadCompanyOptions, loadCustomerAddressFields } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadDefaultTenantId, loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { countryOptions as toCountryOptions, loadCountries } from "@rbp/module-companies/src/modules/countries/countries.ts";
import { loadTenantOptions } from "@rbp/module-companies/src/modules/tenants/tenants.ts";
import { loadPackagingsByIds } from "@rbp/module-products/src/modules/products/packagings.ts";
import type { PackagingInfo } from "../specifications/areasEditor";
import { toDiscountRow, toHeaderPayload, type DiscountRow } from "../specifications/mappers";
import { SendOrderToSupplierButton } from "../../components/supplierApiButtons";
import { MofPdf } from "../../pdf/MofPdf";
import { QuotationPdf } from "../../pdf/QuotationPdf";
import { startCustomerDocumentEmail, DocumentEmailModal } from "../../emailBridge/emailBridge";
import { buildMofPdfData, buildOrderConfirmationPdfData } from "./pdfExport";
import { ORDER_STATUS_COLOR, type OrderStatusCode } from "./statusColor";
import { emptyTrail, OfferOrderPath, useOfferOrderTrail } from "../../components/offerOrderPath";
import { errorText } from "@rbp/core";
import { formatNumber } from "@rbp/ui";
import { newRowKey } from "@rbp/ui";
import dayjs from "dayjs";
import { deleteOrder as softDeleteOrder, loadHullEventDefaults, loadOrder, loadOrderStatuses, saveOrder, stampOrder } from "./orderApi";
import { orderTotals, type OrderLineRow } from "./orderLines";
import { OrderHeaderFields } from "./headerFields";
import { OrderLinesTable } from "./orderLinesTable";

const ORDER_DATE_FIELDS = ["requested_date_from", "requested_date"] as const;

export const OrderShow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const isNew = id === "new";
  // Tabs other modules add to an order (tasks, ...).
  const slotTabs = useRecordSlot("orders.tabs");
  const { data: identity } = useGetIdentity<{ id: string }>();

  const { setWarnWhen } = useWarnAboutChange();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [headerForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  // Tabs as on the offer page; an existing order opens on its lines.
  const [activeTab, setActiveTab] = useState(isNew ? "header" : "lines");
  const [emailDraftId, setEmailDraftId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => setIsDirty(true);

  useEffect(() => {
    setWarnWhen(isDirty);
  }, [isDirty, setWarnWhen]);

  const [statuses, setStatuses] = useState<Awaited<ReturnType<typeof loadOrderStatuses>>>({ options: [], codeById: new Map(), confirmedId: null });
  const [tenantOptions, setTenantOptions] = useState<Option[]>([]);
  const [incotermOptions, setIncotermOptions] = useState<Option[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  useEffect(() => {
    loadPhraseOptions("incoterm").then(setIncotermOptions);
  }, []);
  useDefaultIncoterm(headerForm, incotermOptions, isNew && !loading);
  const [packagings, setPackagings] = useState<PackagingInfo[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);

  const packagingById = useMemo(() => new Map(packagings.map((p) => [p.id, p])), [packagings]);
  const registerPackagings = (list: PackagingInfo[]) => {
    setPackagings((prev) => {
      const known = new Set(prev.map((p) => p.id));
      const added = list.filter((p) => !known.has(p.id));
      return added.length ? [...prev, ...added] : prev;
    });
  };

  const orderSurcharge = Form.useWatch("transport_customs_surcharge", { form: headerForm, preserve: true }) ?? 0;
  const totals = orderTotals(lines, discounts, orderSurcharge);
  // Freight cost of the transport (TransportPanel reports it); the surcharge is what the customer pays for it.
  const [freightCost, setFreightCost] = useState(0);
  const incotermId = Form.useWatch("incoterm_phrase_id", { form: headerForm, preserve: true });
  const incotermCode = incotermOptions.find((o) => o.value === incotermId)?.label.split(" - ")[0] ?? null;

  // Header fields other parts read live (the goods flow band, the supplier list of the tenant).
  const tenantId = Form.useWatch("team_id", headerForm);
  const flowSupplierId = Form.useWatch("supplier_id", { form: headerForm, preserve: true });
  const flowCustomerCompanyId = Form.useWatch("customer_company_id", { form: headerForm, preserve: true });
  const flowCustomerName = Form.useWatch("customer_name", { form: headerForm, preserve: true });
  useEffect(() => {
    if (!tenantId) {
      setSupplierOptions([]);
      return;
    }
    loadCompanyOptions("supplier", tenantId).then(setSupplierOptions);
  }, [tenantId]);

  // A picked company fills the customer fields (still editable afterwards), as on the specification.
  const handleCustomerCompanyChange = async (companyId: string | null) => {
    headerForm.setFieldValue("customer_company_id", companyId);
    if (!companyId) return;
    const address = await loadCustomerAddressFields(companyId);
    if (!address) return;
    headerForm.setFieldsValue(address);
    markDirty();
  };

  // A picked hull event fills the vessel and the customer (still editable afterwards).
  const handleHullEventChange = async (hullEventId: string | null) => {
    headerForm.setFieldValue("hull_event_id", hullEventId);
    if (!hullEventId) return;
    const hullEvent = await loadHullEventDefaults(hullEventId);
    if (!hullEvent) return;
    headerForm.setFieldValue("vessel_id", hullEvent.vessel_id);
    if (hullEvent.customer_company_id) await handleCustomerCompanyChange(hullEvent.customer_company_id);
    markDirty();
  };

  const load = async () => {
    setLoading(true);
    const [loadedStatuses, countries, tenants] = await Promise.all([loadOrderStatuses(), loadCountries(), loadTenantOptions()]);
    setStatuses(loadedStatuses);
    setCountryOptions(toCountryOptions(countries));
    setTenantOptions(tenants);
    loadUserOptions().then(setUserOptions);

    if (isNew) {
      const defaultTenantId = await loadDefaultTenantId(identity?.id);
      setOrder(null);
      headerForm.resetFields();
      headerForm.setFieldsValue({ currency: "EUR", status_phrase_id: loadedStatuses.confirmedId, team_id: defaultTenantId });
      setLines([]);
      setDiscounts([]);
      setLoading(false);
      setIsDirty(false);
      return;
    }

    let row: any;
    try {
      row = await loadOrder(id as string);
    } catch (e) {
      message.error(errorText(e, "Could not load this order"));
      setLoading(false);
      return;
    }
    setOrder(row);
    const values: Record<string, any> = { ...row };
    for (const f of ORDER_DATE_FIELDS) values[f] = row?.[f] ? dayjs(row[f]) : null;
    headerForm.setFieldsValue(values);
    // Read here as well: team_id has no Form.Item on an existing order, so the watch above may not fire.
    if (row?.team_id) loadCompanyOptions("supplier", row.team_id).then(setSupplierOptions);

    const storedLines: any[] = row?.order_lines ?? [];
    registerPackagings(await loadPackagingsByIds(storedLines.map((r) => r.product_packaging_id).filter(Boolean)));
    setLines(
      storedLines.map((r) => ({
        key: r.id,
        id: r.id,
        sequence: r.sequence,
        product_packaging_id: r.product_packaging_id,
        ordered_qty: r.ordered_qty,
        ordered_packs: r.ordered_packs,
        sales_price: r.sales_price,
        discount_pct: r.discount_pct,
        cost_price: r.cost_price,
      })),
    );
    setDiscounts((row?.order_discounts ?? []).map((d: any) => toDiscountRow(d, false)));
    setLoading(false);
    setIsDirty(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, identity?.id]);

  useEffect(() => {
    setActiveTab(isNew ? "header" : "lines");
  }, [id, isNew]);

  const updateLine = (key: string, patch: Partial<OrderLineRow>) => {
    markDirty();
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const removeLine = (key: string) => {
    markDirty();
    setLines((rows) => rows.filter((r) => r.key !== key));
  };

  const addDiscount = () => {
    markDirty();
    setDiscounts((rows) => [...rows, { key: newRowKey("discount"), id: null, name: "", discount_type: "pct", pct: 0, amount: null, sequence: rows.length + 1 }]);
  };
  const removeDiscount = (key: string) => {
    markDirty();
    setDiscounts((rows) => rows.filter((r) => r.key !== key));
  };
  const updateDiscount = (key: string, patch: Partial<DiscountRow>) => {
    markDirty();
    setDiscounts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const values = await headerForm.validateFields();
      const incomplete = lines.filter((r) => !r.product_packaging_id || r.ordered_packs == null || r.ordered_packs <= 0);
      if (incomplete.length > 0) {
        throw new Error(`${incomplete.length} order line(s) are missing a product or quantity - fill them in or remove the row before saving.`);
      }
      // The joined rows read with the order are no columns of it.
      const { vessels, specifications, supplier, order_lines, order_discounts, ...columns } = values;
      void [vessels, specifications, supplier, order_lines, order_discounts];
      const header = toHeaderPayload(columns, ORDER_DATE_FIELDS);
      const orderId = await saveOrder({ id: isNew ? null : (id as string), header, lines, discounts });
      message.success(isNew ? "Order created" : "Order saved");
      setIsDirty(false);
      if (isNew) {
        // The route guard reads the flag before the effect above clears it.
        setWarnWhen(false);
        navigate(`/orders/${orderId}`, { replace: true });
      } else {
        load();
      }
    } catch (e: any) {
      if (e?.errorFields) setActiveTab("header");
      message.error(e?.errorFields ? "Please fix the highlighted fields before saving" : errorText(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const { showPdf, pdfPreviewModal } = usePdfPreview();

  const buildMofPdf = async () => {
    const data = buildMofPdfData({ values: headerForm.getFieldsValue(), order, lines, packagingById, countryOptions, incotermOptions });
    const blob = await pdf(<MofPdf data={data} />).toBlob();
    return { blob, filename: `MOF-${order?.order_number ?? id}.pdf` };
  };

  // The terms and conditions are the first phrase of their category (as on the quotation).
  const buildConfirmationPdf = async () => {
    const termsAndConditionsText = (await loadPhraseOptions("terms_and_conditions"))[0]?.label ?? null;
    const data = buildOrderConfirmationPdfData({
      values: headerForm.getFieldsValue(),
      order,
      lines,
      discounts,
      packagingById,
      tenantOptions,
      countryOptions,
      incotermOptions,
      termsAndConditionsText,
    });
    const blob = await pdf(<QuotationPdf data={data} />).toBlob();
    return { blob, filename: `Order-Confirmation-${order?.order_number ?? id}.pdf` };
  };

  // The order confirmation goes to the customer as an email draft with its PDF attached.
  const sendConfirmationByEmail = async () => {
    if (!identity?.id || !id || !order) return;
    if (isDirty) {
      message.warning("Save your changes first: the confirmation is built from the saved order.");
      return;
    }
    const values = headerForm.getFieldsValue();
    const reference = values.customer_po_number ? ` (your reference ${values.customer_po_number})` : "";
    const vessel = order.vessels?.name;
    const draftId = await startCustomerDocumentEmail(
      {
        userId: identity.id,
        link: { entity_type: "orders", entity_id: id },
        customerCompanyId: values.customer_company_id,
        contactPerson: values.contact_person,
        subject: `Order confirmation ${order.order_number}${vessel ? ` - ${vessel}` : ""}`,
        text: `Thank you for your order${reference}. Please find attached our order confirmation ${order.order_number}${vessel ? ` for ${vessel}` : ""}.`,
        document: { build: buildConfirmationPdf },
      },
      { message },
    );
    if (draftId) setEmailDraftId(draftId);
  };

  // The first MOF export stamps it as printed.
  const exportMof = async () => {
    const { blob, filename } = await buildMofPdf();
    showPdf(blob, filename);
    if (!order?.mof_printed_at) {
      await stampOrder(id as string, "mof_printed_at").catch(() => undefined);
      load();
    }
  };

  const markMofSent = async () => {
    setMarkingSent(true);
    try {
      await stampOrder(id as string, "mof_sent_at");
      message.success("MOF marked as sent");
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not update"));
    } finally {
      setMarkingSent(false);
    }
  };

  const deleteOrder = async () => {
    setDeleting(true);
    try {
      await softDeleteOrder(id as string);
      message.success("Order deleted");
      navigate("/orders");
    } catch (e: any) {
      message.error(errorText(e, "Could not delete this order"));
    } finally {
      setDeleting(false);
    }
  };

  const isDeleted = !!order?.deleted_at;
  const trail = useOfferOrderTrail(isNew ? null : order?.specification_id, order?.status_phrase_id);
  const currentStatusCode = order?.status_phrase_id ? (statuses.codeById.get(order.status_phrase_id) as OrderStatusCode | undefined) : undefined;
  const currentStatusLabel = statuses.options.find((o) => o.value === order?.status_phrase_id)?.label;
  // Only a confirmed order may be deleted.
  const canDelete = !isNew && !isDeleted && statuses.confirmedId != null && order?.status_phrase_id === statuses.confirmedId;

  // Secondary actions of the header, kept out of the button row (the offer is one click away on the path on top).
  const moreItems: MenuProps["items"] = [
    ...(!isNew && !isDeleted ? [{ key: "confirm-email", icon: <MailOutlined />, label: "Send order confirmation by email…" }] : []),
    ...(!isNew && !isDeleted ? [{ key: "confirm-pdf", icon: <FilePdfOutlined />, label: "Export Order Confirmation (PDF)" }] : []),
    ...(!isNew && !isDeleted ? [{ key: "mof", icon: <FilePdfOutlined />, label: "Export MOF (PDF)" }] : []),
    ...(!isDeleted && order?.mof_printed_at && !order?.mof_sent_at
      ? [{ key: "mof-sent", icon: <SendOutlined />, label: "Mark MOF as sent", disabled: markingSent }]
      : []),
    ...(canDelete ? [{ type: "divider" as const }, { key: "delete", icon: <DeleteOutlined />, label: "Delete order", danger: true, disabled: deleting }] : []),
  ];
  const reportPdfError = (e: any) => message.error(`PDF export failed: ${e?.message ?? e}`);
  const onMore = (key: string) => {
    if (key === "confirm-email") sendConfirmationByEmail().catch((e: any) => message.error(errorText(e, "Could not start the email")));
    else if (key === "confirm-pdf") buildConfirmationPdf().then(({ blob, filename }) => showPdf(blob, filename)).catch(reportPdfError);
    else if (key === "mof") exportMof().catch(reportPdfError);
    else if (key === "mof-sent") modal.confirm({ title: "Mark this MOF as sent to the supplier?", onOk: markMofSent });
    else if (key === "delete")
      modal.confirm({ title: "Delete this order?", content: "This can't be undone from here.", okText: "Delete", okButtonProps: { danger: true }, onOk: deleteOrder });
  };

  usePageBannerTitle(
    isNew
      ? `New ${ENTITY_CONFIG.orders.label}`
      : order
        ? `${ENTITY_CONFIG.orders.label}: ${order.order_number ?? ""} - ${order.vessels?.name ?? "?"}${order.specifications ? ` (from ${order.specifications.specification_number} - v${order.specifications.version})` : ""}`
        : undefined,
  );

  if (loading && !isNew && !order) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <>
      {pdfPreviewModal}
      <DocumentEmailModal draftId={emailDraftId} title="Send order confirmation by email" onClose={() => setEmailDraftId(null)} />
    <Show
      title={order ? `Order ${order.order_number} - ${order.vessels?.name ?? "?"}` : ENTITY_CONFIG.orders.label}
      isLoading={loading}
      headerButtons={
        <>
          {/* <Show>'s own title prop is forced off (see components/crud.tsx -
              PageBanner/usePageBannerTitle renders the real plain-text title
              instead), so the status/deleted tags go here, in headerButtons,
              the nearest thing to "next to the header" that's actually
              rendered. */}
          {currentStatusCode && <Tag color={ORDER_STATUS_COLOR[currentStatusCode]}>{currentStatusLabel}</Tag>}
          {isDeleted && <Tag color="red">Deleted</Tag>}
          {order?.vessel_id && <Button onClick={() => navigate(`/vessels/${order.vessel_id}`)}>Vessel</Button>}
          {!isNew && id && !isDeleted && (
            <ResponsibleHandover
              entityType="orders"
              entityId={id}
              responsibleUserId={order?.responsible_user_id}
              onChanged={load}
              blockedReason={isDirty ? "Save your changes first" : undefined}
            />
          )}
          {!isNew && !isDeleted && order && (
            <SendOrderToSupplierButton orderId={order.id} supplierId={order.supplier_id} onSent={load} dirty={isDirty} />
          )}
          {(moreItems?.length ?? 0) > 0 && (
            <Dropdown menu={{ items: moreItems, onClick: ({ key }) => onMore(key) }}>
              <Button icon={<MoreOutlined />}>More</Button>
            </Dropdown>
          )}
          {!isDeleted && (
            <Button type="primary" onClick={saveAll} loading={saving}>
              Save
            </Button>
          )}
        </>
      }
    >
      {(isNew || trail || (order && !order.specification_id)) && (
      <OfferOrderPath trail={trail ?? emptyTrail(false)} currentOrderId={isNew ? undefined : id} orderPage />
      )}
      <GoodsFlowBand
        supplier={{ name: supplierOptions.find((o) => o.value === flowSupplierId)?.label ?? order?.supplier?.name, companyId: flowSupplierId }}
        ownerAssociate={{ name: tenantOptions.find((o) => o.value === (tenantId ?? order?.team_id))?.label }}
        customer={{ name: flowCustomerName, detail: order?.vessels?.name ? `Vessel ${order.vessels.name}` : null, companyId: flowCustomerCompanyId }}
      />
      <EntityDetailChrome entityType="orders" entityId={id} isNew={isNew}>
        <ViewModeFields active={isDeleted}>
        <Form form={headerForm} layout="vertical" onValuesChange={markDirty} disabled={isDeleted}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: "header",
                label: "Header",
                // Rendered while hidden: the header fields belong to the form (validation, watches).
                forceRender: true,
                children: (
                  <OrderHeaderFields
                    order={order}
                    isNew={isNew}
                    tenantId={tenantId}
                    tenantOptions={tenantOptions}
                    supplierOptions={supplierOptions}
                    userOptions={userOptions}
                    countryOptions={countryOptions}
                    incotermOptions={incotermOptions}
                    statusOptions={statuses.options}
                    onCustomerCompanyChange={handleCustomerCompanyChange}
                    onHullEventChange={handleHullEventChange}
                    onDateRangeQuickFill={markDirty}
                  />
                ),
              },
              {
                key: "lines",
                label: "Order Lines",
                forceRender: true,
                children: (
                  <>
                    <OrderLinesTable
                      lines={lines}
                      packagingById={packagingById}
                      onPackagingsFound={registerPackagings}
                      onAddLine={(line) => {
                        markDirty();
                        setLines((rows) => [...rows, line]);
                      }}
                      onUpdateLine={updateLine}
                      onRemoveLine={removeLine}
                      disabled={isDeleted}
                    />
                    <DiscountsAndTotals
                      discounts={discounts}
                      onAddDiscount={addDiscount}
                      onUpdateDiscount={updateDiscount}
                      onRemoveDiscount={removeDiscount}
                      totals={totals}
                      freightCost={freightCost}
                      priceLabel="Order price"
                      surcharge={formatNumber(orderSurcharge)}
                      disabled={isDeleted}
                    />
                  </>
                ),
              },
              ...(!isNew && id
                ? [
                    {
                      key: "transport",
                      label: "Transportation",
                      // Reports the freight cost for the totals, so it is mounted from the start.
                      forceRender: true,
                      children: (
                        <TransportPanel
                          specificationId={order?.specification_id}
                          orderId={id}
                          disabled={isDeleted}
                          currency={order?.currency}
                          incotermCode={incotermCode}
                          onCostChange={setFreightCost}
                        />
                      ),
                    },
                    {
                      key: "emails",
                      label: "Emails",
                      children: (
                        <EntityEmailsPanel
                          entityType="orders"
                          entityId={id}
                          canEdit={!isDeleted}
                          contactCompanyId={flowSupplierId}
                          subjectHint={order?.order_number}
                          documents={[
                            { key: "confirmation", label: "Order confirmation (PDF)", build: buildConfirmationPdf },
                            { key: "mof", label: "MOF (PDF)", build: buildMofPdf },
                          ]}
                        />
                      ),
                    },
                  ]
                : []),
              ...(!isNew && id ? slotTabs.map((t) => ({ key: t.key, label: t.label, children: t.Component ? <t.Component entityId={id} /> : null })) : []),
            ]}
          />
        </Form>
        </ViewModeFields>
      </EntityDetailChrome>
    </Show>
    </>
  );
};
