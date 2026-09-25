import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    JSON,
)
from sqlalchemy.orm import relationship
from .database import Base

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String(64), primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True)
    name = Column(String(255), nullable=False)
    target_city = Column(String(128), nullable=False, default="Eastvale")
    target_zip = Column(String(10), nullable=False, default="92880")
    radius_miles = Column(Float, default=5.0)
    target_households = Column(Integer, default=5000)
    # Print plus postage per piece. The drop cost is this times the count,
    # so a smaller run genuinely costs less.
    unit_cost_usd = Column(Float, default=0.60)
    target_gross_revenue = Column(Float, default=7264.0)
    operating_cost_est = Column(Float, default=3000.0)
    net_margin_est = Column(Float, default=4264.0)
    status = Column(String(32), default="PROSPECTING") # PROSPECTING, LOCKED_READY, CURATED, IN_PRODUCTION, MAILED
    # DEMO campaigns carry seeded practice data; LIVE ones are real business.
    # The app shows one set or the other, never both mixed together.
    mode = Column(String(8), default="DEMO", index=True)
    production_at = Column(DateTime, nullable=True)
    mailed_at = Column(DateTime, nullable=True)
    # Filed away. The campaign keeps everything it had; it just stops competing
    # for attention in the drawer. Nothing is ever deleted by archiving.
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    slots = relationship("Slot", back_populates="campaign", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="campaign")
    analytics_events = relationship("AnalyticsEvent", back_populates="campaign")


