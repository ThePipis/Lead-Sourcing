import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class SlotBase(BaseModel):
    slot_number: int = Field(..., ge=1, le=32)
    category_id: int
    category_name: str
    side: str
    slot_type: str
    width_inches: float
    height_inches: float
    price_usd: float = Field(..., alias="priceUsd")
    avg_ticket_usd: Optional[float] = Field(None, alias="avgTicketUsd")
    business_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    business_address: Optional[str] = Field(None, alias="businessAddress")
    status: str = "VACANT"
    logo_url: Optional[str] = None
    offer_headline: Optional[str] = None
    qr_code_url: Optional[str] = None
    short_url: Optional[str] = None
    payment_ref: Optional[str] = None
    paid_at: Optional[datetime.datetime] = None
    amount_collected_usd: Optional[float] = None
    scan_count: int = 0
    notes: Optional[str] = None
    format: Optional[str] = "SMALL"
    row_span: Optional[int] = Field(1, alias="rowSpan")
    col_span: Optional[int] = Field(1, alias="colSpan")

    model_config = ConfigDict(populate_by_name=True)

class SlotUpdate(BaseModel):
    business_name: Optional[str] = Field(None, alias="businessName")
    contact_person: Optional[str] = Field(None, alias="contactPerson")
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    business_address: Optional[str] = Field(None, alias="businessAddress")
    status: Optional[str] = None
    price_usd: Optional[float] = Field(None, alias="priceUsd")
    avg_ticket_usd: Optional[float] = Field(None, alias="avgTicketUsd")
    logo_url: Optional[str] = Field(None, alias="logoUrl")
    offer_headline: Optional[str] = Field(None, alias="offerHeadline")
    payment_ref: Optional[str] = Field(None, alias="paymentRef")
    paid_at: Optional[datetime.datetime] = Field(None, alias="paidAt")
    amount_collected_usd: Optional[float] = Field(None, alias="amountCollectedUsd")
    scan_count: Optional[int] = Field(None, alias="scanCount")
    slot_type: Optional[str] = Field(None, alias="slotType")
    notes: Optional[str] = None
    format: Optional[str] = None
    row_span: Optional[int] = Field(None, alias="rowSpan")
    col_span: Optional[int] = Field(None, alias="colSpan")

    model_config = ConfigDict(populate_by_name=True)

class SlotResponse(SlotBase):
    id: int
    campaign_id: str
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class CampaignBase(BaseModel):
    name: str
    target_city: str = "Eastvale"
    target_zip: str = "92880"
    radius_miles: float = 5.0

class CampaignCreate(CampaignBase):
    mode: str = "DEMO"
    # Five is enough to prove the pipeline end to end without printing 5,000
    # pieces. The real floor is commercial, not technical, and it belongs to
    # the operator.
    target_households: int = Field(5000, ge=5, le=50000)
    unit_cost_usd: float = Field(0.60, gt=0)

class CampaignResponse(CampaignBase):
    id: str
    code: str
    target_households: int
    target_gross_revenue: float
    operating_cost_est: float
    net_margin_est: float
    status: str
    mode: str = "DEMO"
    unit_cost_usd: float = 0.60
    fixed_cost_usd: float = 0.0
    # The margin the prices are grossed up to, so the interface can preview a
    # reach change with the same arithmetic the backend commits.
    target_margin: float = 0.58
    paid_count: int = 0
    total_collected_usd: float = 0.0
    curated_count: int = 0
    production_at: Optional[datetime.datetime] = None
    mailed_at: Optional[datetime.datetime] = None
    archived_at: Optional[datetime.datetime] = None
    # Households actually covered by the selected carrier routes. Zero until the
    # route engine has run; when set, this is the real size of the drop.
    covered_households: int = 0
    selected_routes: int = 0
    slots: List[SlotResponse] = []
    created_at: datetime.datetime
    model_config = ConfigDict(from_attributes=True)

