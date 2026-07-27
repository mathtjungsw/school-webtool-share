// 업무경감 도우미 — 공유 UI 컴포넌트
export function EmptyHint({ msg }: { msg: string }) {
  return <div className="card text-center py-10 text-sm text-slate-500">{msg}</div>
}

export function Selector({ label, value, options, onChange, suffix }: {
  label: string; value: number; options: number[]; onChange: (v: number) => void; suffix?: string
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      {label}
      <select value={value} onChange={(e) => onChange(+e.target.value)} className="bg-surface-900 border border-white/10 rounded-lg px-2 py-1 text-sm text-white">
        {options.map((o) => <option key={o} value={o}>{o}{suffix}</option>)}
      </select>
    </label>
  )
}

export function PrintStyles() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        .print-area, .print-area * { visibility: visible; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; color: #000 !important; }
        .print-area h3, .print-area p, .print-area td, .print-area th, .print-area span { color: #000 !important; }
        .print-area th { background: #f0f0f0 !important; }
        .print-area th, .print-area td { border-color: #000 !important; }
        .print-field {
          color: #000 !important; background: transparent !important;
          border: none !important; border-bottom: 1px solid #000 !important;
          border-radius: 0 !important; -webkit-appearance: none; appearance: none;
        }
        .no-print { display: none !important; }
      }
    `}</style>
  )
}
