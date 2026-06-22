import os
import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, Numeric, Boolean, DateTime, ForeignKey, JSON, event
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./smart_quotation.db")

# SQLite 외래키 제약 활성화를 위한 설정
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relationships
    quotations = relationship("Quotation", back_populates="project", cascade="all, delete-orphan")

class Quotation(Base):
    __tablename__ = "quotations"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    company_name = Column(String(255), nullable=False)
    latest_version_id = Column(Integer, ForeignKey("quotation_versions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="quotations")
    versions = relationship("QuotationVersion", foreign_keys="[QuotationVersion.quotation_id]", back_populates="quotation", cascade="all, delete-orphan")
    latest_version = relationship("QuotationVersion", foreign_keys=[latest_version_id], post_update=True)

class QuotationVersion(Base):
    __tablename__ = "quotation_versions"
    
    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False) # 'pdf', 'excel', 'image'
    
    # 추출된 데이터 필드 (누락 허용)
    company_name = Column(String(255), nullable=False)
    representative_name = Column(String(100), nullable=True)
    business_number = Column(String(50), nullable=True)
    manager_name = Column(String(100), nullable=True)
    contact = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    amount_excl_vat = Column(Numeric(15, 2), nullable=True)
    amount_incl_vat = Column(Numeric(15, 2), nullable=True)
    
    # 유연한 확장용 JSON 필드 (PostgreSQL에서는 JSONB로 자동 변환됨)
    raw_extracted_data = Column(JSON, nullable=True)
    
    is_verified = Column(Boolean, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow)
    
    # Relationships
    quotation = relationship("Quotation", foreign_keys=[quotation_id], back_populates="versions")

# DB 테이블 생성 유틸리티 함수
def init_db():
    from sqlalchemy import inspect
    # SQLite를 사용하는 상태에서 테이블은 존재하는데 신규 컬럼이 누락되어 있을 경우
    # 개발 편의를 위해 DB 파일을 날리고 새로 생성하도록 자동 처리합니다.
    if DATABASE_URL.startswith("sqlite"):
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if os.path.exists(db_path):
            try:
                inspector = inspect(engine)
                if "quotation_versions" in inspector.get_table_names():
                    columns = [col["name"] for col in inspector.get_columns("quotation_versions")]
                    if "representative_name" not in columns:
                        print("구형 DB 구조가 감지되었습니다. DB 파일을 자동으로 삭제하고 재생성합니다.")
                        engine.dispose()
                        import time
                        time.sleep(0.5) # 커넥션 해제 대기
                        os.remove(db_path)
            except Exception as e:
                print(f"구형 DB 자동 마이그레이션(삭제) 중 오류 발생: {e}")

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
