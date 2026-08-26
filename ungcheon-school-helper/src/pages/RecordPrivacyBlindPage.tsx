import { ExternalLink, FileLock2, ShieldCheck } from "lucide-react";

const recordPrivacyBlindUrl = "./embedded-tools/record-privacy-blind.html";

export default function RecordPrivacyBlindPage() {
  return (
    <div className="flex h-full min-h-[720px] flex-col gap-3 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2">
            <FileLock2 size={22} className="text-rose-700" />
            생기부 개인정보 블라인드
          </h1>
          <p className="page-subtitle mt-1">
            여러 학교생활기록부 PDF의 개인정보를 자동·수동으로 가린 뒤 안전한 새
            PDF로 저장합니다.
          </p>
        </div>
        <div className="flex max-w-xl flex-col items-end gap-1 text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-950">
            <ShieldCheck size={14} />
            PDF는 이 PC에서만 처리됩니다
          </span>
          <p className="text-[11px] font-semibold text-slate-700">
            원본 제작: 충렬여자고등학교 Bryan Park · 웅천고 업무도우미에 맞게
            수정
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800">
          <span>
            PDF를 불러온 뒤 자동 탐지 결과를 반드시 미리 확인하고 내보내세요.
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            <ExternalLink size={12} />
            프로그램 내장 도구
          </span>
        </div>
        <iframe
          title="생기부 개인정보 블라인드 도구"
          src={recordPrivacyBlindUrl}
          className="min-h-0 flex-1 border-0 bg-slate-100"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
        />
      </div>
    </div>
  );
}
