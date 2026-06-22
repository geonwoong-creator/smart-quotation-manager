import React, { useState, useEffect } from 'react';
import { DocumentViewer } from './DocumentViewer';

interface QuotationVersion {
  id: number;
  version: number;
  file_name: string;
  file_path: string;
  file_type: string;
  company_name: string;
  representative_name: string | null;
  business_number: string | null;
  manager_name: string | null;
  contact: string | null;
  email: string | null;
  amount_excl_vat: number | null;
  amount_incl_vat: number | null;
  raw_extracted_data: any;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
}

interface VerifierProps {
  quotationId: number;
  projectName: string;
  onBack: () => void;
}

export const Verifier: React.FC<VerifierProps> = ({ quotationId, projectName, onBack }) => {
  const [versions, setVersions] = useState<QuotationVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<QuotationVersion | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState<string>('');
  const [representativeName, setRepresentativeName] = useState<string>('');
  const [businessNumber, setBusinessNumber] = useState<string>('');
  const [managerName, setManagerName] = useState<string>('');
  const [contact, setContact] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [amountExcl, setAmountExcl] = useState<string>('');
  const [amountIncl, setAmountIncl] = useState<string>('');

  const BACKEND_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:8000' 
    : window.location.origin;

  // 1. 해당 quotation의 전체 버전 히스토리 로드
  const loadVersions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/quotations/${quotationId}/versions`);
      if (!res.ok) throw new Error('버전 히스토리를 불러오는 데 실패했습니다.');
      const data: QuotationVersion[] = await res.json();
      
      // 최신 버전이 가장 앞으로 정렬되어 있으므로 내림차순(최신순)
      setVersions(data);
      
      if (data.length > 0) {
        // 기본적으로 최신 버전을 선택
        selectVersion(data[0]);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [quotationId]);

  // 2. 버전 선택 및 폼 필드 바인딩
  const selectVersion = (version: QuotationVersion) => {
    setSelectedVersion(version);
    setCompanyName(version.company_name || '');
    setRepresentativeName(version.representative_name || '');
    setBusinessNumber(version.business_number || '');
    setManagerName(version.manager_name || '');
    setContact(version.contact || '');
    setEmail(version.email || '');
    setAmountExcl(version.amount_excl_vat !== null && version.amount_excl_vat !== undefined ? Number(version.amount_excl_vat).toLocaleString() : '');
    setAmountIncl(version.amount_incl_vat !== null && version.amount_incl_vat !== undefined ? Number(version.amount_incl_vat).toLocaleString() : '');
    setMessage(null);
  };

  // 3. 검증 데이터 수정 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVersion) return;

    setSaveLoading(true);
    setMessage(null);

    const payload = {
      company_name: companyName,
      representative_name: representativeName || null,
      business_number: businessNumber || null,
      manager_name: managerName || null,
      contact: contact || null,
      email: email || null,
      amount_excl_vat: amountExcl ? parseFloat(amountExcl.replace(/[^\d]/g, '')) : null,
      amount_incl_vat: amountIncl ? parseFloat(amountIncl.replace(/[^\d]/g, '')) : null,
      is_verified: true // 검증 완료 플래그 적용
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/quotation-versions/${selectedVersion.id}/verify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('검증 데이터를 저장하는 중 서버 오류가 발생했습니다.');
      
      const updatedVersion: QuotationVersion = await res.json();
      setMessage({ text: '검증 정보가 성공적으로 저장 및 승인되었습니다!', type: 'success' });
      
      // 버전 리스트 내 데이터 갱신
      setVersions(prev => prev.map(v => v.id === updatedVersion.id ? updatedVersion : v));
      selectVersion(updatedVersion);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  // 천 단위 쉼표 포맷팅 헬퍼
  const formatNumberWithCommas = (value: string) => {
    const clean = value.replace(/[^\d]/g, '');
    if (!clean) return '';
    return Number(clean).toLocaleString();
  };

  const handleAmountExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountExcl(formatNumberWithCommas(e.target.value));
  };
  
  const handleAmountInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountIncl(formatNumberWithCommas(e.target.value));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: '#9ca3af' }}>
        <h2>버전 데이터를 불러오는 중...</h2>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '1rem' }}>
      
      {/* 상단 내비게이션 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{projectName}</span>
          <h2 style={{ fontSize: '1.4rem', marginTop: '2px' }}>
            {selectedVersion?.company_name || '견적서'} 검증 & 편집
          </h2>
        </div>
        <button onClick={onBack} className="btn btn-secondary">
          ← 프로젝트 상세로 돌아가기
        </button>
      </div>

      {/* 메인 2분할 뷰 */}
      <div style={{ display: 'flex', flex: 1, gap: '1.25rem', minHeight: 0 }}>
        
        {/* 왼쪽: 원본 뷰어 패널 */}
        <div className="glass-panel" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', padding: '1rem', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              원본 견적서 파일 미리보기 ({selectedVersion?.file_name})
            </span>
            {selectedVersion?.is_verified && (
              <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', border: '1px solid var(--success)', padding: '2px 8px', borderRadius: '4px' }}>
                검증완료 V{selectedVersion.version}
              </span>
            )}
          </div>
          
          <div style={{ flex: 1, minHeight: 0 }}>
            {selectedVersion && (
              <DocumentViewer
                filePath={selectedVersion.file_path}
                fileType={selectedVersion.file_type}
              />
            )}
          </div>
        </div>

        {/* 오른쪽: 검증 편집 폼 및 히스토리 타임라인 */}
        <div className="glass-panel" style={{ flex: 0.8, display: 'flex', flexDirection: 'column', padding: '1.25rem', overflowY: 'auto' }}>
          
          {/* 버전 타임라인 섹션 */}
          <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              버전 히스토리
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {versions.map((v) => {
                const isActive = selectedVersion?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => selectVersion(v)}
                    className="btn"
                    style={{
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      borderRadius: '6px',
                      background: isActive 
                        ? 'linear-gradient(135deg, var(--primary), var(--accent))' 
                        : 'var(--bg-app)',
                      color: 'white',
                      border: isActive ? 'none' : '1px solid var(--border-color)',
                      fontWeight: isActive ? 'bold' : 'normal'
                    }}
                  >
                    V{v.version} {v.is_verified ? '✓' : '(미검증)'}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              * 동일 프로젝트 내 동일 업체 견적서 업로드 시 자동으로 새 버전이 생성되어 보존됩니다.
            </p>
          </div>

          {/* 알림 메시지 */}
          {message && (
            <div style={{ 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-sm)', 
              marginBottom: '1rem',
              fontSize: '0.85rem',
              background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: message.type === 'success' ? '1px solid var(--success)' : '1px solid var(--danger)',
              color: message.type === 'success' ? 'var(--success)' : 'var(--danger)'
            }}>
              {message.text}
            </div>
          )}

          {/* 추출 데이터 수정 폼 */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
              추출 핵심 데이터 검증
            </h3>
            
            <div className="form-group">
              <label>업체명 (필수)</label>
              <input
                type="text"
                className="form-control"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>대표자명</label>
                <input
                  type="text"
                  className="form-control"
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder="예: 송주흔"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>사업자등록번호</label>
                <input
                  type="text"
                  className="form-control"
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(e.target.value)}
                  placeholder="예: 264-81-46574"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>담당자명</label>
                <input
                  type="text"
                  className="form-control"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="미추출 시 직접 입력"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>연락처</label>
                <input
                  type="text"
                  className="form-control"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>
            </div>

            <div className="form-group">
              <label>이메일 주소</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.com"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>견적금액 (VAT 별도)</label>
                <input
                  type="text"
                  className="form-control"
                  value={amountExcl}
                  onChange={handleAmountExclChange}
                  placeholder="공급가액"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>견적금액 (VAT 포함)</label>
                <input
                  type="text"
                  className="form-control"
                  value={amountIncl}
                  onChange={handleAmountInclChange}
                  placeholder="합계금액"
                />
              </div>
            </div>

            {/* AI 추출 추가 데이터 정보 */}
            {selectedVersion?.raw_extracted_data && (
              <div style={{ marginTop: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  AI 파서 메타데이터 (JSONB)
                </span>
                <pre style={{ fontSize: '0.7rem', overflowX: 'auto', color: 'var(--accent)' }}>
                  {JSON.stringify(selectedVersion.raw_extracted_data, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem' }}>
              <button
                type="submit"
                disabled={saveLoading}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {saveLoading ? '저장 중...' : '검증 및 최종 승인 완료'}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};
export default Verifier;
