import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import ReferenceMetadataView from "../components/ReferenceMetadata";
import {
  AUDIT_CASES,
  AUDIT_CHECKLISTS,
  AUDIT_REGULATIONS,
  type AuditChecklistItem,
} from "../data/auditEvidence";
import { escapePrintHtml, printDocument } from "../services/printing";

type Tab = "regulations" | "cases" | "checklists";
type CheckStatus =
  "unchecked" | "appropriate" | "needs-work" | "not-applicable";
interface SavedCheck {
  status: CheckStatus;
  note: string;
}

const STORAGE_KEY = "ungcheon:audit-evidence:checks:v1";
const STATUS_LABELS: Record<CheckStatus, string> = {
  unchecked: "확인 전",
  appropriate: "적정",
  "needs-work": "보완 필요",
  "not-applicable": "해당 없음",
};

function loadSaved(): Record<string, SavedCheck> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function includesQuery(values: string[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return (
    !normalized ||
    values.join(" ").toLocaleLowerCase("ko-KR").includes(normalized)
  );
}

function printChecklist(
  items: AuditChecklistItem[],
  saved: Record<string, SavedCheck>,
) {
  const rows = items
    .map((item, index) => {
      const value = saved[item.id] ?? { status: "unchecked", note: "" };
      return `<tr><td>${index + 1}</td><td>${escapePrintHtml(item.area)}</td><td>${escapePrintHtml(item.title)}</td><td>${escapePrintHtml(item.criterion)}</td><td>${escapePrintHtml(STATUS_LABELS[value.status])}</td><td>${escapePrintHtml(value.note)}</td></tr>`;
    })
    .join("");
  printDocument({
    title: "감사 자체점검표",
    orientation: "landscape",
    pageMode: "multi-page",
    bodyHtml: `<section class="sheet audit-print"><h1>감사 자체점검표</h1><p>출력일 ${escapePrintHtml(new Date().toLocaleDateString("ko-KR"))}</p><table><thead><tr><th>번호</th><th>분야</th><th>점검항목</th><th>확인기준</th><th>상태</th><th>메모</th></tr></thead><tbody>${rows}</tbody></table><footer>기준일 2026학년도 · 출처 경상남도교육청 학교업무 도움자료 · 최종 확인일 2026-08-26<br>※ 이 자료는 자체 확인을 돕는 참고자료이며 공식 감사 판단을 대신하지 않습니다.</footer></section>`,
    styles:
      ".audit-print{width:297mm;padding:10mm}.audit-print h1{text-align:center;font-size:18pt}.audit-print>p{text-align:right;margin:2mm 0 4mm}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}th,td{border:1px solid #444;padding:2mm;vertical-align:top;word-break:keep-all}th{background:#eef2f7}th:nth-child(1){width:6%}th:nth-child(2){width:15%}th:nth-child(3){width:18%}th:nth-child(4){width:31%}th:nth-child(5){width:12%}th:nth-child(6){width:18%}footer{margin-top:4mm;font-size:7pt;color:#555}",
  });
}

export default function AuditEvidenceCenterPage() {
  const [tab, setTab] = useState<Tab>("regulations");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [saved, setSaved] = useState<Record<string, SavedCheck>>(loadSaved);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);
  useEffect(() => {
    setCategory("전체");
  }, [tab]);

  const categories = useMemo(() => {
    const values =
      tab === "regulations"
        ? AUDIT_REGULATIONS.map((item) => item.category)
        : tab === "cases"
          ? AUDIT_CASES.map((item) => item.category)
          : AUDIT_CHECKLISTS.map((item) => item.area);
    return ["전체", ...new Set(values)];
  }, [tab]);
  const regulations = useMemo(
    () =>
      AUDIT_REGULATIONS.filter(
        (item) =>
          (category === "전체" || item.category === category) &&
          includesQuery(
            [
              item.title,
              item.category,
              item.summary,
              item.appliesTo,
              ...item.keywords,
            ],
            query,
          ),
      ),
    [category, query],
  );
  const cases = useMemo(
    () =>
      AUDIT_CASES.filter(
        (item) =>
          (category === "전체" || item.category === category) &&
          includesQuery(
            [
              item.title,
              item.category,
              item.issue,
              item.cause,
              ...item.prevention,
              ...item.keywords,
            ],
            query,
          ),
      ),
    [category, query],
  );
  const checks = useMemo(
    () =>
      AUDIT_CHECKLISTS.filter(
        (item) =>
          (category === "전체" || item.area === category) &&
          includesQuery(
            [
              item.title,
              item.area,
              item.criterion,
              ...item.evidenceExamples,
              ...item.keywords,
            ],
            query,
          ),
      ),
    [category, query],
  );
  const needsWork = Object.values(saved).filter(
    (item) => item.status === "needs-work",
  ).length;

  const updateCheck = (id: string, patch: Partial<SavedCheck>) =>
    setSaved((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status ?? "unchecked",
        note: current[id]?.note ?? "",
        ...patch,
      },
    }));

  return (
    <div className="min-h-full p-5 text-slate-950">
      <header className="rounded-3xl border border-amber-300 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-amber-800">
              경상남도교육청 학교업무 도움자료 기반
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black">
              <ShieldAlert className="text-amber-700" />
              감사 증빙센터
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              규정·감사 사례·자체점검표를 한곳에서 찾아보고 업무 누락을
              예방합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-relaxed text-rose-900">
            참고자료이며 공식 감사 판단을 대신하지 않습니다.
            <br />
            민감한 증빙 원문은 외부 서버로 전송하지 않습니다.
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setTab("regulations")}
            className={`audit-tab ${tab === "regulations" ? "active" : ""}`}
          >
            <BookOpenCheck size={18} />
            <span>
              <b>규정 확인</b>
              <small>{AUDIT_REGULATIONS.length}개 기준자료</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("cases")}
            className={`audit-tab ${tab === "cases" ? "active" : ""}`}
          >
            <FileSearch size={18} />
            <span>
              <b>감사 사례 검색</b>
              <small>{AUDIT_CASES.length}개 예방카드</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("checklists")}
            className={`audit-tab ${tab === "checklists" ? "active" : ""}`}
          >
            <ClipboardCheck size={18} />
            <span>
              <b>자체점검표 확인</b>
              <small>보완 필요 {needsWork}건</small>
            </span>
          </button>
        </div>
      </header>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[260px] flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-amber-500"
              placeholder="업무명·규정·감사 사례·점검항목 검색"
            />
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-950"
          >
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          {tab === "checklists" && (
            <>
              <button
                type="button"
                onClick={() => printChecklist(checks, saved)}
                className="rounded-xl border border-amber-400 bg-amber-200 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300"
              >
                <Printer size={15} className="mr-1 inline" />
                현재 목록 출력
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "현재 PC에 저장된 자체점검 상태와 메모를 모두 초기화할까요?",
                    )
                  )
                    setSaved({});
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
              >
                <RotateCcw size={15} className="mr-1 inline" />
                초기화
              </button>
            </>
          )}
        </div>
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-950">
          담당 역할 또는 부서는 도교육청 예시이며, 실제 담당은 학교 업무분장표에
          따릅니다.
        </p>
      </section>

      <main className="mt-4 space-y-3 pb-10">
        {tab === "regulations" &&
          regulations.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">
                  {item.category}
                </span>
                <h2 className="text-base font-black">{item.title}</h2>
              </div>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">
                {item.summary}
              </p>
              <p className="mt-2 text-xs font-bold text-slate-600">
                적용 대상 예시: {item.appliesTo}
              </p>
              <ReferenceMetadataView metadata={item} />
              <p
                className="mt-2 text-[11px] font-semibold text-slate-500"
                title={item.sourceFile}
              >
                원문 자료: {item.sourceFile}
              </p>
            </article>
          ))}
        {tab === "cases" &&
          cases.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-900">
                  {item.category}
                </span>
                <h2 className="text-base font-black">{item.title}</h2>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-rose-50 p-3">
                  <b className="text-xs text-rose-900">예방하려는 상황</b>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800">
                    {item.issue}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <b className="text-xs text-slate-800">자주 생기는 원인</b>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">
                    {item.cause}
                  </p>
                </div>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {item.prevention.map((value) => (
                  <li
                    key={value}
                    className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-relaxed text-emerald-950"
                  >
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                    {value}
                  </li>
                ))}
              </ul>
              <ReferenceMetadataView metadata={item} />
            </article>
          ))}
        {tab === "checklists" &&
          checks.map((item) => {
            const value = saved[item.id] ?? {
              status: "unchecked" as CheckStatus,
              note: "",
            };
            return (
              <article
                key={item.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${value.status === "needs-work" ? "border-rose-300" : value.status === "appropriate" ? "border-emerald-300" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-black text-amber-800">
                      {item.area}
                    </span>
                    <h2 className="mt-1 text-base font-black">{item.title}</h2>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
                      {item.criterion}
                    </p>
                  </div>
                  <select
                    value={value.status}
                    onChange={(event) =>
                      updateCheck(item.id, {
                        status: event.target.value as CheckStatus,
                      })
                    }
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-950"
                  >
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <b className="text-xs text-slate-800">증빙 예시</b>
                    <p className="mt-1 text-xs font-semibold text-slate-700">
                      {item.evidenceExamples.join(" · ")}
                    </p>
                  </div>
                  <textarea
                    value={value.note}
                    onChange={(event) =>
                      updateCheck(item.id, { note: event.target.value })
                    }
                    rows={2}
                    className="resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm font-semibold text-slate-950 outline-none focus:border-amber-500"
                    placeholder="확인 내용이나 보완할 사항을 이 PC에 메모하세요."
                  />
                </div>
                <ReferenceMetadataView metadata={item} compact />
              </article>
            );
          })}
        {((tab === "regulations" && !regulations.length) ||
          (tab === "cases" && !cases.length) ||
          (tab === "checklists" && !checks.length)) && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center font-bold text-slate-600">
            검색 조건에 맞는 자료가 없습니다.
          </div>
        )}
      </main>
    </div>
  );
}
