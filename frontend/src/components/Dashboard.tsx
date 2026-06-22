import React, { useState, useEffect, useRef } from 'react';

interface Quotation {
  id: number;
  project_id: number;
  company_name: string;
  latest_version_id: number | null;
  created_at: string;
  latest_version: {
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
    is_verified: boolean;
    created_at: string;
  } | null;
}

interface DashboardProps {
  projectId: number;
  projectName: string;
  projectDescription: string | null;
  onSelectQuotation: (id: number) => void;
  onBack: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projectId,
  projectName,
  projectDescription,
  onSelectQuotation,
  onBack
}) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // 다중 파일 및 큐 진행 상태 관리
  const [companyName, setCompanyName] = useState<string>('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  
  // 체크박스 선택 목록 관리
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const BACKEND_URL = window.location.origin.includes(':5173')
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin;

  // 1. 견적서 목록 조회
  const loadQuotations = async () => {
    setLoading(true);
    setError(null);
    setSelectedIds([]); // 목록 갱신 시 선택 초기화
    try {
      const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/quotations`);
      if (!res.ok) throw new Error('견적서 목록을 불러오는 데 실패했습니다.');
      const data = await res.json();
      setQuotations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [projectId]);

  // 2. 동시성 제어 큐를 탑재한 다중/단일 파일 업로드 처리
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0) {
      alert('분석할 견적서 파일을 선택해 주세요.');
      return;
    }

    const isBulk = uploadFiles.length > 1;
    if (!isBulk && !companyName.trim()) {
      alert('단일 파일 업로드 시에는 업체명을 입력해 주세요.');
      return;
    }

    setUploading(true);
    setError(null);

    const total = uploadFiles.length;
    setUploadProgress({ current: 0, total });

    // 동시 실행 제한 수치 (Gemini API 분당 한도 방지 및 서버 보호용)
    const CONCURRENCY_LIMIT = 3;
    let fileIndex = 0;
    let completedCount = 0;
    const errorsList: string[] = [];

    // 개별 비동기 작업 워커(Worker) 정의
    const uploadWorker = async () => {
      while (fileIndex < total) {
        // 현재 인덱스를 선점하고 즉시 증가
        const currentIndex = fileIndex++;
        if (currentIndex >= total) break;

        const fileItem = uploadFiles[currentIndex];
        const formData = new FormData();
        
        // 단일 업로드인 경우에만 입력된 상호 사용, 다중 업로드 시 공백으로 전송해 AI 자동 판별 유도
        if (!isBulk) {
          formData.append('company_name', companyName.trim());
        }
        formData.append('file', fileItem);

        try {
          const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/quotations/upload`, {
            method: 'POST',
            body: formData
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || `${fileItem.name} 파싱 실패`);
          }
        } catch (err: any) {
          console.error(err);
          errorsList.push(`${fileItem.name}: ${err.message || '네트워크 오류'}`);
        } finally {
          completedCount++;
          setUploadProgress({ current: completedCount, total });
          
          // Gemini API Rate Limit 방지용 딜레이 (다중 파일 일괄 업로드 시에만 1초 쉼)
          if (isBulk && fileIndex < total) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    };

    try {
      // 동시성 개수만큼 워커들을 병렬 실행
      const workers = [];
      const activeWorkersCount = Math.min(CONCURRENCY_LIMIT, total);
      for (let i = 0; i < activeWorkersCount; i++) {
        workers.push(uploadWorker());
      }

      // 모든 워커들의 큐 소진 완료 대기
      await Promise.all(workers);

      if (errorsList.length > 0) {
        setError(`일부 파일 분석 실패:\n${errorsList.join('\n')}`);
      } else {
        alert('모든 견적서의 AI 자동 분석 및 형상 버전 등록이 완료되었습니다!');
      }

      // 업로드 폼 리셋 및 대시보드 리프레시
      setCompanyName('');
      setUploadFiles([]);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadQuotations();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // 3. 취합 엑셀 다운로드 처리
  const handleDownloadExcel = () => {
    window.open(`${BACKEND_URL}/api/projects/${projectId}/download-excel`, '_blank');
  };

  // 4. 체크박스 선택 핸들러
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(quotations.map(q => q.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // 5. 선택 견적서 일괄 삭제 처리
  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.length}개 업체의 견적서를 삭제하시겠습니까?\n서버에 업로드된 모든 버전의 파일들도 영구 삭제되며 복구할 수 없습니다.`)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/quotations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotation_ids: selectedIds })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || '삭제 중 오류 발생');
      }

      alert('선택한 견적서가 모두 삭제되었습니다.');
      loadQuotations();
    } catch (err: any) {
      alert(`삭제 실패: ${err.message}`);
    }
  };

  // 포맷 도우미
  const formatAmount = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('ko-KR').format(amount) + '원';
  };

  const isBulk = uploadFiles.length > 1;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 상단 프로젝트 타이틀 & 설명 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button onClick={onBack} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            ← 프로젝트 목록
          </button>
          <h1>{projectName}</h1>
          {projectDescription && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '800px' }}>
              {projectDescription}
            </p>
          )}
        </div>
        
        {/* 취합 엑셀 다운로드 버튼 */}
        <button 
          onClick={handleDownloadExcel} 
          className="btn btn-success" 
          disabled={quotations.length === 0}
          style={{ padding: '0.8rem 1.5rem', fontWeight: 'bold' }}
        >
          📊 프로젝트 견적 통합 엑셀 다운로드
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* 왼쪽: 견적서 목록 리스트 */}
        <div className="glass-panel" style={{ flex: 1.8, padding: '1.5rem', overflow: 'hidden' }}>
          <h2 style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span>업체별 견적서 목록</span>
              {selectedIds.length > 0 && (
                <button 
                  onClick={handleDeleteSelected} 
                  className="btn btn-danger fade-in" 
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  선택 삭제 ({selectedIds.length})
                </button>
              )}
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              총 {quotations.length}개 업체 참여
            </span>
          </h2>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              데이터를 불러오는 중입니다...
            </div>
          ) : quotations.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
              아직 등록된 견적서가 없습니다. 우측 폼에서 견적서를 먼저 등록해 보세요.
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={quotations.length > 0 && selectedIds.length === quotations.length}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>참여 업체명</th>
                    <th>대표자 / 담당자</th>
                    <th>최종 견적 금액 (VAT별도)</th>
                    <th>최신 버전</th>
                    <th>검증 상태</th>
                    <th style={{ textAlign: 'right' }}>데이터 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((q) => {
                    const latest = q.latest_version;
                    const isSelected = selectedIds.includes(q.id);
                    return (
                      <tr key={q.id} style={{ background: isSelected ? 'rgba(255,255,255,0.03)' : 'none' }}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => handleSelectOne(q.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{q.company_name}</td>
                        <td>
                          {latest ? (
                            <div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 550 }}>
                                {latest.representative_name ? `대표: ${latest.representative_name}` : ''}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                {latest.manager_name ? `담당: ${latest.manager_name}` : ''}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {latest.email || latest.contact || ''}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                          {latest ? formatAmount(latest.amount_excl_vat) : '-'}
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {latest ? `V${latest.version}` : '-'}
                        </td>
                        <td>
                          {latest?.is_verified ? (
                            <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 500 }}>✓ 검증 완료</span>
                          ) : (
                            <span style={{ color: 'var(--warning)', fontSize: '0.85rem', fontWeight: 500 }}>⚠︎ 미검증</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => onSelectQuotation(q.id)}
                            className="btn btn-secondary"
                            style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                          >
                            검증 및 히스토리 →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 오른쪽: 신규 견적서 업로드 폼 */}
        <div className="glass-panel" style={{ flex: 0.9, padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1.25rem' }}>신규 견적서 등록 및 OCR 파싱</h2>
          
          <form onSubmit={handleUploadSubmit}>
            <div className="form-group">
              <label>제출 업체명 (단일 업로드 시 필수)</label>
              <input
                type="text"
                className="form-control"
                value={isBulk ? '' : companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={isBulk ? "다중 파일 업로드: AI 자동 분류 모드 활성" : "예: 현대건설, 삼성물산"}
                required={!isBulk}
                disabled={isBulk}
                style={{ 
                  background: isBulk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
                  borderColor: isBulk ? 'rgba(255,255,255,0.03)' : 'var(--border-color)',
                  color: isBulk ? 'var(--text-muted)' : 'var(--text-primary)'
                }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {isBulk 
                  ? "★ 다중 파일 모드: AI가 본문을 읽고 상호를 식별하여 버전을 알아서 분류/누적합니다."
                  : "* 기존에 등록된 업체명일 경우 자동으로 버전이 누적(V1→V2→V3) 관리됩니다."
                }
              </p>
            </div>

            <div className="form-group">
              <label>견적서 원본 파일 (다중 드롭 가능)</label>
              <div 
                style={{ 
                  border: '2px dashed var(--border-color)', 
                  borderRadius: 'var(--radius-sm)', 
                  padding: '1.75rem 1rem', 
                  textAlign: 'center', 
                  background: 'rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)'
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const filesArray = Array.from(e.dataTransfer.files);
                    setUploadFiles(filesArray);
                  }
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const filesArray = Array.from(e.target.files);
                      setUploadFiles(filesArray);
                    }
                  }}
                  accept=".pdf, .xls, .xlsx, .png, .jpg, .jpeg"
                  multiple
                />
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📁</div>
                {uploadFiles.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                      총 {uploadFiles.length}개 파일 선택됨
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px', margin: '0 auto' }}>
                      {uploadFiles.map(f => f.name).join(', ')}
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    여러 개의 파일을 끌어다 놓거나 클릭하여 선택하세요. (PDF/Excel/Image)
                  </span>
                )}
              </div>
            </div>

            {/* 진행률 및 로딩 바 */}
            {uploading && uploadProgress && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  <span>AI 분석 진행률</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                    {uploadProgress.current} / {uploadProgress.total} 완료
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${(uploadProgress.current / uploadProgress.total) * 100}%`, 
                      height: '100%', 
                      background: 'linear-gradient(to right, var(--primary), var(--secondary))',
                      transition: 'width 0.3s ease-out'
                    }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div style={{ 
                padding: '0.75rem', 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid var(--danger)', 
                borderRadius: '6px', 
                color: 'var(--danger)', 
                fontSize: '0.8rem', 
                marginBottom: '1rem',
                whiteSpace: 'pre-line',
                maxHeight: '120px',
                overflowY: 'auto'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploading || uploadFiles.length === 0}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem' }}
            >
              {uploading 
                ? `동시성 큐 분석 중... (${uploadProgress ? `${uploadProgress.current}/${uploadProgress.total}` : ''})` 
                : `${uploadFiles.length > 0 ? `선택된 ${uploadFiles.length}개 파일 분석 시작` : '견적서 파일 분석 시작'}`
              }
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
export default Dashboard;
