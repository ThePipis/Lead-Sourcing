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
    target_gross_revenue = Column(Float, default=7264.0)
    operating_cost_est = Column(Float, default=3000.0)
    net_margin_est = Column(Float, default=4264.0)
    status = Column(String(32), default="PROSPECTING") # PROSPECTING, LOCKED_READY, CURATED, IN_PRODUCTION
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    slots = relationship("Slot", back_populates="campaign", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="campaign")
    analytics_events = relationship("AnalyticsEvent", back_populates="campaign")


class Slot(Base):
    __tablename__ = "slots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
    slot_number = Column(Integer, nullable=False) # 1 to 14
    category_id = Column(Integer, nullable=False)
    category_name = Column(String(128), nullable=False)
    side = Column(String(8), nullable=False) # FRONT, BACK
    slot_type = Column(String(32), nullable=False) # HERO, STANDARD_FRONT, STANDARD_BACK, MEDIUM_BACK
    width_inches = Column(Float, nullable=False)
    height_inches = Column(Float, nullable=False)
    price_usd = Column(Float, nullable=False)

    business_name = Column(String(255), nullable=True)
    contact_person = Column(String(128), nullable=True)
    phone = Column(String(32), nullable=True)
    email = Column(String(128), nullable=True)
    website = Column(String(255), nullable=True)
    status = Column(String(32), default="VACANT") # VACANT, PROSPECTING, RESERVED, PAID
    logo_url = Column(String(512), nullable=True)
    offer_headline = Column(Text, nullable=True)
    qr_code_url = Column(String(512), nullable=True)
    short_url = Column(String(255), nullable=True)
    payment_ref = Column(String(128), nullable=True)
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

    campaign = relationship("Campaign", back_populates="analytics_events")
