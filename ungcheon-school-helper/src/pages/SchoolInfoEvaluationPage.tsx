import { Building2 } from 'lucide-react'
import SchoolInfoEvaluationTab from '../components/SchoolInfoEvaluationTab'

export default function SchoolInfoEvaluationPage() {
  return (
    <div className="schoolinfo-evaluation-page mx-auto max-w-[1500px] space-y-4 p-5">
      <header>
        <h1 className="page-title flex items-center gap-2"><Building2 size={23} className="text-sky-500" />타학교 평가계획</h1>
        <p className="page-subtitle mt-1">웅천고 2학기 정식 과목을 기준으로 2025학년도 1·2학기와 2026학년도 1학기 평가계획을 찾아봅니다.</p>
      </header>
      <SchoolInfoEvaluationTab />
    </div>
  )
}