class CampaignStatusUpdate(BaseModel):
    """
    Advance a campaign through the production phases, or resize the drop.
    Resizing is refused once any slot is paid: the advertiser bought a stated
    reach, so the number they agreed to cannot move underneath them.
    """
    status: Optional[str] = None
    target_households: Optional[int] = Field(None, ge=5, le=50000)
    unit_cost_usd: Optional[float] = Field(None, gt=0)
    # True files the campaign away, False brings it back. Never deletes.
    archived: Optional[bool] = None


class LeadResponse(BaseModel):
    id: str
    category_id: int
    category_name: str
    business_name: str
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    zip: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    # OpenStreetMap has no ratings. A shop nobody has reviewed is a fact about
    # the source, not a zero-star business, so the field stays empty and the
    # interface says so instead of printing a score that was never given.
    rating: Optional[float] = None
    review_count: Optional[int] = None
    website_url: Optional[str] = None
    category: Optional[str] = None
    source: str
    decision_maker: Optional[str] = None
    decision_maker_title: Optional[str] = None
    avg_ticket_estimated: float
    hook_en: Optional[str] = None
    hook_es: Optional[str] = None
    roi_pitch: Optional[str] = None
    status: str
    model_config = ConfigDict(from_attributes=True)

class LeadStatusUpdate(BaseModel):
    status: str # NEW, CONTACTED, REJECTED, WON
    assign_to_slot: Optional[bool] = False

class ProspectingQuery(BaseModel):
    target_city: str = "Eastvale"
    target_zip: str = "92880"
    radius_miles: float = 5.0
    category_id: Optional[int] = None

class HouseholdResponse(BaseModel):
    id: str
    resident_name: str
    street_address: str
    city: str
    state: str
    zip5: str
    zip4: str
    carrier_route: str
    walk_sequence: int
    income_score: float
    home_ownership_score: float
    home_age_years: int
    children_present_score: float
    vehicles_count: int
    pet_owner_score: float
    home_value_score: float
    composite_score: float
    selected_for_drop: bool
    model_config = ConfigDict(from_attributes=True)

class CurationRequest(BaseModel):
    campaign_id: str
    target_count: Optional[int] = None
    mock_mode: bool = True
    synthetic_pool_size: Optional[int] = None
    weights: Optional[List[List[float]]] = None

class CurationSummaryResponse(BaseModel):
    campaign_id: str
    total_analyzed: int
    total_selected: int
    min_score: float
    max_score: float
    avg_score: float
    carrier_route_breakdown: List[Dict[str, object]]
    category_synergies: List[Dict[str, object]]
    histogram: List[Dict[str, object]]
    summary: Optional[Dict[str, Any]] = None
    top_5k: Optional[List[Dict[str, Any]]] = None


class CostSettingsUpdate(BaseModel):
    """Every field optional: the operator edits one line item at a time."""

    postage_per_piece: Optional[float] = Field(None, ge=0)
    list_per_piece: Optional[float] = Field(None, ge=0)
    print_per_piece: Optional[float] = Field(None, ge=0)
    variable_data_per_piece: Optional[float] = Field(None, ge=0)
    presort_per_piece: Optional[float] = Field(None, ge=0)
    finishing_per_piece: Optional[float] = Field(None, ge=0)
    setup_fee: Optional[float] = Field(None, ge=0)
    delivery_fee: Optional[float] = Field(None, ge=0)
    target_margin: Optional[float] = Field(None, ge=0, le=0.95)
    source_note: Optional[str] = None


class CostSettingsResponse(BaseModel):
    mode: str
    postage_per_piece: float
    list_per_piece: float
    print_per_piece: float
    variable_data_per_piece: float
    presort_per_piece: float
    finishing_per_piece: float
    setup_fee: float
    delivery_fee: float
    target_margin: float
    source_note: str
    unit_cost: float
    fixed_cost: float
    preview_households: int
    preview_total_cost: float
    suggested_prices: Dict[int, float]
