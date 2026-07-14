"""공용 API 요청·응답 스키마."""

from __future__ import annotations

import json
import re
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
CONTACT_PATTERN = re.compile(r"^(?:02-\d{3,4}-\d{4}|0\d{2}-\d{3,4}-\d{4})$")
Category = Literal["lift", "equipment", "clothing", "safety"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NoticeFileOut(StrictModel):
    id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=0, le=10 * 1024 * 1024)
    mimeType: Literal["application/pdf", "image/png", "image/jpeg", "image/webp"]
    downloadUrl: str = Field(pattern=r"^/api/notices/[1-9][0-9]*/files/[1-9][0-9]*$")


class NoticeOut(StrictModel):
    id: int
    tag: str
    title: str
    date: str
    body: str
    pinned: bool
    files: list[NoticeFileOut] = Field(default_factory=list)


class NoticePage(StrictModel):
    items: list[NoticeOut]
    page: int
    pageSize: int
    total: int
    totalPages: int


class CatalogItemOut(StrictModel):
    id: str
    name: str
    desc: str
    price: int
    discountGeneral: int
    discountAffiliate: int
    hidden: bool


class CatalogOut(StrictModel):
    lift: list[CatalogItemOut]
    equipment: list[CatalogItemOut]
    clothing: list[CatalogItemOut]
    safety: list[CatalogItemOut]


class DiscountRuleOut(StrictModel):
    enabled: bool
    type: Literal["percent", "fixed"]
    value: int


class DiscountConfigOut(StrictModel):
    general: DiscountRuleOut
    affiliate: DiscountRuleOut
    keywords: list[str]


class EstimateLine(StrictModel):
    group: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=100)
    qty: int = Field(ge=1, le=1_000)
    subtotal: str = Field(default="", max_length=50)
    subtotalValue: int | None = Field(default=None, ge=0, le=100_000_000)
    cat: Category | None = None
    itemId: str | None = Field(default=None, max_length=100)


class EstimatePayload(StrictModel):
    tripInfo: str = Field(default="", max_length=500)
    affiliateType: Literal["none", "affiliate"] = "none"
    affiliateName: str = Field(default="", max_length=100)
    lines: list[EstimateLine] = Field(default_factory=list, max_length=100)
    total: str = Field(default="", max_length=50)
    totalValue: int | None = Field(default=None, ge=0, le=100_000_000)
    email: str = Field(default="", max_length=254)
    createdAt: str = Field(default="", max_length=40)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if value and not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("이메일 형식이 올바르지 않습니다.")
        return value


class InquiryCreate(StrictModel):
    name: str = Field(min_length=1, max_length=50)
    contact: str = Field(min_length=1, max_length=30)
    email: str = Field(default="", max_length=254)
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(default="", max_length=5_000)
    secret: bool = True
    password: str = Field(default="", max_length=64)
    estimate: EstimatePayload | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if value and not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("이메일 형식이 올바르지 않습니다.")
        return value

    @field_validator("contact")
    @classmethod
    def validate_contact(cls, value: str) -> str:
        if not CONTACT_PATTERN.fullmatch(value):
            raise ValueError("연락처 형식이 올바르지 않습니다.")
        return value

    @model_validator(mode="after")
    def validate_content_and_password(self) -> Self:
        if not self.content and self.estimate is None:
            raise ValueError("문의 내용 또는 견적 정보가 필요합니다.")
        if self.secret and len(self.password) < 4:
            raise ValueError("비밀글 비밀번호는 4자 이상이어야 합니다.")
        if self.estimate is not None:
            encoded = json.dumps(self.estimate.model_dump(mode="json"), ensure_ascii=False)
            if len(encoded.encode("utf-8")) > 50_000:
                raise ValueError("견적 정보가 허용 크기를 초과했습니다.")
        return self


class InquiryCreated(StrictModel):
    id: int
    date: str
    status: Literal["답변대기", "답변완료"]


class InquirySummary(StrictModel):
    id: int
    title: str
    date: str
    status: Literal["답변대기", "답변완료"]
    secret: bool
    name: str


class InquiryPage(StrictModel):
    items: list[InquirySummary]
    page: int
    pageSize: int
    total: int
    totalPages: int


class InquiryDetail(InquirySummary):
    content: str
    answer: str


class InquiryPassword(StrictModel):
    password: str = Field(min_length=1, max_length=64)


class AdminLogin(StrictModel):
    loginId: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class AdminSessionOut(StrictModel):
    loginId: str
    expiresAt: str


class AdminNoticeInput(StrictModel):
    tag: str = Field(default="공지", max_length=30)
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=20_000)
    pinned: bool = False


class AdminInquiryOut(StrictModel):
    id: int
    title: str
    content: str
    name: str
    contact: str
    email: str
    secret: bool
    status: Literal["답변대기", "답변완료"]
    answer: str
    estimate: EstimatePayload | None
    date: str
    answeredAt: str | None


class AdminInquiryPage(StrictModel):
    items: list[AdminInquiryOut]
    page: int
    pageSize: int
    total: int
    totalPages: int


class AdminInquiryUpdate(StrictModel):
    answer: str = Field(default="", max_length=20_000)
    status: Literal["답변대기", "답변완료"]


class AdminCatalogItemInput(StrictModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    desc: str = Field(default="", max_length=500)
    price: int = Field(ge=0, le=100_000_000)
    discountGeneral: int = Field(default=0, ge=0, le=100_000_000)
    discountAffiliate: int = Field(default=0, ge=0, le=100_000_000)
    hidden: bool = False


class AdminCatalogItemUpdate(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    desc: str = Field(default="", max_length=500)
    price: int = Field(ge=0, le=100_000_000)
    discountGeneral: int = Field(default=0, ge=0, le=100_000_000)
    discountAffiliate: int = Field(default=0, ge=0, le=100_000_000)
    hidden: bool = False


class AdminCatalogOrder(StrictModel):
    itemIds: list[str] = Field(min_length=1, max_length=500)

    @field_validator("itemIds")
    @classmethod
    def validate_unique_ids(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("품목 ID가 중복되었습니다.")
        return value
