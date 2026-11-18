// Ported 1:1 from the NPM tool (app/src/pages/specifications/show.tsx).
// Specification / offer page: view and edit in one, `/specifications/new?hull_event_id=` (DD/NB) or `?vessel_id=`
// (Seastock), `&copy_from=<id>` for "New Version", `&copy_from=<id>&copy_as=new` for "Copy" (own new number). Database access is in specificationApi.ts, rights in
// specificationRules.ts, the derived paint list in paintListRecompute.ts, the PDFs in specificationPdfs.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useRecordSlot } from "@rbp/core";
import { useGetIdentity, useWarnAboutChange } from "@rbp/core";
import { Show } from "@rbp/core";
import { Form, Button, Tabs, Spin, Dropdown, Modal, Tag, Tooltip, App as AntdApp, type MenuProps } from "antd";
import { CheckOutlined, CopyOutlined, FilePdfOutlined, MailOutlined, MoreOutlined, SendOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { usePdfPreview } from "@rbp/module-messaging/src/usePdfPreview.tsx";
import { AvailabilityRequestButton } from "../../components/supplierApiButtons";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { ViewModeFields } from "@rbp/ui";
import { ENTITY_CONFIG } from "@rbp/module-offers/src/entityTypes.ts";
import { usePageBannerTitle } from "@rbp/core";
import { computeLineItem, offerTotals, type LineItemRow } from "./lineItemCalc";
import { AreasEditor, findDftOverMaximum, recomputeAreaProduct, type AreaRow } from "./areasEditor";
import { toDiscountRow, toAreaRow, toLineItemRows, usedPackagingIds, toHeaderFormValues, toHeaderPayload, type DiscountRow } from "./mappers";
import { blankLineItem, newLineKey, recomputeLineItemsFromAreas } from "./paintListRecompute";
import { specificationRules } from "./specificationRules";
import {
  acceptSpecification,
  antifoulingOverwrites,
  createOrderFromSpecification,
  latestOrderId,
  loadCopySource,
  loadDefaultSupplierId,
  loadSpecification,
  markSpecificationSent,
  newSpecificationDraft,
  nextSpecificationNumber,
  nextVersion,
  saveSpecification,
  saveSpecificationValidUntil,
  setSpecificationStatus,
} from "./specificationApi";
import { quotationPdf, technicalSpecPdf } from "./specificationPdfs";
import { useDefaultThinners, usePackagingCatalog } from "./usePackagingCatalog";
import { useSpecificationLookups } from "./useSpecificationLookups";
import { PaintListPanel } from "./PaintListPanel";
import { SpecificationHeaderFields } from "./headerFields";
import { SpecificationStatusActions } from "./statusActions";
import { useSpecificationAvailability } from "./availability";
import { AnswerModalHost, AvailabilityMenuButton, AvailabilityRequestsCard, LineAvailabilityModal } from "./availabilityPanel";
import { LineSelectionModal } from "./lineSelectionModal";
import { SupplierSwitchModal, type SupplierSwitchResult } from "./supplierSwitchModal";
import { ResponsibleHandover } from "../../components/responsibleHandover";
import { TransportPanel } from "../../components/transportPanel";
import { EntityEmailsPanel } from "../../emailBridge/emailBridge";
import { GoodsFlowBand } from "../../components/goodsFlowBand";
import { emptyTrail, OfferOrderPath, OrderLinksButton, useOfferOrderTrail } from "../../components/offerOrderPath";
import { type PhraseOption as Option } from "@rbp/core";
import { useDefaultIncoterm } from "../../modules/phrases/incoterm";
import { useSupplierConnection } from "@rbp/module-companies/src/modules/companies/supplierConnection.ts";
import { startCustomerDocumentEmail, DocumentEmailModal } from "../../emailBridge/emailBridge";
import { loadCompanyOptions, loadCustomerAddressFields } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { usePorts } from "../../components/portSelect";
import { findPackagingByProductCode, loadPackagingsByIds } from "@rbp/module-products/src/modules/products/packagings.ts";
import { searchSpecificationOptions } from "../../modules/products/specificationOptions";
import { RemoteSelect } from "@rbp/ui";
import { confirmAsync } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { formatInstant } from "@rbp/ui";

export const SpecificationShow = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = id === "new";
  // Tabs other modules add to a specification (tasks, ...): RecordSlotItem with Component({ entityId }).
  const slotTabs = useRecordSlot("specifications.tabs");
  const hullEventIdParam = searchParams.get("hull_event_id");
  const vesselIdParam = searchParams.get("vessel_id");
  const copyFromParam = searchParams.get("copy_from");
  // "Copy" (a separate offer with its own number) instead of "New Version".
  const copyAsNew = searchParams.get("copy_as") === "new";
  // A Seastock offer (from a vessel, no hull event) is called "Offer" while it is new.
  const newPageEntityLabel = vesselIdParam ? "Offer" : ENTITY_CONFIG.specifications.label;
  const autoCopyTriggered = useRef(false);
  // The supplier this page set from the delivery country's default (handleLocationCountryChange), if any.
  const defaultedSupplierId = useRef<string | null>(null);
  const { message, modal } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { setWarnWhen } = useWarnAboutChange();

  const [loading, setLoading] = useState(true);
  const [spec, setSpec] = useState<any>(null);
  const [headerForm] = Form.useForm();
  // The offer email being written in the dialog (a shared draft, components/documentEmailModal.tsx).
  const [emailDraftId, setEmailDraftId] = useState<string | null>(null);
  const [markingSent, setMarkingSent] = useState(false);
  // "Copy from…" on a new specification: the content of any other specification (another hull event or vessel too),
  // under this record's own new number.
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);

  const lookups = useSpecificationLookups();
  const { userOptions, tenantOptions, incotermOptions } = lookups;
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const { ports, reload: reloadPorts } = usePorts();
  const portOptions: Option[] = ports.map((p) => ({ value: p.id, label: p.name }));
  const catalog = usePackagingCatalog();
  const { packagings, packagingById, registerPackagings } = catalog;
  useDefaultIncoterm(headerForm, incotermOptions, isNew && !copyFromParam && !loading);
  // Freight cost of the transport (TransportPanel reports it), part of the gross profit.
  const [freightCost, setFreightCost] = useState(0);

  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  // Opens on Header; load() jumps to the content when the specification already has a customer and products.
  const [activeTab, setActiveTab] = useState("header");
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  // Which action the line selection dialog is open for (Accept, or Create Order for DD/NB).
  const [selectionFor, setSelectionFor] = useState<"accept" | "order" | null>(null);
  // The line whose availability modal is open (by row key), and a request whose answer dialog the page opened.
  const [availabilityLineKey, setAvailabilityLineKey] = useState<string | null>(null);
  const [answerRequestId, setAnswerRequestId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => setIsDirty(true);

  const { usesAreaBreakdown, isSeastock, isSentLocked, isLatestVersion, canEdit: canEditSpec, canApprove: canApproveSpec, isEditable } = specificationRules(
    spec,
    isNew,
    hullEventIdParam,
  );

  const availability = useSpecificationAvailability(isNew ? null : id);
  // Reloaded whenever this page changed the spec (status, saved lines) or its availability requests.
  const trailReloadKey = [
    spec?.status,
    spec?.updated_at,
    ...availability.requests.map((r) => `${r.id}:${r.requested_at}:${r.availability_request_lines.filter((l) => l.confirmed_qty != null).length}`),
  ].join("|");
  const trail = useOfferOrderTrail(isNew ? null : id, trailReloadKey);

  // Who submitted / approved / accepted this version and when (stamped by the database).
  const userName = (uid: string | null | undefined) => userOptions.find((u) => u.value === uid)?.label ?? "someone";
  const stampLine = (verb: string, uid: string | null | undefined, at: string | null | undefined) =>
    at ? `${verb} by ${userName(uid)} on ${formatInstant(at, "D MMM YYYY, HH:mm")}` : null;
  const approvalHistoryLines = [
    stampLine("Submitted", spec?.submitted_for_approval_by_user_id, spec?.submitted_for_approval_at),
    stampLine("Approved", spec?.approved_by_user_id, spec?.approved_at),
    stampLine("Accepted", spec?.accepted_by_user_id, spec?.accepted_at),
  ].filter((l): l is string => !!l);

  // React Router reuses this component across `:id` navigations (abc -> new), so the per-id state is reset here.
  useEffect(() => {
    autoCopyTriggered.current = false;
    defaultedSupplierId.current = null;
  }, [id, copyFromParam, copyAsNew]);

  useEffect(() => {
    setWarnWhen(isDirty);
  }, [isDirty, setWarnWhen]);

  // preserve: the surcharge field sits on the Paint List tab, which is not mounted until opened.
  const transportSurcharge = Form.useWatch("transport_customs_surcharge", { form: headerForm, preserve: true });
  const { grossPrice, price: specPrice, priceAfterDiscounts, netSales, totalCost } = offerTotals(lineItems, discounts, transportSurcharge);
  // The Areas editor's Gross / Net toggle (applied at render time only, areaCalc.ts).
  const discountRatio = specPrice > 0 ? priceAfterDiscounts / specPrice : 1;

  // Packagings used by a coat line: their Paint List line is derived from the areas, so PaintListPanel locks its product.
  const areaLinkedPackagingIds = useMemo(() => {
    const set = new Set<string>();
    for (const area of areas) for (const p of area.products) if (p.product_packaging_id) set.add(p.product_packaging_id);
    return set;
  }, [areas]);
  const thinners = useDefaultThinners(areaLinkedPackagingIds, packagingById, usesAreaBreakdown, registerPackagings);

  // Sales prices live only on the Paint List; the coat lines look theirs up by packaging.
  const priceByPackaging = useMemo(() => {
    const map = new Map<string, number>();
    for (const li of lineItems) if (li.product_packaging_id && li.sales_price != null) map.set(li.product_packaging_id, li.sales_price);
    return map;
  }, [lineItems]);

  // A Paint List price change flows into the coat lines. Not on a locked specification: the recompute also takes
  // quantities from the catalog as it is today, which would drift away from what was quoted.
  useEffect(() => {
    if (!isEditable) return;
    setAreas((prev) =>
      prev.map((area) => ({ ...area, products: area.products.map((p) => recomputeAreaProduct(area, p, packagingById, priceByPackaging)) })),
    );
  }, [priceByPackaging, packagingById, isEditable]);

  // Header fields other parts read live; preserve: true where the field may sit in an unmounted tab.
  const tenantId = Form.useWatch("team_id", headerForm);
  const incotermId = Form.useWatch("incoterm_phrase_id", { form: headerForm, preserve: true });
  const incotermCode = incotermOptions.find((o) => o.value === incotermId)?.label.split(" - ")[0] ?? null;
  const flowSupplierId = Form.useWatch("supplier_id", { form: headerForm, preserve: true });
  const flowCustomerCompanyId = Form.useWatch("customer_company_id", { form: headerForm, preserve: true });
  const flowCustomerName = Form.useWatch("customer_name", { form: headerForm, preserve: true });
  const validUntilAt = Form.useWatch("valid_until_at", { form: headerForm, preserve: true });
  // DFT proposal inputs (~/npm_tool/docs/domain-model.md "DFT proposal calculation"): a coat line added before saving uses the
  // values on screen.
  const specSpeed = Form.useWatch("speed", headerForm);
  const specDeliveryDate = Form.useWatch("delivery_date", headerForm);
  const specSeawaterTemperature = Form.useWatch("seawater_temperature", headerForm);
  const specActivityDaysPerYear = Form.useWatch("activity_days_per_year", headerForm);
  const specServicePeriodMonths = Form.useWatch("service_period_months", headerForm);

  // Suppliers are companies with the supplier role at the specification's tenant.
  useEffect(() => {
    if (!tenantId) {
      setSupplierOptions([]);
      return;
    }
    loadCompanyOptions("supplier", tenantId).then(setSupplierOptions);
  }, [tenantId]);

  // Supplier change while lines or coat lines use packagings of the old supplier: the switch dialog
  // (supplierSwitchModal.tsx). The previous supplier is kept in the ref while no dialog is open.
  const lastSupplierId = useRef<string | null>(null);
  const [supplierSwitch, setSupplierSwitch] = useState<{ oldId: string | null; newId: string } | null>(null);
  useEffect(() => {
    if (!supplierSwitch) lastSupplierId.current = flowSupplierId ?? null;
  }, [flowSupplierId, supplierSwitch]);
  const handleSupplierChange = (value: string | undefined) => {
    if (!value || !isEditable) return;
    const usesOtherSupplier = [...lineItems.map((l) => l.product_packaging_id), ...areas.flatMap((a) => a.products.map((p) => p.product_packaging_id))].some(
      (pid) => pid && packagingById.get(pid)?.supplier_id !== value,
    );
    if (usesOtherSupplier) setSupplierSwitch({ oldId: lastSupplierId.current, newId: value });
  };
  const applySupplierSwitch = async ({ mapping, newPackagings }: SupplierSwitchResult) => {
    await registerPackagings(newPackagings);
    const byId = new Map(newPackagings.map((p) => [p.id, p]));
    setLineItems((rows) =>
      rows.map((r) => {
        const to = r.product_packaging_id ? mapping.get(r.product_packaging_id) : undefined;
        if (!to) return r;
        const pkg = byId.get(to)!;
        const cost_price = pkg.cost_price ?? null;
        return { ...r, product_packaging_id: to, cost_price, ...computeLineItem({ ...r, cost_price, pack_size: pkg.pack_size }) };
      }),
    );
    // The coat lines' prices follow the paint list by packaging (the effect on priceByPackaging).
    setAreas((prev) =>
      prev.map((a) => ({
        ...a,
        products: a.products.map((p) => (p.product_packaging_id && mapping.has(p.product_packaging_id) ? { ...p, product_packaging_id: mapping.get(p.product_packaging_id)! } : p)),
      })),
    );
    markDirty();
    setSupplierSwitch(null);
  };

  // A delivery country picked (or taken from a port) sets the tenant's default supplier for it (Configuration >
  // Default suppliers), through the same path as picking the supplier by hand (the switch dialog for lines). Only an
  // empty supplier or one this page set by default is replaced; a supplier picked by hand (or stored) stays.
  const handleLocationCountryChange = async (countryId: string | null) => {
    const current = headerForm.getFieldValue("supplier_id") ?? null;
    if (current && current !== defaultedSupplierId.current) return;
    const supplierId = await loadDefaultSupplierId(headerForm.getFieldValue("team_id"), countryId);
    if (!supplierId || supplierId === current) return;
    if (!supplierOptions.some((o) => o.value === supplierId)) return;
    headerForm.setFieldValue("supplier_id", supplierId);
    defaultedSupplierId.current = supplierId;
    markDirty();
    handleSupplierChange(supplierId);
    message.info(`Supplier set to ${supplierOptions.find((o) => o.value === supplierId)?.label} (default for this country)`);
  };

  const handleCustomerCompanyChange = async (companyId: string | null) => {
    headerForm.setFieldValue("customer_company_id", companyId);
    if (!companyId) return;
    const address = await loadCustomerAddressFields(companyId);
    if (address) headerForm.setFieldsValue(address);
  };

  const load = async () => {
    setLoading(true);
    const specRow = isNew
      ? await newSpecificationDraft({ hullEventId: hullEventIdParam, vesselId: vesselIdParam, userId: identity?.id })
      : await loadSpecification(id as string);
    const rules = specificationRules(specRow, isNew, hullEventIdParam);
    const storedLines: any[] = specRow?.specification_line_items ?? [];
    const storedAreas: any[] = specRow?.specification_areas ?? [];

    setSpec(specRow);
    headerForm.setFieldsValue(toHeaderFormValues(specRow ?? {}));
    // A new specification inherits the hull event's customer: fill the printed address as if it was picked.
    if (isNew && specRow?.customer_company_id) handleCustomerCompanyChange(specRow.customer_company_id);

    // A new DD/NB specification starts with a Technical Service line (TECH-SVC in the seed).
    const wantsTechnicalService = isNew && storedLines.length === 0 && rules.usesAreaBreakdown;
    const [usedPackagings, techServicePkg] = await Promise.all([
      loadPackagingsByIds(usedPackagingIds(storedLines, storedAreas)),
      wantsTechnicalService ? findPackagingByProductCode("TECH-SVC") : Promise.resolve(null),
    ]);
    await catalog.resetPackagings(
      techServicePkg && !usedPackagings.some((p) => p.id === techServicePkg.id) ? [...usedPackagings, techServicePkg] : usedPackagings,
    );
    setLineItems(
      wantsTechnicalService
        ? techServicePkg
          ? [blankLineItem({ sequence: 1, product_packaging_id: techServicePkg.id, cost_price: techServicePkg.cost_price ?? null })]
          : []
        : toLineItemRows(storedLines, storedAreas, false, rules.usesAreaBreakdown),
    );
    setDiscounts((specRow?.specification_discounts ?? []).map((r: any) => toDiscountRow(r, false)));
    setAreas(storedAreas.map((a) => toAreaRow(a, false)));

    if (!isNew) {
      const hasCustomer = !!(specRow?.customer_company_id || specRow?.customer_name);
      const hasProducts = rules.usesAreaBreakdown ? storedAreas.some((a) => (a.specification_area_products ?? []).length > 0) : storedLines.length > 0;
      if (hasCustomer && hasProducts) setActiveTab(rules.usesAreaBreakdown ? "technical" : "paintlist");
    }
    setLoading(false);
    setIsDirty(false);

    // "New Version" / "Copy": copied after the draft above has settled, so the copy's values win.
    if (isNew && copyFromParam && !autoCopyTriggered.current) {
      autoCopyTriggered.current = true;
      await copyFromSpec(copyFromParam, !copyAsNew);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, identity?.id, copyFromParam, copyAsNew]);

  // Copies a source specification into the editor (new keys, no ids); nothing is stored until Save. As a new version
  // it keeps the number with the next version, otherwise it gets a fresh number as version 1.
  const copyFromSpec = async (sourceId: string, asNewVersion: boolean): Promise<boolean> => {
    try {
      const source = await loadCopySource(sourceId);
      if (source.spec) {
        const specificationNumber = asNewVersion ? source.spec.specification_number : await nextSpecificationNumber(hullEventIdParam);
        const version = asNewVersion ? await nextVersion(specificationNumber) : 1;
        headerForm.setFieldsValue({
          ...toHeaderFormValues(source.spec),
          specification_number: specificationNumber,
          version,
          status: "draft",
          printed_at: null,
          // A copy answers a request of its own and gets its own validity; a new version answers the same request.
          ...(asNewVersion ? {} : { request_received_at: null, valid_until_at: null }),
        });
      }
      await registerPackagings(await loadPackagingsByIds(usedPackagingIds(source.lineItems, source.areas)));
      setLineItems(toLineItemRows(source.lineItems, source.areas, true, usesAreaBreakdown));
      setDiscounts(source.discounts.map((d) => toDiscountRow(d, true)));
      setAreas(source.areas.map((a) => toAreaRow(a, true)));
      setIsDirty(true);
      message.success("Copied - review and click Save to create this Specification");
      return true;
    } catch (e: any) {
      message.error(errorText(e, "Could not copy specification"));
      return false;
    }
  };

  // Derives the DD/NB Paint List from the areas and returns it, for callers that need the rows before the next render.
  const recomputePaintList = (): LineItemRow[] => {
    const rows = recomputeLineItemsFromAreas({ areas, lineItems, packagingById, ...thinners });
    setLineItems(rows);
    return rows;
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === "paintlist" && usesAreaBreakdown) recomputePaintList();
  };

  const updateLineItem = (key: string, patch: Partial<LineItemRow>) => {
    markDirty();
    setLineItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const row = { ...r, ...patch };
        const pkg = row.product_packaging_id ? packagingById.get(row.product_packaging_id) : undefined;
        return { ...row, ...computeLineItem({ ...row, pack_size: pkg?.pack_size ?? null }) };
      }),
    );
  };

  const handlePackagingChange = (key: string, packagingId: string) => {
    updateLineItem(key, { product_packaging_id: packagingId, sales_price: null, cost_price: packagingById.get(packagingId)?.cost_price ?? null });
  };

  // `init` is the paint list's blank row turning into a real one (it keeps the blank row's key, so the DOM row and the
  // keyboard focus stay put). A Seastock line is part of the initial request until the first availability request.
  const addLineItem = (init?: { key: string; packagingId: string }) => {
    markDirty();
    const initPkg = init ? packagingById.get(init.packagingId) : undefined;
    setLineItems((rows) => [
      ...rows,
      blankLineItem({
        key: init?.key ?? newLineKey(),
        sequence: rows.length + 1,
        product_packaging_id: init?.packagingId ?? null,
        cost_price: initPkg?.cost_price ?? null,
        is_requested: isSeastock && !availability.hasSentRequest,
      }),
    ]);
  };

  const removeLineItem = (key: string) => {
    markDirty();
    setLineItems((rows) => rows.filter((r) => r.key !== key));
  };

  const addDiscount = () => {
    markDirty();
    setDiscounts((rows) => [...rows, { key: newLineKey(), id: null, name: "", discount_type: "pct", pct: 0, amount: null, sequence: rows.length + 1 }]);
  };
  const removeDiscount = (key: string) => {
    markDirty();
    setDiscounts((rows) => rows.filter((r) => r.key !== key));
  };
  const updateDiscount = (key: string, patch: Partial<DiscountRow>) => {
    markDirty();
    setDiscounts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleAreasChange = (next: AreaRow[]) => {
    markDirty();
    setAreas(next);
  };

  // Resolves whether the save succeeded (the actions that save first need to know).
  const saveAll = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const values = await headerForm.validateFields();
      // DD/NB: the Paint List is derived again, so a save right after an area edit stores current lines.
      const currentLineItems = usesAreaBreakdown ? recomputePaintList() : lineItems;
      const incomplete = currentLineItems.filter((r) => !r.product_packaging_id || r.quantity_product == null || r.quantity_product <= 0);
      if (incomplete.length > 0) {
        throw new Error(`${incomplete.length} line item(s) are missing a product or quantity - fill them in or remove the row before saving.`);
      }
      // A coat DFT above its product's per-coat maximum blocks the save (a database trigger checks it too).
      const dftProblems = findDftOverMaximum(areas, packagingById, catalog.maxDftByProductId);
      if (dftProblems.length > 0) throw new Error(dftProblems.join("; "));

      const specId = await saveSpecification({
        id: isNew ? null : (id as string),
        // net_sales is stored so widgets can sum sales in SQL.
        header: { ...toHeaderPayload(values), net_sales: offerTotals(currentLineItems, discounts, transportSurcharge).netSales },
        hullEventId: hullEventIdParam,
        vesselId: spec?.vessel_id,
        lineItems: currentLineItems,
        discounts,
        areas,
      });
      message.success("Specification saved");
      setIsDirty(false);
      if (isNew) navigate(`/specifications/${specId}`, { replace: true });
      // Awaited: Accept / Create Order open the line selection right after a save and need the saved line ids.
      else await load();
      return true;
    } catch (e: any) {
      // The highlighted field may sit on the Header tab while another tab is open.
      if (e?.errorFields) setActiveTab("header");
      message.error(e?.errorFields ? "Please fix the highlighted fields before saving" : errorText(e, "Could not save"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Actions that work on the stored specification save unsaved changes first, after asking.
  const saveFirst = async (confirm: { title: string; content: string; okText: string }): Promise<boolean> => {
    if (!isDirty) return true;
    if (!(await confirmAsync(modal, confirm))) return false;
    return saveAll(); // saveAll already showed why it failed
  };

  const saveBeforeAvailability = () =>
    saveFirst({
      title: "Save changes before requesting availability?",
      content: "This Specification has unsaved changes. The request is built from the saved version, so it is saved first.",
      okText: "Save and continue",
    });

  const changeStatus = async (
    newStatus: "under_review" | "approved" | "draft",
    opts: { confirmTitle: string; confirmDescription: string; confirmOkText: string; successMessage: string; errorMessage: string },
  ) => {
    if (!(await saveFirst({ title: opts.confirmTitle, content: opts.confirmDescription, okText: opts.confirmOkText }))) return;
    setStatusChanging(true);
    try {
      await setSpecificationStatus(id as string, newStatus);
      message.success(opts.successMessage);
      load();
    } catch (e: any) {
      message.error(errorText(e, opts.errorMessage));
    } finally {
      setStatusChanging(false);
    }
  };

  const requestApproval = () =>
    changeStatus("under_review", {
      confirmTitle: "Save changes before requesting approval?",
      confirmDescription: "This Specification has unsaved changes. Requesting approval locks it from further edits - save first, or they'll be lost.",
      confirmOkText: "Save and request approval",
      successMessage: "Approval requested",
      errorMessage: "Could not request approval",
    });

  const approveSpec = () =>
    changeStatus("approved", {
      confirmTitle: "Save changes before approving?",
      confirmDescription:
        "This Specification has unsaved changes. Approving locks it from further edits (except for Managers) - save first, or they'll be lost.",
      confirmOkText: "Save and approve",
      successMessage: "Specification approved",
      errorMessage: "Could not approve",
    });

  const sendBackToDraft = () =>
    changeStatus("draft", {
      confirmTitle: "Send this Specification back to Draft?",
      confirmDescription: "It becomes freely editable again for whoever has edit rights.",
      confirmOkText: "Send back to Draft",
      successMessage: "Specification sent back to Draft",
      errorMessage: "Could not send back to Draft",
    });

  const accept = async () => {
    const saved = await saveFirst({
      title: "Save changes before accepting?",
      content: "This Specification has unsaved changes. Accepting locks it from further edits - save first, or they'll be lost.",
      okText: "Save and accept",
    });
    if (saved) setSelectionFor("accept");
  };

  // Accepting writes our antifoulings onto the hull event; replacing different ones there is confirmed first.
  const confirmAntifoulingOverwrite = async (): Promise<boolean> => {
    if (!spec?.hull_event_id) return true;
    const changes = await antifoulingOverwrites(spec.hull_event_id, id as string);
    if (changes.length === 0) return true;
    return confirmAsync(modal, {
      title: "Replace the antifouling products on the Hull Event?",
      content: (
        <div>
          <p>The Hull Event already has antifouling products that differ from this Specification:</p>
          <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ),
      okText: "Replace and accept",
    });
  };

  // The customer's choice of lines is stored with the status change; for Seastock accepting creates the order from
  // exactly these lines, and the page goes to it.
  const confirmAccept = async (lineItemIds: string[], packs: Record<string, number>) => {
    setAccepting(true);
    try {
      if (!(await confirmAntifoulingOverwrite())) return;
      await acceptSpecification(id as string, lineItemIds, isSeastock && Object.keys(packs).length > 0 ? packs : null);
      message.success(isSeastock ? "Offer accepted" : "Specification accepted");
      setSelectionFor(null);
      const orderId = isSeastock ? await latestOrderId(id as string) : null;
      if (orderId) navigate(`/orders/${orderId}`);
      else load();
    } catch (e: any) {
      message.error(errorText(e, "Could not accept", { "23505": "Another version of this Specification is already accepted for this Hull Event." }));
    } finally {
      setAccepting(false);
    }
  };

  // DD/NB only (~/npm_tool/docs/order-processing-module.md): an accepted specification can produce several orders, one per
  // delivery. Seastock gets its one order on acceptance. With orders already there, the user confirms that another
  // one is meant (a partial delivery), not a second copy of the first.
  const startCreateOrder = async () => {
    const existing = trail?.orders ?? [];
    if (existing.length > 0) {
      const proceed = await confirmAsync(modal, {
        title: "This specification already has an order",
        content: (
          <div>
            <p>Existing order{existing.length === 1 ? "" : "s"}: {existing.map((o) => `${o.order_number}${o.status_text ? ` (${o.status_text})` : ""}`).join(", ")}.</p>
            <p>Create another order only for a further delivery. The lines already ordered are not deducted automatically.</p>
          </div>
        ),
        okText: "Create another order",
      });
      if (!proceed) return;
    }
    setSelectionFor("order");
  };

  const createOrder = async (lineItemIds: string[], packs: Record<string, number>) => {
    setCreatingOrder(true);
    try {
      const orderId = await createOrderFromSpecification(id as string, lineItemIds, Object.keys(packs).length > 0 ? packs : null);
      message.success("Order created");
      navigate(`/orders/${orderId}`);
    } catch (e: any) {
      message.error(errorText(e, "Could not create order"));
    } finally {
      setCreatingOrder(false);
    }
  };

  const { showPdf, pdfPreviewModal } = usePdfPreview();
  const supplierConnection = useSupplierConnection(spec?.supplier_id);

  const buildTechnicalSpecPdf = () =>
    technicalSpecPdf({
      values: headerForm.getFieldsValue(),
      spec,
      usesAreaBreakdown,
      areas,
      lineItems,
      packagingById,
      tenantOptions,
      areaOptions: lookups.areaOptions,
      areaAfZoneById: lookups.areaAfZoneById,
      substrateOptions: lookups.substrateOptions,
      environmentOptions: lookups.environmentOptions,
      coatModeOptions: lookups.coatModeOptions,
      applicationMethodOptions: lookups.applicationMethodOptions,
      portOptions,
    });

  // DD/NB while editable: the Paint List is derived from the areas first (it may never have been opened). A locked
  // specification prints its stored lines - deriving them again would take today's catalog values.
  const buildQuotationPdf = () =>
    quotationPdf({
      values: headerForm.getFieldsValue(),
      spec,
      usesAreaBreakdown,
      areas,
      lineItems: usesAreaBreakdown && isEditable ? recomputePaintList() : lineItems,
      discounts,
      transportSurcharge,
      packagingById,
      tenantOptions,
      supplierOptions,
      areaOptions: lookups.areaOptions,
      coatModeOptions: lookups.coatModeOptions,
      countryOptions: lookups.countryOptions,
      portOptions,
      incotermOptions,
    });

  // Sent stamp: set when the offer email goes out from the dialog, or by hand ("Mark as sent").
  const setSent = async (sent: boolean) => {
    if (!id) return;
    setMarkingSent(true);
    try {
      await markSpecificationSent(id, sent);
      message.success(sent ? "Marked as sent" : "Sent mark removed");
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not update the sent mark"));
    } finally {
      setMarkingSent(false);
    }
  };

  // The availability response dialog sets the offer's "to be accepted by" moment (also on the form, so a later save
  // keeps it).
  const offerValidUntil =
    !isNew && id && isEditable
      ? {
          value: validUntilAt ? (validUntilAt as dayjs.Dayjs).toISOString() : null,
          save: async (iso: string | null) => {
            await saveSpecificationValidUntil(id, iso);
            headerForm.setFieldValue("valid_until_at", iso ? dayjs(iso) : null);
          },
        }
      : undefined;

  // The offer goes to the customer as an email with the quotation PDF attached, written in a dialog on this page.
  const sendOfferByEmail = async () => {
    if (!identity?.id || !id || !spec) return;
    const saved = await saveFirst({
      title: "Save changes before sending?",
      content: "The email carries the PDF of the offer as it is now, so the changes are saved first.",
      okText: "Save and continue",
    });
    if (!saved) return;
    if (!isSeastock && (spec.status === "draft" || spec.status === "under_review")) {
      const proceed = await confirmAsync(modal, { title: "This offer is not approved yet", content: "Its PDF is marked as a draft. Send it anyway?", okText: "Send anyway" });
      if (!proceed) return;
    }
    const values = headerForm.getFieldsValue();
    const label = isSeastock ? "offer" : "quotation";
    const vessel = spec.vessels?.name;
    const draftId = await startCustomerDocumentEmail(
      {
        userId: identity.id,
        link: { entity_type: "specifications", entity_id: id },
        customerCompanyId: values.customer_company_id,
        contactPerson: values.contact_person,
        subject: `${isSeastock ? "Offer" : "Quotation"} ${spec.specification_number}${vessel ? ` - ${vessel}` : ""}`,
        text: `Please find attached our ${label} ${spec.specification_number}${vessel ? ` for ${vessel}` : ""}.\n\nPlease let us know if you have any questions.`,
        document: { build: buildQuotationPdf },
      },
      { message },
    );
    if (draftId) setEmailDraftId(draftId);
  };

  // Banner: the vessel / hull event the specification belongs to, then its number.
  const specHeadlineContext = [
    spec?.vessels?.name,
    spec?.hull_events?.event_date ? `${spec.hull_events.phrases?.code ?? ""} ${dayjs(spec.hull_events.event_date).format("MM/YYYY")}`.trim() : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const specHeadlineSuffix = isNew
    ? `New ${newPageEntityLabel}`
    : spec
      ? `${isSeastock ? "Offer" : ENTITY_CONFIG.specifications.label}: ${spec.specification_number} - v${spec.version}`
      : undefined;
  usePageBannerTitle(specHeadlineSuffix ? [specHeadlineContext, specHeadlineSuffix].filter(Boolean).join(" / ") : undefined);

  if ((loading && !spec) || !lookups.ready) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  const reportPdfError = (e: any) => {
    console.error("PDF export failed", e);
    message.error(`PDF export failed: ${e?.message ?? e}`);
  };
  const showPdfFile = (build: () => Promise<{ blob: Blob; filename: string }>) =>
    build()
      .then(({ blob, filename }) => showPdf(blob, filename))
      .catch(reportPdfError);

  // Secondary actions of the header, kept out of the button row. "New Version" only from the latest version.
  const canMarkSent = !isNew && isLatestVersion && canEditSpec && ["draft", "under_review", "approved"].includes(spec?.status);
  const moreItems: MenuProps["items"] = [
    ...(!isNew ? [{ key: "send-email", icon: <MailOutlined />, label: isSeastock ? "Send offer by email…" : "Send quotation by email…" }] : []),
    ...(canMarkSent && !spec?.sent_at ? [{ key: "mark-sent", icon: <CheckOutlined />, label: "Mark as sent", disabled: markingSent }] : []),
    // Taking the mark back unlocks a sent Seastock offer, so only approvers may (like "Send back to Draft").
    ...(canMarkSent && spec?.sent_at && (!isSentLocked || canApproveSpec)
      ? [{ key: "unmark-sent", icon: <UndoOutlined />, label: "Remove sent mark", disabled: markingSent }]
      : []),
    ...(!isNew ? [{ key: "quotation", icon: <FilePdfOutlined />, label: usesAreaBreakdown ? "Export Quotation (PDF)" : "Export Offer (PDF)" }] : []),
    ...(!isNew && usesAreaBreakdown ? [{ key: "technical", icon: <FilePdfOutlined />, label: "Export Technical Specification (PDF)" }] : []),
    ...(!isNew && isLatestVersion && canEditSpec ? [{ key: "new-version", icon: <CopyOutlined />, label: "New Version" }] : []),
    ...(!isNew && canEditSpec ? [{ key: "copy", icon: <CopyOutlined />, label: isSeastock ? "Copy as new offer" : "Copy as new specification" }] : []),
    ...(!isNew && spec?.hull_event_id ? [{ key: "hull-event", label: "Edit Hull Event" }] : []),
  ];
  const onMore = (key: string) => {
    if (key === "send-email") sendOfferByEmail().catch((e: any) => message.error(errorText(e, "Could not start the email")));
    else if (key === "mark-sent") modal.confirm({ title: "Mark this offer as sent to the customer?", content: "For an offer sent outside the app (own mail program, portal, ...).", okText: "Mark as sent", onOk: () => setSent(true) });
    else if (key === "unmark-sent")
      modal.confirm({
        title: "Remove the sent mark?",
        content: isSentLocked ? "The offer becomes editable again for everyone with edit rights. What the customer received is not kept - prefer New Version for a changed offer." : undefined,
        okText: "Remove sent mark",
        onOk: () => setSent(false),
      });
    else if (key === "quotation") showPdfFile(buildQuotationPdf);
    else if (key === "technical") showPdfFile(buildTechnicalSpecPdf);
    else if (key === "hull-event") navigate(`/hull-events/${spec.hull_event_id}`);
    else if (key === "new-version" || key === "copy") {
      const base = spec?.hull_event_id ? `/specifications/new?hull_event_id=${spec.hull_event_id}` : `/specifications/new?vessel_id=${spec.vessel_id}`;
      navigate(`${base}&copy_from=${id}${key === "copy" ? "&copy_as=new" : ""}`);
    }
  };

  const paintListContent = (
    <PaintListPanel
      supplierId={flowSupplierId}
      lineItems={lineItems}
      packagings={packagings}
      onPackagingsLoaded={registerPackagings}
      discounts={discounts}
      usesAreaBreakdown={usesAreaBreakdown}
      areaLinkedPackagingIds={areaLinkedPackagingIds}
      disabled={!isEditable}
      grossPrice={grossPrice}
      specPrice={specPrice}
      priceAfterDiscounts={priceAfterDiscounts}
      netSales={netSales}
      totalCost={totalCost}
      freightCost={freightCost}
      onRecomputeFromAreas={recomputePaintList}
      onAddLineItem={addLineItem}
      onPackagingChange={handlePackagingChange}
      onUpdateLineItem={updateLineItem}
      onRemoveLineItem={removeLineItem}
      onAddDiscount={addDiscount}
      onUpdateDiscount={updateDiscount}
      onRemoveDiscount={removeDiscount}
      onMarkDirty={markDirty}
      showRequested={isSeastock}
      availabilityByLineItemId={availability.byLineItemId}
      deliveryDate={specDeliveryDate ? specDeliveryDate.format("YYYY-MM-DD") : (spec?.delivery_date ?? null)}
      userName={userName}
      onEditAvailability={!isNew && canEditSpec ? (record) => setAvailabilityLineKey(record.key) : undefined}
      availabilityEditDisabledReason={(record) =>
        !record.id || isDirty ? "Save the specification first" : !spec?.supplier_id ? "Set the supplier first" : undefined
      }
      availabilityCard={
        <AvailabilityRequestsCard
          requests={availability.requests}
          packagingById={packagingById}
          userName={userName}
          canEdit={!isNew && canEditSpec}
          validUntil={offerValidUntil}
          onChanged={availability.reload}
        />
      }
    />
  );

  const availabilityLine = availabilityLineKey ? lineItems.find((li) => li.key === availabilityLineKey) : undefined;
  const availabilityLinePackaging = availabilityLine?.product_packaging_id ? packagingById.get(availabilityLine.product_packaging_id) : undefined;
  const dialogs = (
    <>
      {pdfPreviewModal}
      {supplierSwitch && (
        <SupplierSwitchModal
          open
          newSupplierId={supplierSwitch.newId}
          newSupplierName={supplierOptions.find((o) => o.value === supplierSwitch.newId)?.label ?? "the new supplier"}
          lineItems={lineItems}
          areas={areas}
          packagingById={packagingById}
          onApply={applySupplierSwitch}
          onSupplierOnly={() => setSupplierSwitch(null)}
          onCancel={() => {
            headerForm.setFieldsValue({ supplier_id: supplierSwitch.oldId ?? undefined });
            setSupplierSwitch(null);
          }}
        />
      )}
      <LineAvailabilityModal
        open={!!availabilityLine}
        lineItemId={availabilityLine?.id ?? null}
        label={availabilityLinePackaging?.label ?? "?"}
        unit={availabilityLinePackaging?.unit ?? ""}
        currentQuantity={availabilityLine?.offered_qty ?? availabilityLine?.quantity_product ?? null}
        availability={availabilityLine?.id ? availability.byLineItemId.get(availabilityLine.id) : undefined}
        onClose={() => setAvailabilityLineKey(null)}
        onSaved={availability.reload}
      />
      <AnswerModalHost
        requestId={answerRequestId}
        requests={availability.requests}
        packagingById={packagingById}
        validUntil={offerValidUntil}
        onClose={() => setAnswerRequestId(null)}
        onSaved={availability.reload}
      />
      <LineSelectionModal
        open={selectionFor !== null}
        title={selectionFor === "order" ? "Create Order - which lines did the customer order?" : "Accept - which lines did the customer accept?"}
        okText={selectionFor === "order" ? "Create Order" : "Accept"}
        description={
          selectionFor === "order"
            ? "The order gets the selected lines."
            : isSeastock
              ? "Accepting locks the offer and creates the order from the selected lines."
              : "Accepting locks the specification. Only one version per Hull Event can be accepted."
        }
        lineItems={lineItems}
        packagingById={packagingById}
        loading={selectionFor === "order" ? creatingOrder : accepting}
        onCancel={() => setSelectionFor(null)}
        editQuantities={selectionFor === "order" || isSeastock}
        onConfirm={(ids, packs) => (selectionFor === "order" ? createOrder(ids, packs) : confirmAccept(ids, packs))}
      />
      <Modal open={copyPickerOpen} title="Copy from which specification?" onCancel={() => setCopyPickerOpen(false)} footer={null} destroyOnHidden>
        <p>The content (lines, discounts, areas, header) is copied into this new {newPageEntityLabel.toLowerCase()}; it keeps its own number.</p>
        <RemoteSelect
          placeholder="Type a specification number or vessel name"
          loadOptions={searchSpecificationOptions}
          allowClear={false}
          onChange={async (v) => {
            if (!v) return;
            setCopyPickerOpen(false);
            await copyFromSpec(v as string, false);
          }}
        />
      </Modal>
      <DocumentEmailModal
        draftId={emailDraftId}
        title={isSeastock ? "Send offer by email" : "Send quotation by email"}
        onClose={() => setEmailDraftId(null)}
        onSent={() => {
          // The sent mark is only possible while the offer is open; an accepted one keeps its stamp.
          if (canMarkSent) setSent(true);
        }}
      />
    </>
  );

  const availabilityActions =
    !isNew && id && spec?.supplier_id ? (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        <AvailabilityRequestButton
          specificationId={id}
          supplierId={spec.supplier_id}
          connection={supplierConnection}
          beforeStart={saveBeforeAvailability}
          onSent={availability.reload}
        />
        {canEditSpec && (
          <AvailabilityMenuButton
            specificationId={id}
            supplierId={spec.supplier_id}
            connectionMethod={supplierConnection?.method ?? null}
            defaultEta={spec.delivery_date ?? null}
            beforeStart={saveBeforeAvailability}
            onChanged={availability.reload}
            onRecordedManual={setAnswerRequestId}
          />
        )}
      </span>
    ) : undefined;

  return (
    <>
      {dialogs}
      <Show
        title={isNew ? `New ${newPageEntityLabel}` : spec ? `${spec.specification_number} - v${spec.version}` : ENTITY_CONFIG.specifications.label}
        isLoading={loading}
        headerButtons={
          <>
            {!isNew && id && (
              <ResponsibleHandover
                entityType="specifications"
                entityId={id}
                responsibleUserId={spec?.responsible_user_id}
                onChanged={load}
                blockedReason={isDirty ? "Save your changes first" : undefined}
              />
            )}
            {isNew && !copyFromParam && (
              <Button icon={<CopyOutlined />} onClick={() => setCopyPickerOpen(true)}>
                Copy from…
              </Button>
            )}
            {spec?.vessel_id && (
              <Button onClick={() => navigate(`/vessels/${spec.vessel_id}`)}>Vessel</Button>
            )}
            {/* The path on top links to the order; only several orders need a menu. */}
            {trail && trail.orders.length > 1 && <OrderLinksButton trail={trail} />}
            {spec?.sent_at && (
              <Tooltip
                title={
                  <>
                    <div>{`Sent by ${userName(spec.sent_by_user_id)} on ${formatInstant(spec.sent_at, "D MMM YYYY, HH:mm")}`}</div>
                    {isSentLocked && <div>Locked: only approvers can change it. Use New Version for a changed offer.</div>}
                  </>
                }
              >
                <Tag icon={<SendOutlined />} color="blue">
                  Sent {formatInstant(spec.sent_at, "DD.MM. HH:mm")}
                </Tag>
              </Tooltip>
            )}
            {/* Orders need a vessel (orders.vessel_id is mandatory): a newbuilding event without one cannot be ordered yet. */}
            {!isNew && spec?.hull_event_id && spec?.vessel_id && spec?.status === "accepted" && (
              <Button onClick={startCreateOrder} loading={creatingOrder} disabled={isDirty}>
                Create Order
              </Button>
            )}
            <SpecificationStatusActions
              status={spec?.status}
              isNew={isNew}
              isLatestVersion={isLatestVersion}
              canEditSpec={canEditSpec}
              canApproveSpec={canApproveSpec}
              usesAreaBreakdown={usesAreaBreakdown}
              isSeastock={isSeastock}
              statusChanging={statusChanging}
              accepting={accepting}
              approvalHistoryLines={approvalHistoryLines}
              onRequestApproval={requestApproval}
              onApprove={approveSpec}
              onSendBackToDraft={sendBackToDraft}
              onAccept={accept}
            />
            {moreItems.length > 0 && (
              <Dropdown menu={{ items: moreItems, onClick: ({ key }) => onMore(key) }}>
                <Button icon={<MoreOutlined />}>More</Button>
              </Dropdown>
            )}
            {isEditable && (
              <Button type="primary" onClick={saveAll} loading={saving}>
                Save
              </Button>
            )}
          </>
        }
      >
        {/* Only once the real trail is loaded (a saved offer), else the bar would flash the unsaved state. */}
        {(isNew || trail) && <OfferOrderPath trail={trail ?? emptyTrail(isSeastock)} availabilityActions={availabilityActions} />}
        <GoodsFlowBand
          supplier={{ name: supplierOptions.find((o) => o.value === flowSupplierId)?.label, companyId: flowSupplierId }}
          ownerAssociate={{ name: tenantOptions.find((o) => o.value === tenantId)?.label }}
          customer={{ name: flowCustomerName, detail: spec?.vessels?.name ? `Vessel ${spec.vessels.name}` : null, companyId: flowCustomerCompanyId }}
        />
        <EntityDetailChrome entityType="specifications" entityId={id} isNew={isNew}>
          <ViewModeFields active={!isEditable}>
            <Form form={headerForm} layout="vertical" disabled={!isEditable} onValuesChange={markDirty}>
              <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                items={[
                  {
                    key: "header",
                    label: "Header",
                    children: (
                      <SpecificationHeaderFields
                        form={headerForm}
                        tenantId={tenantId}
                        tenantOptions={tenantOptions}
                        supplierOptions={supplierOptions}
                        userOptions={userOptions}
                        countryOptions={lookups.countryOptions}
                        incotermOptions={incotermOptions}
                        isSeastock={!usesAreaBreakdown}
                        ports={ports}
                        reloadPorts={reloadPorts}
                        countryContinentById={lookups.countryContinentById}
                        onDateRangeQuickFill={markDirty}
                        onCustomerCompanyChange={handleCustomerCompanyChange}
                        onSupplierChange={handleSupplierChange}
                        onLocationCountryChange={handleLocationCountryChange}
                        requestReceivedRequired={isNew || !!spec?.request_received_at}
                      />
                    ),
                  },
                  ...(usesAreaBreakdown
                    ? [
                        {
                          key: "technical",
                          label: "Technical Spec",
                          children: (
                            <AreasEditor
                              supplierId={flowSupplierId}
                              areas={areas}
                              onChange={handleAreasChange}
                              packagings={packagings}
                              onPackagingsLoaded={registerPackagings}
                              priceByPackaging={priceByPackaging}
                              discountRatio={discountRatio}
                              areaOptions={lookups.areaOptions}
                              areaAfZoneById={lookups.areaAfZoneById}
                              substrateOptions={lookups.substrateOptions}
                              environmentOptions={lookups.environmentOptions}
                              coatModeOptions={lookups.coatModeOptions}
                              applicationMethodOptions={lookups.applicationMethodOptions}
                              defaultApplicationMethodId={lookups.defaultApplicationMethodId}
                              surfacePrepOptions={lookups.surfacePrepOptions}
                              maxDftByProductId={catalog.maxDftByProductId}
                              specHeader={{
                                speed: specSpeed ?? null,
                                seawaterTemperature: specSeawaterTemperature ?? null,
                                activityDaysPerYear: specActivityDaysPerYear ?? null,
                                servicePeriodMonths: specServicePeriodMonths ?? null,
                              }}
                              disabled={!isEditable}
                            />
                          ),
                        },
                      ]
                    : []),
                  { key: "paintlist", label: "Paint List", children: paintListContent },
                  ...(isNew || !id
                    ? []
                    : [
                        {
                          key: "transport",
                          label: "Transportation",
                          forceRender: true,
                          children: (
                            <TransportPanel
                              specificationId={id}
                              disabled={!canEditSpec}
                              currency={headerForm.getFieldValue("currency")}
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
                              entityType="specifications"
                              entityId={id}
                              canEdit={canEditSpec}
                              contactCompanyId={flowSupplierId}
                              subjectHint={spec?.specification_number}
                              documents={[
                                { key: "quotation", label: "Quotation (PDF)", build: buildQuotationPdf },
                                ...(usesAreaBreakdown ? [{ key: "technical", label: "Technical Specification (PDF)", build: buildTechnicalSpecPdf }] : []),
                              ]}
                            />
                          ),
                        },
                      ]),
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
