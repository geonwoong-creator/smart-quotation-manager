import os
import shutil
import datetime
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

# 로컬 모듈 로딩
from .models import init_db, get_db, Project, Quotation, QuotationVersion
from .parser import run_parsing_pipeline
from .excel_generator import generate_consolidated_excel

app = FastAPI(title="스마트 견적서 통합 관리 API", version="1.0.0")

# CORS 설정 (프론트엔드 연동 대비)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 파일 업로드 저장소 설정 및 초기화
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

# DB 초기화
init_db()

# static files 마운트 (인라인 PDF/Excel 뷰어가 직접 fetch할 수 있도록 지원)
app.mount("/static/files", StaticFiles(directory=UPLOAD_DIR), name="static-files")

# -----------------
# Pydantic Schemas
# -----------------
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime.datetime
    
    class Config:
        from_attributes = True

class QuotationVersionResponse(BaseModel):
    id: int
    version: int
    file_name: str
    file_path: str
    file_type: str
    company_name: str
    representative_name: Optional[str] = None
    business_number: Optional[str] = None
    manager_name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    amount_excl_vat: Optional[float] = None
    amount_incl_vat: Optional[float] = None
    raw_extracted_data: Optional[dict] = None
    is_verified: bool
    verified_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class QuotationResponse(BaseModel):
    id: int
    project_id: int
    company_name: str
    latest_version_id: Optional[int]
    created_at: datetime.datetime
    latest_version: Optional[QuotationVersionResponse]

    class Config:
        from_attributes = True

class QuotationDataUpdate(BaseModel):
    company_name: str
    representative_name: Optional[str] = None
    business_number: Optional[str] = None
    manager_name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    amount_excl_vat: Optional[float] = None
    amount_incl_vat: Optional[float] = None
    raw_extracted_data: Optional[dict] = None
    is_verified: bool = True

class QuotationDeleteBatch(BaseModel):
    quotation_ids: List[int]

# -----------------
# API Endpoints
# -----------------

# 1. 프로젝트 생성 및 목록 조회
@app.post("/api/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(name=project.name, description=project.description)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@app.get("/api/projects", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.id.desc()).all()

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    return project

# 2. 견적서 업로드 및 자동 파싱 & 형상 버전 관리
@app.post("/api/projects/{project_id}/quotations/upload", response_model=QuotationVersionResponse)
def upload_quotation(
    project_id: int,
    company_name: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1) 프로젝트 존재 확인
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="지정된 프로젝트가 존재하지 않습니다.")

    # 2) 파일 확장자별 타입 분석
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    
    if ext in [".xls", ".xlsx"]:
        file_type = "excel"
    elif ext == ".pdf":
        file_type = "pdf"
    elif ext in [".png", ".jpg", ".jpeg"]:
        file_type = "image"
    else:
        file_type = "unknown"

    # 3) 파일 저장
    # 파일명 중복이나 문자 처리 안전을 위해 타임스탬프와 매핑하여 고유 파일 저장
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    safe_filename = f"{project_id}_{timestamp}_{filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 중 오류가 발생했습니다: {str(e)}")

    # 4) 파싱 파이프라인 구동 (PDF, Excel, 이미지 OCR/LLM Vision)
    parsed_data = run_parsing_pipeline(file_path, file_type)

    # 4-1) 업체명 자동 판별 (전송값 우선 -> AI 판별 상호 -> 원본 파일명 기반 Fallback)
    final_company_name = None
    if company_name and company_name.strip():
        final_company_name = company_name.strip()
    elif parsed_data.get("company_name") and parsed_data.get("company_name") != "미지정 업체":
        final_company_name = parsed_data.get("company_name").strip()
    else:
        # 파일 이름 기반 추출 (확장자 제거)
        base_name = os.path.splitext(filename)[0]
        final_company_name = base_name[:50].strip()

    if not final_company_name:
        final_company_name = "미지정 업체"

    # 5) 동일 프로젝트 내 동일 업체(final_company_name)의 기존 견적서 존재 확인
    quotation = db.query(Quotation).filter(
        Quotation.project_id == project_id,
        Quotation.company_name == final_company_name
    ).first()

    next_version = 1
    if not quotation:
        # 최초 업로드: 신규 quotation 생성
        quotation = Quotation(project_id=project_id, company_name=final_company_name)
        db.add(quotation)
        db.commit()
        db.refresh(quotation)
    else:
        # 기존 견적서 존재: 가장 최근 버전 번호 확인 후 누적 증가
        latest_ver_ref = db.query(QuotationVersion).filter(
            QuotationVersion.quotation_id == quotation.id
        ).order_by(QuotationVersion.version.desc()).first()
        
        if latest_ver_ref:
            next_version = latest_ver_ref.version + 1

    # 6) 버전 히스토리(QuotationVersion) 추가
    db_version = QuotationVersion(
        quotation_id=quotation.id,
        version=next_version,
        file_path=f"/static/files/{safe_filename}", # 웹 뷰어 서빙 URL 경로
        file_name=filename,
        file_type=file_type,
        company_name=final_company_name,
        representative_name=parsed_data.get("representative_name"),
        business_number=parsed_data.get("business_number"),
        manager_name=parsed_data.get("manager_name"),
        contact=parsed_data.get("contact"),
        email=parsed_data.get("email"),
        amount_excl_vat=parsed_data.get("amount_excl_vat"),
        amount_incl_vat=parsed_data.get("amount_incl_vat"),
        raw_extracted_data=parsed_data.get("raw_extracted_data"),
        is_verified=False
    )
    db.add(db_version)
    db.commit()
    db.refresh(db_version)

    # 7) quotations 테이블의 latest_version_id 포인터 업데이트 (항상 최신본 추적)
    quotation.latest_version_id = db_version.id
    db.commit()

    return db_version

