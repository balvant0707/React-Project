// Ported 1:1 from the NPM tool (app/src/pages/specifications/headerFields.tsx).
import { Input, InputNumber, Select, DatePicker, Row, Col, Card, Form, type FormInstance } from "antd";
import { RemoteSelect } from "@rbp/ui";
import { DateRangeFields } from "../../components/dateRangeFields";
import { PortSelect, type Port } from "../../components/portSelect";
import { CONTINENT_OPTIONS } from "@rbp/module-companies/src/modules/countries/continents.ts";
import { CURRENCY_OPTIONS } from "@rbp/ui";
import { loadCompanyOptionsWithGroupByIds, searchCompanyOptionsWithGroup } from "@rbp/module-companies/src/modules/companies/companies.ts";
import type { PhraseOption as Option } from "@rbp/core";
import { DATE_FORMAT } from "@rbp/ui";


type Props = {
  form: FormInstance;
  tenantId: string | undefined;
  tenantOptions: Option[];
  supplierOptions: Option[];
  userOptions: Option[];
  countryOptions: Option[];
  incotermOptions: Option[];
  // Seastock offers have no area/coat calculation, so the DFT inputs below are hidden.
  isSeastock: boolean;
  ports: Port[];
  reloadPorts: () => Promise<void>;
  // countries.continent by country id, to fill the continent when a country is picked.
  countryContinentById: Record<string, string | null>;
  onDateRangeQuickFill: () => void;
  onCustomerCompanyChange: (companyId: string | null) => void;
  onSupplierChange: (value: string | undefined) => void;
  // The delivery country changed (picked, or taken from a port): the page sets the default supplier of that country.
  onLocationCountryChange: (countryId: string | null) => void;
  // Request received is mandatory on new offers (and once set); offers from before the field existed stay saveable.
  requestReceivedRequired: boolean;
};

