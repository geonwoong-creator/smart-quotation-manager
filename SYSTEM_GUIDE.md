# 🤖 SYSTEM_GUIDE.md (For AI Coding Agents)

이 문서는 다른 AI 코딩 에이전트(Cursor, Claude, Copilot 등)가 프로젝트의 구조, 설계, 아키텍처를 신속하게 이해하고 오류 없이 기능을 수정하거나 추가 개발할 수 있도록 돕는 시스템 가이드입니다.

---

## 1. 프로젝트 개요 및 기술 스택
- **목적**: 사내 내부망용 견적서 통합 관리 웹 시스템 (다중 PDF/Excel/이미지 AI 파싱, 형상관리, 검증 및 취합)
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite, openpyxl, xlrd, pdfplumber, google-generativeai
- **Frontend**: React 19, Vite, TypeScript, Vanilla CSS (Harmonious Dark Blue & Glassmorphism 테마)
- **Database**: `smart_quotation.db` (SQLite 파일 기반)
- **Storage**: `/storage/` (로컬 디스크 내 파일 업로드 보관)

---

## 2. 디렉토리 구조 및 핵심 파일 안내
이 프로젝트는 `/backend`와 `/frontend`로 나뉜 모노레포 구조입니다.

```
smart-quotation-manager/
├── backend/app/
│   ├── main.py             # FastAPI 라우터 및 미들웨어, 비즈니스 로직
│   ├── models.py           # SQLAlchemy ORM 모델 & 관계 정의
│   ├── parser.py           # 구형/신형 엑셀, PDF, OCR 텍스트 덤프 및 Gemini AI 파이프라인
│   └── excel_generator.py  # openpyxl 기반 스타일링이 적용된 취합대장 엑셀 바이너리 생성
├── frontend/src/
│   ├── App.tsx             # 메인 라우터, 프로젝트 생성/목록 카드, 프로젝트 안전 삭제
│   ├── components/
│   │   ├── Dashboard.tsx   # 견적서 목록 대장, 다중 누적 드롭, 동시성 큐 업로드, 선택 일괄 삭제
│   │   ├── Verifier.tsx    # Split-Screen 검증기, 타임라인 버전 폼, 천단위 금액 컴마 동기화
│   │   └── DocumentViewer.tsx # PDF(iframe), Excel(SheetJS), 이미지 인라인 렌더링
└── storage/                # 업로드된 원본 파일들이 보관되는 로컬 디렉토리 (Git 제외)
```

---

## 3. 핵심 아키텍처 및 AI 가이드라인 (중요)

유지보수 시 다른 AI 에이전트가 절대로 깨뜨려서는 안 되는 핵심 설계 규칙입니다.

### A. 네트워크 배포 및 CORS 설정 (Cross-Origin)
- **문제 상황**: 프론트엔드(`:5173`)와 백엔드(`:8000`)의 포트가 다릅니다. 사내망 IP(예: `http://192.168.0.50:5173`)로 타 PC가 접속하면 CORS 위반과 포트 매핑 버그가 발생하기 쉽습니다.
- **해결 로직 (유지 필수)**:
  - **프론트엔드 (`App.tsx`, `Dashboard.tsx`, `Verifier.tsx`, `DocumentViewer.tsx`)**:
    ```typescript
    const BACKEND_URL = window.location.origin.includes(':5173')
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : window.location.origin;
    ```
    접속 포트가 `:5173`인 경우, 동적으로 호스트네임에 포트 `:8000`을 스위칭하여 API 및 미디어를 요청하도록 처리되어 있습니다.
  - **백엔드 (`main.py`)**:
    ```python
    allow_origin_regex=r"https?://.*"
    ```
    CORS 정책 우회를 위해 허용 대상을 정규식 패턴으로 완전 유연하게 대처해 두었습니다. 수정 시 사내망 접속 가능성을 항상 염두에 두십시오.

### B. 데이터 모델 관계 & 연쇄 삭제 (Cascade with Physical File Cleanup)
- **관계**: `Project (1)` -> `Quotation (N)` -> `QuotationVersion (N)`
- **물리적 파일 삭제 연동**: 
  - 견적서 일괄 삭제(`DELETE /api/quotations`) 및 프로젝트 삭제(`DELETE /api/projects/{id}`) 시, 데이터베이스 레코드만 삭제되는 것이 아닙니다.
  - 삭제 대상인 `QuotationVersion` 레코드에 매핑되어 있는 `/storage/` 폴더 내 **실제 물리적 원본 파일(PDF, Excel, 이미지 등)도 서버 디스크 상에서 동시 삭제**하도록 구현되어 있습니다. 수정 시 `os.remove` 로직의 누락에 주의하십시오.

### C. 텍스트 대조 안전 삭제 장치
- 프로젝트 영구 삭제 시 대참사를 막기 위해, 프론트 단에서 `window.prompt`를 띄워 **해당 프로젝트의 정확한 명칭(이름)을 오타 없이 입력받아야만** 삭제 API가 작동합니다. (`e.stopPropagation()` 처리로 카드 상세 진입 버블링도 방어합니다.)

### D. 누적 파일 드롭 & 큐 업로드 (Concurrency Queue)
- **누적 로직**: 파일 드롭 시 기존 대기열을 덮어쓰지 않고 누적(`prev => [...prev, ...newFiles]`)하며, 파일명과 용량이 같은 파일은 중복 제거 필터를 태웁니다.
- **비동기 큐**: API 과부하 및 Rate Limit(429)를 피하기 위해 **최대 3개 병렬 처리**와 요청당 **1초의 지연(Rate Limit Delay)**을 둔 비동기 동시성 제어 큐가 탑재되어 있습니다.

### E. 금액 필드 포맷 마스크 (Formatting Mask)
- **프론트엔드**: 금액 입력 시 정수형 3자리 컴마(`,`) 마스크가 즉각 표기됩니다 (`toLocaleString`).
- **서버 통신**: 저장 제출(`handleSubmit`) 시에는 숫자만 남기도록 쉼표 등 숫자가 아닌 모든 문자를 제거(`replace(/[^\d]/g, '')`)한 뒤 `float` 형태로 데이터베이스에 전송합니다. 자료형 불일치 에러를 방지하십시오.

### F. 하이브리드 파싱 (Gemini API & Local Regex)
- **백엔드 (`parser.py`)**:
  - `GEMINI_API_KEY` 환경변수가 존재하면 Gemini 3.5 Flash를 이용한 고성능 정밀 분석을 수행합니다.
  - 키가 없거나 외부 인터넷 차단 시, 자동으로 로컬의 룰베이스 Regex 파서로 우회 작동(Fallback)합니다.
  - 수식 캐시가 누락된 엑셀은 2차 `data_only=False` 시도를 하도록 하이브리드 설계되었습니다.