# 3. 특정 프로젝트의 견적서 목록 조회 (최신 버전 정보 포함)
@app.get("/api/projects/{project_id}/quotations", response_model=List[QuotationResponse])
def get_project_quotations(project_id: int, db: Session = Depends(get_db)):
    return db.query(Quotation).filter(Quotation.project_id == project_id).all()

# 4. 특정 견적서 그룹의 전체 버전 히스토리 조회
@app.get("/api/quotations/{quotation_id}/versions", response_model=List[QuotationVersionResponse])
def get_quotation_history(quotation_id: int, db: Session = Depends(get_db)):
    versions = db.query(QuotationVersion).filter(
        QuotationVersion.quotation_id == quotation_id
    ).order_by(QuotationVersion.version.desc()).all()
    return versions

# 5. 견적서 데이터 검증/수정 및 확정 API (사용자가 뷰어를 보고 누락된 필드 보완)
@app.put("/api/quotation-versions/{version_id}/verify", response_model=QuotationVersionResponse)
def verify_quotation_version(
    version_id: int, 
    payload: QuotationDataUpdate, 
    db: Session = Depends(get_db)
):
    version = db.query(QuotationVersion).filter(QuotationVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="해당 버전의 견적서를 찾을 수 없습니다.")

    # 사용자가 수정한 데이터 반영
    version.company_name = payload.company_name
    version.representative_name = payload.representative_name
    version.business_number = payload.business_number
    version.manager_name = payload.manager_name
    version.contact = payload.contact
    version.email = payload.email
    version.amount_excl_vat = payload.amount_excl_vat
    version.amount_incl_vat = payload.amount_incl_vat
    
    if payload.raw_extracted_data is not None:
        # 기존 메타데이터 유지하며 병합 혹은 덮어쓰기
        if version.raw_extracted_data:
            merged = dict(version.raw_extracted_data)
            merged.update(payload.raw_extracted_data)
            version.raw_extracted_data = merged
        else:
            version.raw_extracted_data = payload.raw_extracted_data

    version.is_verified = payload.is_verified
    if payload.is_verified:
        version.verified_at = datetime.datetime.utcnow()
    else:
        version.verified_at = None

    db.commit()
    db.refresh(version)
    
    # 만약 현재 수정된 버전이 해당 Quotation의 최신 버전(latest_version_id)인 경우 
    # quotations.company_name도 일관성을 위해 동기화
    quotation = db.query(Quotation).filter(Quotation.id == version.quotation_id).first()
    if quotation and quotation.latest_version_id == version.id:
        quotation.company_name = payload.company_name
        db.commit()

    return version

