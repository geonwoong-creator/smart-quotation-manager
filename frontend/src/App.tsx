import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Verifier } from './components/Verifier';

interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export const App: React.FC = () => {
  // Navigation States
  const [currentView, setCurrentView] = useState<'project-list' | 'dashboard' | 'verifier'>('project-list');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');
  const [selectedProjectDesc, setSelectedProjectDesc] = useState<string | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);

  // Project List States
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // New Project Form States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectDesc, setNewProjectDesc] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);

  const BACKEND_URL = window.location.origin.includes(':5173')
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin;

  // 1. 프로젝트 목록 로드
  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/projects`);
      if (!res.ok) throw new Error('프로젝트 목록을 불러오는 데 실패했습니다.');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // 2. 신규 프로젝트 생성
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreateLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDesc.trim() || null
        })
      });

      if (!res.ok) throw new Error('프로젝트 생성 중 오류가 발생했습니다.');
      
      const created: Project = await res.json();
      setProjects((prev) => [created, ...prev]);
      
      // 모달 리셋
      setNewProjectName('');
      setNewProjectDesc('');
      setShowCreateModal(false);
      
      // 즉시 새로 만들어진 프로젝트 상세 화면으로 이동
      handleGoToDashboard(created.id, created.name, created.description);
    } catch (err) {
      console.error(err);
      alert('프로젝트를 만드는 데 실패했습니다.');
    } finally {
      setCreateLoading(false);
    }
  };

  // 3. 프로젝트 삭제 처리 (안전 장치 추가)
  const handleDeleteProject = async (id: number, name: string) => {
    const inputName = window.prompt(
      `⚠️ 프로젝트 [${name}]을(를) 삭제하시겠습니까?\n프로젝트 내부의 모든 견적서 데이터와 서버의 원본 파일이 영구 삭제되며 복구할 수 없습니다.\n\n삭제를 동의하시면 아래에 프로젝트 명칭을 정확히 입력해 주세요:`
    );

    if (inputName === null) return; // 취소

    if (inputName.trim() !== name.trim()) {
      alert("프로젝트 명이 일치하지 않습니다. 삭제 처리가 취소되었습니다.");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/projects/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || '프로젝트 삭제 중 서버 오류가 발생했습니다.');
      }

      alert(`프로젝트 [${name}]이(가) 정상적으로 삭제되었습니다.`);
      loadProjects();
    } catch (err: any) {
      alert(`삭제 실패: ${err.message}`);
    }
  };

  // 4. 네비게이션 도우미
  const handleGoToDashboard = (id: number, name: string, desc: string | null) => {
    setSelectedProjectId(id);
    setSelectedProjectName(name);
    setSelectedProjectDesc(desc);
    setCurrentView('dashboard');
  };

  const handleGoToVerifier = (quotationId: number) => {
    setSelectedQuotationId(quotationId);
    setCurrentView('verifier');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* 글로벌 탑 네비게이션 헤더 */}
      <header className="glass-panel" style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 50, 
        borderRadius: 0, 
        borderLeft: 'none', 
        borderRight: 'none', 
        borderTop: 'none',
        padding: '1rem 2rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: 'rgba(11, 15, 25, 0.8)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setCurrentView('project-list')}>
          <div style={{ 
            fontSize: '1.25rem', 
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            color: 'white', 
            width: '36px', 
            height: '36px', 
            borderRadius: '8px', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            fontWeight: 'bold',
            boxShadow: '0 0 10px var(--primary-glow)'
          }}>
            S
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.15rem', background: 'linear-gradient(to right, #fff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            스마트 견적서 통합 관리 시스템
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          내부 직원 검증 모드
        </div>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main style={{ flex: 1, padding: '2rem 3rem', maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
        
        {/* VIEW 1: 프로젝트 목록 화면 */}
        {currentView === 'project-list' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1>견적 취합 프로젝트 목록</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                  진행 중인 건설, 신축, 자재 수급 프로젝트를 생성하고 수신된 견적서를 누적 취합해 보세요.
                </p>
              </div>
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
                ＋ 새 취합 프로젝트 개설
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                프로젝트를 로딩하는 중입니다...
              </div>
            ) : projects.length === 0 ? (
              <div style={{ 
                padding: '6rem', 
                textAlign: 'center', 
                color: 'var(--text-secondary)', 
                border: '2px dashed var(--border-color)', 
                borderRadius: '16px' 
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏗️</div>
                <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>현재 활성화된 견적 취합 프로젝트가 없습니다.</h3>
                <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>새 프로젝트를 만들어 견적서 업로드 및 AI 파싱을 시작해 보세요.</p>
                <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                  첫 프로젝트 개설하기
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
                {projects.map((p) => (
                  <div 
                    key={p.id} 
                    className="glass-panel" 
                    style={{ 
                      padding: '1.5rem', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between', 
                      minHeight: '200px',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                    onClick={() => handleGoToDashboard(p.id, p.name, p.description)}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          PROJECT ID #{p.id}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(p.id, p.name);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            transition: 'var(--transition-smooth)'
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLButtonElement).style.background = 'none';
                          }}
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                      <h3 style={{ fontSize: '1.25rem', marginTop: '0.25rem', marginBottom: '0.75rem', color: 'white' }}>
                        {p.name}
                      </h3>
                      <p style={{ 
                        fontSize: '0.85rem', 
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.4
                      }}>
                        {p.description || '상세 설명이 등록되지 않았습니다.'}
                      </p>
                    </div>
                    
                    <div style={{ 
                      marginTop: '1.5rem', 
                      paddingTop: '1rem', 
                      borderTop: '1px solid rgba(255,255,255,0.05)', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center' 
                    }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        생성: {p.created_at.slice(0, 10)}
                      </span>
                      <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                        견적서 취합대장 입장 →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 신규 프로젝트 생성 모달 */}
            {showCreateModal && (
              <div style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: 'rgba(0, 0, 0, 0.75)', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                zIndex: 100,
                backdropFilter: 'blur(4px)'
              }}>
                <div className="glass-panel" style={{ 
                  width: '100%', 
                  maxWidth: '500px', 
                  padding: '2rem', 
                  background: 'var(--bg-app)',
                  border: '1px solid rgba(255,255,255,0.15)'
                }}>
                  <h2 style={{ marginBottom: '1.5rem' }}>새 취합 프로젝트 개설</h2>
                  <form onSubmit={handleCreateProject}>
                    <div className="form-group">
                      <label>프로젝트 명칭 (필수)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="예: 강남 테헤란로 타워 신축 공사"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>상세 설명 및 취합 조건</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={newProjectDesc}
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        placeholder="예: 철근 콘크리트 및 조경 견적을 통합 취합하며, 부가세포함 견적을 기준으로 매칭합니다."
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        onClick={() => setShowCreateModal(false)} 
                        className="btn btn-secondary"
                      >
                        취소
                      </button>
                      <button 
                        type="submit" 
                        className="btn btn-primary"
                        disabled={createLoading}
                      >
                        {createLoading ? '개설 중...' : '프로젝트 개설'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: 특정 프로젝트의 대시보드 */}
        {currentView === 'dashboard' && selectedProjectId && (
          <Dashboard
            projectId={selectedProjectId}
            projectName={selectedProjectName}
            projectDescription={selectedProjectDesc}
            onSelectQuotation={handleGoToVerifier}
            onBack={() => {
              loadProjects(); // 프로젝트 리스트 리로드
              setCurrentView('project-list');
            }}
          />
        )}

        {/* VIEW 3: 데이터 검증/편집 화면 (Split-screen) */}
        {currentView === 'verifier' && selectedQuotationId && (
          <Verifier
            quotationId={selectedQuotationId}
            projectName={selectedProjectName}
            onBack={() => setCurrentView('dashboard')}
          />
        )}

      </main>
      
      {/* 푸터 */}
      <footer style={{ 
        padding: '1.5rem 3rem', 
        textAlign: 'center', 
        fontSize: '0.8rem', 
        color: 'var(--text-muted)', 
        borderTop: '1px solid var(--border-color)',
        marginTop: 'auto'
      }}>
        © 2026 스마트 견적서 통합 관리 시스템. All rights reserved. (Antigravity AI Full-stack Developer)
      </footer>
    </div>
  );
};

export default App;
