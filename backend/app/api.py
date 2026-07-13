"""인증 없이 사용하는 공용 API 라우트."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import FileResponse

from .attachments import AttachmentCleanupError, AttachmentNotFound, get_notice_file
from .repository import (
    InquiryNotFound,
    InquiryPasswordInvalid,
    InquiryPasswordRequired,
    create_inquiry,
    get_catalog,
    get_discount_config,
    get_notice,
    get_public_inquiry,
    list_inquiries,
    list_notices,
)
from .schemas import (
    CatalogOut,
    DiscountConfigOut,
    InquiryCreate,
    InquiryCreated,
    InquiryDetail,
    InquiryPage,
    InquiryPassword,
    NoticeOut,
    NoticePage,
)


router = APIRouter(prefix="/api")


def _db_path(request: Request) -> Path:
    return request.app.state.settings.db_path


@router.get("/notices", response_model=NoticePage, tags=["notices"])
def notices(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, alias="pageSize", ge=1, le=100),
) -> dict[str, object]:
    return list_notices(_db_path(request), page, page_size)


@router.get("/notices/{notice_id}", response_model=NoticeOut, tags=["notices"])
def notice_detail(request: Request, notice_id: int) -> dict[str, object]:
    notice = get_notice(_db_path(request), notice_id)
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다.")
    return notice


@router.get("/notices/{notice_id}/files/{file_id}", tags=["notices"])
def download_notice_file(request: Request, notice_id: int, file_id: int) -> FileResponse:
    try:
        path, original_name, mime_type = get_notice_file(
            _db_path(request),
            request.app.state.settings.upload_dir,
            notice_id,
            file_id,
        )
    except (AttachmentNotFound, AttachmentCleanupError) as error:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.") from error
    return FileResponse(
        path,
        media_type=mime_type,
        filename=original_name,
        content_disposition_type="attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/catalog", response_model=CatalogOut, tags=["catalog"])
def catalog(request: Request) -> dict[str, object]:
    return get_catalog(_db_path(request))


@router.get("/discounts", response_model=DiscountConfigOut, tags=["catalog"])
def discounts(request: Request) -> dict[str, object]:
    return get_discount_config(_db_path(request))


@router.get("/inquiries", response_model=InquiryPage, tags=["inquiries"])
def inquiries(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, alias="pageSize", ge=1, le=100),
) -> dict[str, object]:
    return list_inquiries(_db_path(request), page, page_size)


@router.post(
    "/inquiries",
    response_model=InquiryCreated,
    status_code=status.HTTP_201_CREATED,
    tags=["inquiries"],
)
def submit_inquiry(request: Request, payload: InquiryCreate) -> dict[str, object]:
    return create_inquiry(_db_path(request), payload)


def _inquiry_detail_or_error(
    db_path: Path,
    inquiry_id: int,
    password: str | None = None,
) -> dict[str, object]:
    try:
        return get_public_inquiry(db_path, inquiry_id, password)
    except InquiryNotFound as exc:
        raise HTTPException(status_code=404, detail="문의글을 찾을 수 없습니다.") from exc
    except InquiryPasswordRequired as exc:
        raise HTTPException(status_code=403, detail="비밀번호 확인이 필요한 글입니다.") from exc
    except InquiryPasswordInvalid as exc:
        raise HTTPException(status_code=403, detail="비밀번호가 일치하지 않습니다.") from exc


@router.get("/inquiries/{inquiry_id}", response_model=InquiryDetail, tags=["inquiries"])
def inquiry_detail(request: Request, inquiry_id: int) -> dict[str, object]:
    return _inquiry_detail_or_error(_db_path(request), inquiry_id)


@router.post("/inquiries/{inquiry_id}/verify", response_model=InquiryDetail, tags=["inquiries"])
def verify_inquiry(
    request: Request,
    inquiry_id: int,
    payload: InquiryPassword,
) -> dict[str, object]:
    return _inquiry_detail_or_error(_db_path(request), inquiry_id, payload.password)