# 6. 견적서 일괄 삭제 API
@app.delete("/api/quotations")
def delete_quotations(payload: QuotationDeleteBatch, db: Session = Depends(get_db)):
    quotations = db.query(Quotation).filter(Quotation.id.in_(payload.quotation_ids)).all()
    if not quotations:
        raise HTTPException(status_code=404, detail="삭제할 견적서를 찾을 수 없습니다.")
    
    # 실제 서버 디스크의 원본 파일(PDF, Excel, 이미지 등)도 동시 삭제
    for q in quotations:
        versions = db.query(QuotationVersion).filter(QuotationVersion.quotation_id == q.id).all()
        for v in versions:
            if v.file_path.startswith("/static/files/"):
                filename = v.file_path.replace("/static/files/", "")
                filename = os.path.basename(filename)
                actual_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(actual_path):
                    try:
                        os.remove(actual_path)
                    except Exception as e:
                        print(f"[Warning] 파일 물리 삭제 실패: {actual_path}, 에러: {e}")
        
        # DB cascade 옵션에 의해 QuotationVersion 레코드는 자동 폭파됨
        db.delete(q)
        
    db.commit()
    return {"detail": f"성공적으로 {len(quotations)}개의 견적서를 파일과 함께 삭제했습니다."}

# 7. 프로젝트 내 업체별 최신 견적서 데이터 취합 엑셀 다운로드 API
@app.get("/api/projects/{project_id}/download-excel")
def download_project_excel(project_id: int, db: Session = Depends(get_db)):
    # 1) 프로젝트 존재 확인
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    # 2) 해당 프로젝트의 모든 quotation 조회
    quotations = db.query(Quotation).filter(Quotation.project_id == project_id).all()
    
    # 3) 각 quotation의 최신 버전 데이터 취합
    quotation_data_list = []
    for q in quotations:
        if q.latest_version_id:
            version = db.query(QuotationVersion).filter(QuotationVersion.id == q.latest_version_id).first()
            if version:
                quotation_data_list.append({
                    "company_name": version.company_name,
                    "representative_name": version.representative_name,
                    "business_number": version.business_number,
                    "manager_name": version.manager_name,
                    "contact": version.contact,
                    "email": version.email,
                    "amount_excl_vat": float(version.amount_excl_vat) if version.amount_excl_vat else None,
                    "amount_incl_vat": float(version.amount_incl_vat) if version.amount_incl_vat else None,
                    "version": version.version,
                    "is_verified": version.is_verified,
                    "updated_at": version.created_at # 실제 입력 시점
                })
                
    if not quotation_data_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="취합할 견적서 데이터가 존재하지 않습니다.")

    # 4) 엑셀 바이너리 생성
    excel_stream = generate_consolidated_excel(quotation_data_list, project.name)
    
    # 5) StreamingResponse 다운로드 반환
    safe_project_name = "".join(x for x in project.name if x.isalnum() or x in " -_")
    filename = f"{safe_project_name}_견적취합_{datetime.date.today().strftime('%Y%m%d')}.xlsx"
    
    # 한글 파일명 헤더 대응 인코딩
    from urllib.parse import quote
    encoded_filename = quote(filename)

    headers = {
        'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
    }

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )

# 8. 프로젝트 삭제 API (하위 견적서 및 물리 파일 일괄 삭제)
@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
        
    # 1) 하위 견적서들의 원본 파일(PDF, Excel, 이미지 등)도 동시 물리 삭제
    quotations = db.query(Quotation).filter(Quotation.project_id == project_id).all()
    for q in quotations:
        versions = db.query(QuotationVersion).filter(QuotationVersion.quotation_id == q.id).all()
        for v in versions:
            if v.file_path.startswith("/static/files/"):
                filename = v.file_path.replace("/static/files/", "")
                filename = os.path.basename(filename)
                actual_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(actual_path):
                    try:
                        os.remove(actual_path)
                    except Exception as e:
                        print(f"[Warning] 프로젝트 삭제 중 물리 파일 삭제 실패: {actual_path}, 에러: {e}")
                        
    # 2) DB에서 프로젝트 삭제 (Cascade 옵션으로 하위 레코드도 자동 제거됨)
    db.delete(project)
    db.commit()
    return {"detail": f"프로젝트 '{project.name}'(이)가 하위 견적서 및 파일들과 함께 성공적으로 삭제되었습니다."}
