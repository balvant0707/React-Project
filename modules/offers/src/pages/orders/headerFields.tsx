// Ported 1:1 from the NPM tool (app/src/pages/orders/headerFields.tsx).
// The header card of the order page: customer snapshot on the left, order data on the right, MOF stamps below.
import { Card, Col, Form, Input, InputNumber, Row, Select, Tag } from "antd";
import { DateRangeFields } from "../../components/dateRangeFields";
import { RemoteSelect } from "@rbp/ui";
import { fieldLabel } from "@rbp/module-offers/src/fieldLabels.ts";
import { formatDateTime } from "@rbp/ui";
import { CURRENCY_OPTIONS } from "@rbp/ui";
import type { PhraseOption as Option } from "@rbp/core";
import { searchCompanyOptionsWithGroup, loadCompanyOptionsWithGroupByIds } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { searchVesselOptions, loadVesselOptionsByIds } from "@rbp/module-fleet/src/modules/vessels/vessels.ts";
import { searchHullEventOptions, loadHullEventOptionsByIds } from "@rbp/module-fleet/src/modules/hullEvents/hullEvents.ts";

export function OrderHeaderFields(props: {
  order: any;
  isNew: boolean;
  tenantId: string | undefined;
  tenantOptions: Option[];
  supplierOptions: Option[];
  userOptions: Option[];
  countryOptions: Option[];
  incotermOptions: Option[];
  statusOptions: Option[];
  onCustomerCompanyChange: (companyId: string | null) => void;
  onHullEventChange: (hullEventId: string | null) => void;
  onDateRangeQuickFill: () => void;
}) {
  const {
    order,
    isNew,
    tenantId,
    tenantOptions,
    supplierOptions,
    userOptions,
    countryOptions,
    incotermOptions,
    statusOptions,
    onCustomerCompanyChange: handleCustomerCompanyChange,
    onHullEventChange: handleHullEventChange,
    onDateRangeQuickFill: markDirty,
  } = props;
  return (
    <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 8 } }}>
      <Row gutter={32}>
        <Col xs={24} lg={12}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="Customer" name="customer_company_id" tooltip="Selecting a company fills the fields below - still editable after.">
                {/* Scoped to the order's tenant when known; not disabled without one (team_id has no Form.Item on an
                    existing order, so the watch may not see it). */}
                <RemoteSelect
                  loadOptions={(term) => searchCompanyOptionsWithGroup(term, "customer", tenantId)}
                  loadLabels={loadCompanyOptionsWithGroupByIds}
                  onChange={handleCustomerCompanyChange}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={fieldLabel("orders", "customer_name")} name="customer_name">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={fieldLabel("orders", "contact_person")} name="contact_person">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={fieldLabel("orders", "customer_address_line")} name="customer_address_line">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "customer_postal_code")} name="customer_postal_code">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "customer_city")} name="customer_city">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={fieldLabel("orders", "customer_country_id")} name="customer_country_id">
                <Select options={countryOptions} showSearch optionFilterProp="label" allowClear />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={fieldLabel("orders", "customer_telephone")} name="customer_telephone">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Col>

        <Col xs={24} lg={12}>
          <Row gutter={16}>
            {isNew && (
              <Col span={24}>
                <Form.Item
                  label="Hull Event"
                  name="hull_event_id"
                  tooltip="Selecting a hull event fills the Vessel and Customer below - still editable after."
                >
                  <RemoteSelect
                    loadOptions={searchHullEventOptions}
                    loadLabels={loadHullEventOptionsByIds}
                    onChange={handleHullEventChange}
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "order_number")}>
                <Input disabled value={isNew ? "Generated on save" : (order?.order_number ?? "")} />
              </Form.Item>
            </Col>
            <Col span={12}>
              {isNew ? (
                <Form.Item label="Vessel" name="vessel_id" rules={[{ required: true }]}>
                  <RemoteSelect loadOptions={searchVesselOptions} loadLabels={loadVesselOptionsByIds} />
                </Form.Item>
              ) : (
                <Form.Item label="Vessel">
                  <Input disabled value={order?.vessels?.name ?? ""} />
                </Form.Item>
              )}
            </Col>
            {isNew && (
              <Col span={12}>
                <Form.Item label={fieldLabel("orders", "team_id")} name="team_id" rules={[{ required: true }]}>
                  <Select options={tenantOptions} showSearch optionFilterProp="label" />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item label="From Specification">
                <Input
                  disabled
                  value={order?.specifications ? `${order.specifications.specification_number} - v${order.specifications.version}` : "Direct order"}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "status_phrase_id")} name="status_phrase_id" rules={[{ required: true }]}>
                <Select options={statusOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "supplier_id")} name="supplier_id" rules={[{ required: true }]}>
                <Select options={supplierOptions} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "customer_po_number")} name="customer_po_number">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "external_order_reference")} name="external_order_reference">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <DateRangeFields label={fieldLabel("orders", "requested_date")} fromName="requested_date_from" toName="requested_date" onQuickFill={markDirty} />
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "delivery_port")} name="delivery_port">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "incoterm_phrase_id")} name="incoterm_phrase_id">
                <Select options={incotermOptions} showSearch optionFilterProp="label" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "incoterm_place")} name="incoterm_place" tooltip='Named place, e.g. "Rotterdam" for FOB Rotterdam.'>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "currency")} name="currency">
                <Select options={CURRENCY_OPTIONS} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "exchange_rate")} name="exchange_rate">
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "transport_customs_surcharge")} name="transport_customs_surcharge">
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={fieldLabel("orders", "enquiry_number")} name="enquiry_number">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={fieldLabel("orders", "sales_account_user_id")} name="sales_account_user_id">
                <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
              </Form.Item>
            </Col>
          </Row>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          {order?.mof_printed_at && (
            <Tag>MOF printed {formatDateTime(order.mof_printed_at)}</Tag>
          )}
        </Col>
        <Col span={12} style={{ textAlign: "right" }}>
          {order?.mof_sent_at && <Tag color="blue">MOF sent {formatDateTime(order.mof_sent_at)}</Tag>}
        </Col>
      </Row>
    </Card>
  );
}
