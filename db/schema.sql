-- 데이터베이스 초기화 및 테이블 생성 스크립트 (PostgreSQL 호환)

-- 1. projects (프로젝트 마스터)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. quotations (업체별 견적서 그룹)
-- 한 프로젝트 안에서 동일 업체가 제출한 견적서들을 그룹화합니다.
CREATE TABLE IF NOT EXISTS quotations (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    latest_version_id INT, -- 순환 참조 관계는 추후 F.K 설정
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, company_name)
);

-- 3. quotation_versions (버전별 이력 관리 및 추출 데이터)
-- 동일 프로젝트 내 동일 업체에 대해 V1, V2, V3 형태로 버전이 점차 누적됩니다.
CREATE TABLE IF NOT EXISTS quotation_versions (
    id SERIAL PRIMARY KEY,
    quotation_id INT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    version INT NOT NULL, -- 1, 2, 3 ...
    file_path VARCHAR(512) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- 'pdf', 'excel', 'image'
    
    -- 추출된 데이터 (업체명 외 필수 데이터 누락 가능성이 있으므로 NULL 허용)
    company_name VARCHAR(255) NOT NULL,
    representative_name VARCHAR(100),
    business_number VARCHAR(50),
    manager_name VARCHAR(100),
    contact VARCHAR(100),
    email VARCHAR(255),
    amount_excl_vat NUMERIC(15, 2), -- 공급가액 (VAT별도 견적금액)
    amount_incl_vat NUMERIC(15, 2), -- 합계금액 (VAT포함 견적금액)
    
    -- 향후 필드 확장을 위한 원본 파싱 데이터 보관 JSONB
    raw_extracted_data JSONB,
    
    -- 예외 처리 및 검증 여부
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (quotation_id, version)
);

-- 순환 외래키 제약조건 설정 (quotations -> quotation_versions)
ALTER TABLE quotations 
ADD CONSTRAINT fk_latest_version 
FOREIGN KEY (latest_version_id) REFERENCES quotation_versions(id) ON DELETE SET NULL;

-- 인덱스 추가 (빠른 조회를 위함)
CREATE INDEX IF NOT EXISTS idx_quotations_project_id ON quotations(project_id);
CREATE INDEX IF NOT EXISTS idx_quotation_versions_quotation_id ON quotation_versions(quotation_id);
