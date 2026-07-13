"""관리자 인증 및 운영 데이터 API."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, File, HTTPException, Query, Request, Response, UploadFile, status

from .admin_auth import (
    LOGIN_BLOCK_MINUTES,
    SESSION_COOKIE_NAME,
    SESSION_HOURS,
    AdminIdentity,
    LoginRateLimited,
    authenticate_admin,
    get_admin_identity,
    revoke_admin_session,
)
from .admin_repository import (
    create_catalog_item,
    create_notice,
    delete_catalog_item,
    delete_inquiry,
    get_admin_catalog,
    get_admin_inquiry,
    list_admin_inquiries,
    list_admin_notices,
    reorder_catalog,
    save_discount_config,
    update_catalog_item,
    update_inquiry,
    update_notice,
)
from .attachments import (
    AttachmentCleanupError,
    AttachmentLimitReached,
    AttachmentNotFound,
    AttachmentTooLarge,
    AttachmentUnsupported,
    AttachmentValidationError,
    NoticeNotFound,
    delete_notice_file,
    delete_notice_with_files,
    store_notice_file,
)
from .repository import get_discount_config
from .schemas import (
    AdminCatalogItemInput,
    AdminCatalogItemUpdate,
    AdminCatalogOrder,
    AdminInquiryOut,
    AdminInquiryPage,
    AdminInquiryUpdate,
    AdminLogin,
    AdminNoticeInput,
    AdminSessionOut,
    CatalogItemOut,
    CatalogOut,
    Category,
    DiscountConfigOut,
    NoticeFileOut,
    NoticeOut,
    NoticePage,
)


router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_allowed_origin(request: Request) -> None:
    origin = (request.headers.get("origin") or "").rstrip("/")
    if not origin or origin not in request.app.state.settings.allowed_origins:
        raise HTTPException(status_code=403, detail="허용되지 않은 요청입니다.")


def require_admin(
    request: Request,
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AdminIdentity:
    identity = get_admin_identity(request.app.state.settings.db_path, session_token)
    if not identity:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return identity


Admin = Annotated[AdminIdentity, Depends(require_admin)]
AllowedOrigin = Annotated[None, Depends(require_allowed_origin)]


@router.post("/auth/login", response_model=AdminSessionOut)
def login(
    payload: AdminLogin,
    request: Request,
    response: Response,
    _: AllowedOrigin,
) -> dict[str, str]:
    try:
        result = authenticate_admin(
            request.app.state.settings.db_path,
            payload.loginId,
            payload.password,
            request.client.host if request.client else "unknown",
            request.headers.get("user-agent", ""),
        )
    except LoginRateLimited as error:
        raise HTTPException(
            status_code=429,
            detail=f"로그인 시도가 너무 많습니다. {LOGIN_BLOCK_MINUTES}분 후 다시 시도해주세요.",
        ) from error
    if not result:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    token, identity = result
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_HOURS * 60 * 60,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return {"loginId": identity.login_id, "expiresAt": identity.expires_at}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    _: AllowedOrigin,
    __: Admin,
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> Response:
    revoke_admin_session(request.app.state.settings.db_path, session_token)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="lax")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/auth/session", response_model=AdminSessionOut)
def current_session(admin: Admin) -> dict[str, str]:
    return {"loginId": admin.login_id, "expiresAt": admin.expires_at}


@router.get("/notices", response_model=NoticePage)
def admin_notices(
    request: Request,
    _: Admin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    query: Annotated[str, Query(max_length=200)] = "",
) -> dict[str, object]:
    return list_admin_notices(_db_path(request), page, page_size, query)


def _db_path(request: Request) -> Path:
    return request.app.state.settings.db_path


@router.post("/notices", response_model=NoticeOut, status_code=status.HTTP_201_CREATED)
def add_notice(
    payload: AdminNoticeInput,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    return create_notice(_db_path(request), payload)


@router.put("/notices/{notice_id}", response_model=NoticeOut)
def edit_notice(
    notice_id: int,
    payload: AdminNoticeInput,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    notice = update_notice(_db_path(request), notice_id, payload)
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다.")
    return notice


@router.post(
    "/notices/{notice_id}/files",
    response_model=NoticeFileOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_notice_file(
    notice_id: int,
    request: Request,
    file: Annotated[UploadFile, File()],
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    try:
        return await store_notice_file(
            _db_path(request),
            request.app.state.settings.upload_dir,
            notice_id,
            file,
        )
    except NoticeNotFound as error:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다.") from error
    except AttachmentValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except AttachmentUnsupported as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    except AttachmentTooLarge as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except AttachmentLimitReached as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    finally:
        await file.close()


@router.delete(
    "/notices/{notice_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_notice_file(
    notice_id: int,
    file_id: int,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> Response:
    try:
        delete_notice_file(
            _db_path(request),
            request.app.state.settings.upload_dir,
            notice_id,
            file_id,
        )
    except AttachmentNotFound as error:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.") from error
    except AttachmentCleanupError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/notices/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_notice(notice_id: int, request: Request, _: AllowedOrigin, __: Admin) -> Response:
    try:
        deleted = delete_notice_with_files(
            _db_path(request),
            request.app.state.settings.upload_dir,
            notice_id,
        )
    except AttachmentCleanupError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/catalog", response_model=CatalogOut)
def admin_catalog(request: Request, _: Admin) -> dict[str, list[dict[str, object]]]:
    return get_admin_catalog(_db_path(request))


@router.put("/catalog/{category}/order", response_model=CatalogOut)
def order_catalog(
    category: Category,
    payload: AdminCatalogOrder,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, list[dict[str, object]]]:
    if not reorder_catalog(_db_path(request), category, payload.itemIds):
        raise HTTPException(status_code=409, detail="현재 품목과 순서 요청이 일치하지 않습니다.")
    return get_admin_catalog(_db_path(request))


@router.post("/catalog/{category}", response_model=CatalogItemOut, status_code=status.HTTP_201_CREATED)
def add_catalog_item(
    category: Category,
    payload: AdminCatalogItemInput,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    try:
        return create_catalog_item(_db_path(request), category, payload)
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="이미 사용 중인 품목 ID입니다.") from error


@router.put("/catalog/{category}/{item_id}", response_model=CatalogItemOut)
def edit_catalog_item(
    category: Category,
    item_id: str,
    payload: AdminCatalogItemUpdate,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    item = update_catalog_item(_db_path(request), category, item_id, payload)
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    return item


@router.delete("/catalog/{category}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_catalog_item(
    category: Category,
    item_id: str,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> Response:
    if not delete_catalog_item(_db_path(request), category, item_id):
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/discounts", response_model=DiscountConfigOut)
def admin_discounts(request: Request, _: Admin) -> dict[str, object]:
    return get_discount_config(_db_path(request))


@router.put("/discounts", response_model=DiscountConfigOut)
def edit_discounts(
    payload: DiscountConfigOut,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    return save_discount_config(_db_path(request), payload)


@router.get("/inquiries", response_model=AdminInquiryPage)
def admin_inquiries(
    request: Request,
    _: Admin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    inquiry_status: Annotated[
        Literal["답변대기", "답변완료"] | None,
        Query(alias="status"),
    ] = None,
    query: Annotated[str, Query(max_length=200)] = "",
) -> dict[str, object]:
    return list_admin_inquiries(_db_path(request), page, page_size, inquiry_status, query)


@router.get("/inquiries/{inquiry_id}", response_model=AdminInquiryOut)
def admin_inquiry(inquiry_id: int, request: Request, _: Admin) -> dict[str, object]:
    inquiry = get_admin_inquiry(_db_path(request), inquiry_id)
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    return inquiry


@router.patch("/inquiries/{inquiry_id}", response_model=AdminInquiryOut)
def edit_inquiry(
    inquiry_id: int,
    payload: AdminInquiryUpdate,
    request: Request,
    _: AllowedOrigin,
    __: Admin,
) -> dict[str, object]:
    inquiry = update_inquiry(_db_path(request), inquiry_id, payload)
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    return inquiry


@router.delete("/inquiries/{inquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_inquiry(inquiry_id: int, request: Request, _: AllowedOrigin, __: Admin) -> Response:
    if not delete_inquiry(_db_path(request), inquiry_id):
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