class Slot(Base):
    __tablename__ = "slots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
    slot_number = Column(Integer, nullable=False) # 1 to 32
    category_id = Column(Integer, nullable=False)
    category_name = Column(String(128), nullable=False)
    side = Column(String(8), nullable=False) # FRONT, BACK
    slot_type = Column(String(32), nullable=False) # HERO, STANDARD_FRONT, STANDARD_BACK, MEDIUM_BACK
    width_inches = Column(Float, nullable=False)
    height_inches = Column(Float, nullable=False)
    price_usd = Column(Float, nullable=False)
    avg_ticket_usd = Column(Float, nullable=True)

    business_name = Column(String(255), nullable=True)
    contact_person = Column(String(128), nullable=True)
    phone = Column(String(32), nullable=True)
    email = Column(String(128), nullable=True)
    website = Column(String(255), nullable=True)
    # Street address of the advertiser. Printed under the name so the operator
    # can see it is a real place, and linked to a map so it can be checked.
    business_address = Column(String(255), nullable=True)
    status = Column(String(32), default="VACANT") # VACANT, PROSPECTING, RESERVED, PAID
    logo_url = Column(String(512), nullable=True)
    offer_headline = Column(Text, nullable=True)
    qr_code_url = Column(String(512), nullable=True)
    short_url = Column(String(255), nullable=True)
    payment_ref = Column(String(128), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    amount_collected_usd = Column(Float, nullable=True)
    scan_count = Column(Integer, default=0)

    campaign = relationship("Campaign", back_populates="slots")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(String(64), primary_key=True, index=True)
    campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
    category_id = Column(Integer, nullable=False)
    category_name = Column(String(128), nullable=False)
    business_name = Column(String(255), nullable=False)
    address = Column(String(255), nullable=True)
    city = Column(String(128), nullable=True)
    zip = Column(String(10), nullable=True)
    phone = Column(String(32), nullable=True)
    rating = Column(Float, default=4.5)
    review_count = Column(Integer, default=25)
    source = Column(String(64), default="Yelp Fusion") # Yelp Fusion, Geoapify Places, Firecrawl
    decision_maker = Column(String(128), nullable=True)
    decision_maker_title = Column(String(128), nullable=True)
    avg_ticket_estimated = Column(Float, default=500.0)
    hook_en = Column(Text, nullable=True)
    hook_es = Column(Text, nullable=True)
    roi_pitch = Column(Text, nullable=True)
    status = Column(String(32), default="NEW") # NEW, CONTACTED, REJECTED, WON
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    campaign = relationship("Campaign", back_populates="leads")


class Household(Base):
    __tablename__ = "households"

    id = Column(String(64), primary_key=True, index=True)
    campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
    resident_name = Column(String(128), nullable=False)
    street_address = Column(String(255), nullable=False)
    city = Column(String(128), nullable=False)
    state = Column(String(2), default="CA")
    zip5 = Column(String(5), nullable=False)
    zip4 = Column(String(4), nullable=False)
    carrier_route = Column(String(8), nullable=False) # e.g. C001, C012
    walk_sequence = Column(Integer, nullable=False)

    # Demographic attributes
    income_score = Column(Float, nullable=False)
    home_ownership_score = Column(Float, nullable=False)
    home_age_years = Column(Integer, nullable=False)
    home_age_score = Column(Float, nullable=False)
    children_present_score = Column(Float, nullable=False)
    vehicles_count = Column(Integer, nullable=False)
    vehicles_score = Column(Float, nullable=False)
    pet_owner_score = Column(Float, nullable=False)
    home_value_score = Column(Float, nullable=False)

    # Propensity results
    match_scores_json = Column(JSON, nullable=True)
    composite_score = Column(Float, default=0.0)
    selected_for_drop = Column(Boolean, default=False)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id = Column(String(64), primary_key=True, index=True)
    campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
    slot_number = Column(Integer, nullable=False)
    business_name = Column(String(255), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    device_type = Column(String(32), default="Mobile")
    city = Column(String(128), default="Eastvale")
    user_agent = Column(Text, nullable=True)
    ip_hash = Column(String(64), nullable=True)
    client_ip = Column(String(64), nullable=True)

    campaign = relationship("Campaign", back_populates="analytics_events")


class CostSettings(Base):
    """
    What the drop actually costs us, per mode.

    The mail house quotes these line items separately, so they are stored
    separately: a change to any one of them re-derives the unit cost, the drop
    cost and the suggested price of every slot. DEMO and LIVE keep their own
    row, because the practice file uses published USPS retail rates while the
    real one uses the quote our mail house gave us.
    """

    __tablename__ = "cost_settings"

    mode = Column(String(8), primary_key=True)  # DEMO | LIVE

    # Per piece, in USD.
    postage_per_piece = Column(Float, default=0.260)
    list_per_piece = Column(Float, default=0.0)
    print_per_piece = Column(Float, default=0.0)
    variable_data_per_piece = Column(Float, default=0.0)
    presort_per_piece = Column(Float, default=0.0)
    finishing_per_piece = Column(Float, default=0.0)

    # Charged once per drop regardless of size, in USD.
    setup_fee = Column(Float, default=0.0)
    delivery_fee = Column(Float, default=0.0)

    # Share of revenue we intend to keep, 0-0.95. Drives suggested slot prices.
    target_margin = Column(Float, default=0.58)

    # Free-text note: who quoted this, and when.
    source_note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class RagDocument(Base):
    """
    One document the assistant can quote from: the shipped operating manual, or
    anything the operator uploads. Seeded documents are replaced on startup when
    their file changes; uploaded ones are only ever touched by the operator.
    """

    __tablename__ = "rag_documents"

    id = Column(String(64), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    # SEED for what ships with the app, UPLOAD for what the operator adds.
    origin = Column(String(16), default="UPLOAD", index=True)
    source = Column(String(512), nullable=True)
    char_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    chunks = relationship("RagChunk", back_populates="document", cascade="all, delete-orphan")


class RagChunk(Base):
    """A passage of a document, sized to be quoted whole into a prompt."""

    __tablename__ = "rag_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(String(64), ForeignKey("rag_documents.id"), nullable=False, index=True)
    ordinal = Column(Integer, nullable=False)
    # The heading trail the passage sits under, kept so an answer can cite it.
    heading = Column(String(255), nullable=True)
    text = Column(Text, nullable=False)

    document = relationship("RagDocument", back_populates="chunks")


class DataSourceSetting(Base):
    """
    Whether one data source is switched on, per world.

    Only the switch lives here. What each source is, what it costs and what it
    can deliver is code (routers/datasources.py): that is knowledge about the
    integration, not something the operator edits.
    """

    __tablename__ = "data_sources"

    mode = Column(String(8), primary_key=True)      # DEMO | LIVE
    source_id = Column(String(32), primary_key=True)
    enabled = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class CampaignRoute(Base):
    """
    A carrier route considered for one campaign, and whether it is in the drop.

    This is the campaign's audience. For a saturation drop there is no household
    list to store — the carrier delivers to every box on the route — so the
    selected routes and their official counts *are* the audience, and the sum of
    their residential counts is what the print run and the postage are billed on.
    """

    __tablename__ = "campaign_routes"

    campaign_id = Column(String(64), ForeignKey("campaigns.id"), primary_key=True)
    route_id = Column(String(16), primary_key=True)   # ZIP_CRID, e.g. 92880R052
    zip_code = Column(String(10), nullable=False)
    crid = Column(String(8), nullable=False)
    route_type = Column(String(4), default="R")
    city_state = Column(String(64), default="")
    residential = Column(Integer, default=0)
    business = Column(Integer, default=0)
    median_income = Column(Float, default=0.0)
    avg_household_size = Column(Float, default=0.0)
    score = Column(Float, default=0.0)
    facility = Column(String(64), default="")
    # Whether the census pass contributed to this route's score.
    census_enriched = Column(Boolean, default=False)
    selected = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