// The Header tab of a specification: the customer address on the left, everything else on the right.
export const SpecificationHeaderFields = ({
  form,
  tenantId,
  tenantOptions,
  supplierOptions,
  userOptions,
  countryOptions,
  incotermOptions,
  isSeastock,
  ports,
  reloadPorts,
  countryContinentById,
  onDateRangeQuickFill,
  onCustomerCompanyChange,
  onSupplierChange,
  onLocationCountryChange,
  requestReceivedRequired,
}: Props) => {
  // Port, country and continent stay consistent: a port sets its country and continent; a country sets its continent
  // and clears a port of another country; a continent clears both.
  const portCountryId = (portId: string | null | undefined) => ports.find((p) => p.id === portId)?.country_id ?? null;
  const setLocationCountry = (countryId: string | null) => {
    form.setFieldValue("location_country_id", countryId ?? undefined);
    const continent = countryId ? countryContinentById[countryId] : null;
    if (continent) form.setFieldValue("location_continent", continent);
    onLocationCountryChange(countryId);
  };
  return (
        <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 8 } }}>
          {/* Letterhead layout: the customer's address on the left ("To"),
              everything else on the right ("Reference") - like a business
              letter, and matching the same split used in the generated
              Quotation PDF (see pdf/QuotationPdf.tsx). Purely a rearrangement
              of the same fields/names/rules - no behavior change. */}
          <Row gutter={32}>
            <Col xs={24} lg={12}>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label="Customer" name="customer_company_id" tooltip="Selecting a company fills the fields below - still editable after.">
                    {/* Searched on the server as you type (tens of thousands of
                        customers), scoped to this specification's tenant. */}
                    <RemoteSelect
                      disabled={!tenantId}
                      loadOptions={(term) => searchCompanyOptionsWithGroup(term, "customer", tenantId)}
                      loadLabels={loadCompanyOptionsWithGroupByIds}
                      onChange={onCustomerCompanyChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="Contact person (customer)" name="contact_person">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="Customer name" name="customer_name">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="Customer address" name="customer_address_line">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Postal code" name="customer_postal_code">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Customer city" name="customer_city">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="Customer country" name="customer_country_id">
                    <Select options={countryOptions} showSearch optionFilterProp="label" allowClear />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="Customer telephone" name="customer_telephone">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Col>

            <Col xs={24} lg={12}>
              <Row gutter={16}>
                {isSeastock && (
                  <Col span={24}>
                    <Form.Item
                      label="Request received"
                      name="request_received_at"
                      rules={[{ required: requestReceivedRequired, message: "When did the customer's request come in?" }]}
                      tooltip="When the customer's request for quotation came in. The offers list shows the time until the offer was sent."
                    >
                      <DatePicker showTime={{ format: "HH:mm" }} format={`${DATE_FORMAT} HH:mm`} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                )}
                <Col span={12}>
                  <Form.Item
                    label={isSeastock ? "Offer number" : "Specification number"}
                    name="specification_number"
                    rules={[{ required: true }]}
                    tooltip="Auto-assigned - YY-XXXXXX-ZZ (DD/NB, shared with the hull event's Project code) or YY-XXXXXX (Seastock)."
                  >
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Version"
                    name="version"
                    initialValue={1}
                    rules={[{ required: true }]}
                    tooltip="Auto-assigned - next available version for this Hull Event."
                  >
                    <InputNumber style={{ width: "100%" }} min={1} disabled />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Owner Associate" name="team_id" rules={[{ required: true }]}>
                    <Select options={tenantOptions} showSearch optionFilterProp="label" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Supplier" name="supplier_id">
                    <Select options={supplierOptions} showSearch optionFilterProp="label" allowClear onChange={onSupplierChange} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Specification date" name="specification_date">
                    <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Valid until" name="valid_until_at" tooltip="The customer has to accept the offer by this date and time.">
                    <DatePicker showTime={{ format: "HH:mm" }} style={{ width: "100%" }} format={`${DATE_FORMAT} HH:mm`} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <DateRangeFields label="Delivery" fromName="delivery_date_from" toName="delivery_date" toRequired onQuickFill={onDateRangeQuickFill} />
                </Col>
                <Col span={12}>
                  <Form.Item label="Incoterm" name="incoterm_phrase_id">
                    <Select options={incotermOptions} showSearch optionFilterProp="label" allowClear />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Incoterm place" name="incoterm_place" tooltip='Named place, e.g. "Rotterdam" for FOB Rotterdam.'>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Place of application" name="place_of_application">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Port"
                    name="port_id"
                    tooltip="Self-learning list - type a name to add a new port. Particularly relevant for Seastock, which never gets a shipyard assigned."
                  >
                    <PortSelect
                      ports={ports}
                      reloadPorts={reloadPorts}
                      onPortResolved={(port) => {
                        if (port.country_id) {
                          if (port.country_id !== form.getFieldValue("location_country_id")) setLocationCountry(port.country_id);
                        }
                        const continent = port.continent ?? (port.country_id ? countryContinentById[port.country_id] : null);
                        if (continent) form.setFieldValue("location_continent", continent);
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Continent"
                    name="location_continent"
                    tooltip="Where this hull event is happening, at whatever precision is currently known - flows onto the Hull Event on save, without ever overwriting a more precise value already there."
                  >
                    <Select
                      options={CONTINENT_OPTIONS}
                      allowClear
                      onChange={() => {
                        form.setFieldsValue({ location_country_id: undefined, port_id: undefined });
                        onLocationCountryChange(null);
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Country" name="location_country_id">
                    <Select
                      options={countryOptions}
                      showSearch
                      optionFilterProp="label"
                      allowClear
                      onChange={(countryId?: string) => {
                        const portId = form.getFieldValue("port_id");
                        if (portId && portCountryId(portId) !== (countryId ?? null)) form.setFieldValue("port_id", undefined);
                        setLocationCountry(countryId ?? null);
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Currency" name="currency">
                    <Select options={CURRENCY_OPTIONS} allowClear />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Exchange rate" name="exchange_rate">
                    <InputNumber style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                {/* Sea temperature/activity days/service period existed as
                    specifications columns but had no form field anywhere yet -
                    added here since the DFT proposal calculation (Technical
                    Spec tab, ~/npm_tool/docs/domain-model.md) needs all three alongside
                    Speed above; without them it silently proposes nothing. */}
                {!isSeastock && (
                  <>
                    <Col span={12}>
                      <Form.Item label="Speed (knots)" name="speed">
                        <InputNumber style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="Sea temperature (°C)" name="seawater_temperature">
                        <InputNumber style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="Activity days/year" name="activity_days_per_year">
                        <InputNumber style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="Service period (months)" name="service_period_months">
                        <InputNumber style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </>
                )}
                <Col span={24}>
                  <Form.Item label="Sales rep" name="sales_account_user_id">
                    <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
                  </Form.Item>
                </Col>
              </Row>
            </Col>

            <Col span={24}>
              <Form.Item label="Remarks (printed on PDF)" name="remarks_text">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Internal remarks" name="internal_remarks">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
  );
};
