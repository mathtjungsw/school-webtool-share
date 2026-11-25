import { useState } from 'react'
import { ExternalLink, FileText, List, MapPinned } from 'lucide-react'
import { NAVIGATION_BY_ID } from '../config/navigationRegistry'
import { FeatureSurface } from './ExternalToolPage'

type ResourcePage = 'admission_results' | 'gyeongnam_curriculum' | 'performance_assessment_guide'

const curriculumViews = [
  { id: 'gyeongnam_curriculum_list', label: '목록으로 보기', icon: List },
  { id: 'gyeongnam_curriculum_map', label: '지도로 보기', icon: MapPinned },
] as const

const assessmentExamples = [
  { subject: '수학', topic: '두 변수의 관계', method: '산점도 해석', name: '공공데이터 산점도로 두 변수의 관계 해석하기' },
  { subject: '국어', topic: '두 글의 주장과 근거', method: '비평문 쓰기', name: '두 글의 주장과 근거를 비교하는 비평문 쓰기' },
  { subject: '과학', topic: '빛의 세기와 광합성', method: '실험 결과 해석', name: '빛의 세기에 따른 광합성 실험 결과 해석하기' },
]

export default function AdmissionsResourcePage({ kind }: { kind: ResourcePage }) {
  const [curriculumView, setCurriculumView] = useState<(typeof curriculumViews)[number]['id']>('gyeongnam_curriculum_list')
  const [openError, setOpenError] = useState('')
  const isResults = kind === 'admission_results'
  const isCurriculum = kind === 'gyeongnam_curriculum'
  const site = isResults ? 'admission_results' : curriculumView

  const openInBrowser = async (id: string) => {
    setOpenError('')
    try {
      await window.preview.view({ action: 'external', id })
    } catch {
      setOpenError('기본 브라우저를 열 수 없습니다. Windows의 기본 브라우저 설정을 확인해 주세요.')
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-emerald-100 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-emerald-700">진학·대입</p>
            <h1 className="text-xl font-black text-slate-950">{NAVIGATION_BY_ID.get(kind)?.label}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {(isResults || isCurriculum) && (
              <button type="button" className="btn-secondary" onClick={() => void openInBrowser(site)}>
                <ExternalLink size={16} aria-hidden="true" /> 기본 브라우저로 열기
              </button>
            )}
            {isResults && (
              <button type="button" className="btn-primary" onClick={() => void openInBrowser('adiga_teacher_portal')}>
                <ExternalLink size={16} aria-hidden="true" /> 어디가샘 열기
              </button>
            )}
            {!isResults && !isCurriculum && (
              <button type="button" className="btn-primary" onClick={() => void openInBrowser('performance_assessment_guide')}>
                <FileText size={16} aria-hidden="true" /> 동국대 가이드북 수정본 열기
              </button>
            )}
          </div>
        </div>
        {isResults && (
          <p className="mt-3 text-sm text-slate-700">
            아래에서 공개 ‘어디가’의 대학별 결과를 검색하세요. 교사용 자료는 어디가샘에서 인증서 로그인 후 <strong>교사자료 → 대학정보 → 전년도 입시결과</strong>로 이동하세요.
          </p>
        )}
        {isCurriculum && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="편제표 보기 방식">
              {curriculumViews.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" className={curriculumView === id ? 'btn-primary' : 'btn-secondary'}
                  aria-pressed={curriculumView === id} onClick={() => setCurriculumView(id)}>
                  <Icon size={16} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-700">조회연도와 학교명을 선택하세요. 지도에서는 <strong>창원시 진해구 → 웅천고</strong>에서 찾을 수 있습니다.</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="선택과목 상담 자료">
              <button type="button" className="btn-secondary" onClick={() => void openInBrowser('gyeongnam_course_guide')}>2026 선택과목 뭐 하지?</button>
              <button type="button" className="btn-secondary" onClick={() => void openInBrowser('university_course_requirements')}>2028 대학별 반영·권장과목</button>
            </div>
          </>
        )}
        {openError && <p role="alert" className="mt-3 text-sm text-red-700">{openError}</p>}
      </header>
      {isResults || isCurriculum ? <FeatureSurface key={site} id={site} /> : (
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-4xl space-y-5">
            <div className="card border-emerald-200 p-5">
              <h2 className="text-lg font-bold text-slate-950">평가할 내용 + 수행 방법</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                교과 성취기준에서 확인할 내용을 정한 뒤, 학생이 그 성취를 어떻게 보여줄지 이름에 담으세요. 동국대학교 입학처의 연구를 바탕으로 정리했습니다.
              </p>
            </div>
            <section aria-labelledby="assessment-examples">
              <h2 id="assessment-examples" className="mb-3 text-base font-bold text-slate-950">교과별 이름 작성 예시</h2>
              <div className="grid gap-3 lg:grid-cols-3">
                {assessmentExamples.map(({ subject, topic, method, name }) => (
                  <article key={subject} className="card p-4">
                    <p className="text-sm font-bold text-emerald-800">{subject}</p>
                    <h3 className="mt-2 text-base font-bold leading-snug text-slate-950">{name}</h3>
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm text-slate-700">
                      <dt className="font-semibold">평가 내용</dt><dd>{topic}</dd>
                      <dt className="font-semibold">수행 방법</dt><dd>{method}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </section>
  )
}
