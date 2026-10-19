from typing import Optional
from pydantic import BaseModel, Field


class ScanFeatures(BaseModel):
    scans_1m: float = Field(ge=0, le=100000)
    scans_10m: float = Field(ge=0, le=100000)
    distinct_ips_10m: float = Field(ge=0, le=100000)
    failed_otp_ratio: float = Field(ge=0, le=1)
    night: float = Field(ge=0, le=1)


class TriageInput(BaseModel):
    symptoms: list[str] = Field(default_factory=list, max_length=20)
    age: Optional[float] = Field(default=None, ge=0, le=120)
    heart_rate: Optional[float] = Field(default=None, ge=0, le=300)
    spo2: Optional[float] = Field(default=None, ge=0, le=100)
    systolic_bp: Optional[float] = Field(default=None, ge=0, le=300)


class GuideContext(BaseModel):
    allergies: list[str] = Field(default_factory=list, max_length=40)
    medications: list[str] = Field(default_factory=list, max_length=60)
    conditions: list[str] = Field(default_factory=list, max_length=40)


class GuideInput(BaseModel):
    scenario: str = Field(min_length=1, max_length=500)
    context: GuideContext = Field(default_factory=GuideContext)


class InteractionInput(BaseModel):
    medications: list[str] = Field(default_factory=list, max_length=60)
    allergies: list[str] = Field(default_factory=list, max_length=40)
