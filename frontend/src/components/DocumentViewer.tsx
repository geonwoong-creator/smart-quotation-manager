import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

interface DocumentViewerProps {
  filePath: string;
  fileType: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ filePath, fileType }) => {
  const [excelData, setExcelData] = useState<any[][]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 백엔드 주소 (개발 편의를 위해 환경변수 혹은 디폴트 포트 매핑)
  const BACKEND_URL = window.location.origin.includes(':5173')
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin;

  const fullUrl = filePath.startsWith('http') ? filePath : `${BACKEND_URL}${filePath}`;

  useEffect(() => {
    if (fileType === 'excel') {
      setLoading(true);
      setError(null);
      
      // Excel 파일 fetch 및 파싱
      fetch(fullUrl)
        .then((res) => {
          if (!res.ok) throw new Error('Excel 파일을 가져오는 데 실패했습니다.');
          return res.arrayBuffer();
        })
        .then((buffer) => {
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // 배열 구조로 셀 데이터 변환
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
          setExcelData(jsonData);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError('엑셀 인라인 뷰어 로드 실패: ' + err.message);
          setLoading(false);
        });
    }
  }, [fullUrl, fileType]);

  if (fileType === 'pdf') {
    return (
      <div style={{ width: '100%', height: '100%', background: '#1e293b', borderRadius: '8px', overflow: 'hidden' }}>
        <iframe
          src={`${fullUrl}#toolbar=0`}
          title="PDF Viewer"
          width="100%"
          height="100%"
          style={{ border: 'none' }}
        />
      </div>
    );
  }

  if (fileType === 'image') {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        background: '#0f172a',
        borderRadius: '8px',
        overflow: 'auto',
        padding: '1rem'
      }}>
        <img
          src={fullUrl}
          alt="Quotation Original"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }}
        />
      </div>
    );
  }

  if (fileType === 'excel') {
    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#9ca3af' }}>
          <span>엑셀 파일 파싱 중...</span>
        </div>
      );
    }
    if (error) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#ef4444', padding: '1rem', textAlign: 'center' }}>
          <span>{error}</span>
        </div>
      );
    }

    return (
      <div className="excel-preview-container" style={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <table className="excel-preview-table">
          <tbody>
            {excelData.map((row, rIdx) => (
              <tr key={rIdx}>
                {/* 첫 번째 행/열 가이드라인용 인덱스 추가 */}
                <td className="excel-header-col">{rIdx + 1}</td>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>
                    {cell !== null && cell !== undefined ? String(cell) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100%', 
      color: '#9ca3af',
      padding: '2rem',
      textAlign: 'center',
      border: '2px dashed #4b5563',
      borderRadius: '8px'
    }}>
      <p style={{ marginBottom: '1rem' }}>미지원 미리보기 포맷 ({fileType})</p>
      <a href={fullUrl} download className="btn btn-secondary">
        파일 다운로드하여 보기
      </a>
    </div>
  );
};
export default DocumentViewer;
