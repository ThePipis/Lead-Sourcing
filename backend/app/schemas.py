import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, Field, ConfigDict

class SlotBase(BaseModel):
    slot_number: int = Field(..., ge=1, le=14)
    category_id: int
    category_name: str
    side: str
    slot_type: str
    width_inches: float
    height_inches: float
    price_usd: float
    business_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    status: str = "VACANT"
    logo_url: Optional[str] = None
    offer_headline: Optional[str] = None
    qr_code_url: Optional[str] = None
    short_url: Optional[str] = None
    payment_ref: Optional[str] = None
    scan_count: int = 0

class SlotUpdate(BaseModel):
    business_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    status: Optional[str] = None
    logo_url: Optional[str] = None
    offer_headline: Optional[str] = None
    payment_ref: Optional[str] = None

class SlotResponse(SlotBase):
    id: int
    campaign_id: str
    model_config = ConfigDict(from_attributes=True)

class CampaignBase(BaseModel):
    name: str
    target_city: str = "Eastvale"
    target_zip: str = "92880"
    radius_miles: float = 5.0

class CampaignCreate(CampaignBase):
    pass

class CampaignResponse(CampaignBase):
    id: str
    code: str
    target_households: int
    target_gross_revenue: float
    operating_cost_est: float
    net_margin_est: float
    status: str
    paid_count: int = 0
    total_collected_usd: float = 0.0
    slots: List[SlotResponse] = []
    created_at: datetime.datetime
    model_config = ConfigDict(from_attributes=True)

class LeadResponse(BaseModel):
    id: str
    category_id: int
    category_name: str
    business_name: str
    address: Optional[str] = None
    city: Optional[str] = None
    zip: Optional[str] = None
    phone: Optional[str] = None
    rating: float
    review_count: int
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
    target_count: int = 5000
    mock_mode: bool = True
    synthetic_pool_size: int = 15000

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
