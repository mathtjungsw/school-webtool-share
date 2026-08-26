const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requireText = (content, value, message) => {
  if (!content.includes(value)) throw new Error(message);
};

const audit = read("src/data/auditEvidence.ts");
const auditPage = read("src/pages/AuditEvidenceCenterPage.tsx");
const assistant = read("src/services/workAssistantSearch.ts");
const assistantView = read("src/components/WorkAssistantSearch.tsx");
const cards = read("src/services/localLuckyCard.ts");
const widget = read("src/components/widget/WidgetApp.tsx");
const widgetCss = read("src/components/widget/widget.css");
const hwatuArt = read("src/components/widget/HwatuCardArt.tsx");
const printEngine = read("src/services/printing/PrintEngine.ts");
const privacyPage = read("src/pages/RecordPrivacyBlindPage.tsx");
const privacyTool = read("src/public/embedded-tools/record-privacy-blind.html");
const briefing = read("src/components/dashboard/TodayBriefingWidget.tsx");

requireText(auditPage, "규정 확인", "감사 규정 탭이 없습니다.");
requireText(auditPage, "감사 사례", "감사 사례 탭이 없습니다.");
requireText(auditPage, "자체점검표", "자체점검표 탭이 없습니다.");
requireText(
  auditPage,
  "localStorage",
  "자체점검 상태가 로컬 저장되지 않습니다.",
);
requireText(
  assistant + assistantView,
  "도교육청 예시이며, 실제 담당은 학교 업무분장표에 따릅니다.",
  "업무 경로의 담당부서 안내 문구가 없습니다.",
);
for (const key of ["standardDate", "source:", "verifiedAt"])
  requireText(audit, key, `기준자료 메타데이터 ${key}가 없습니다.`);

for (const value of [
  "오늘의 행운카드",
  "궁금한 내용을 머릿속으로 떠올리며 클릭해주세요",
  "drawLocalLuckyCard",
  "luckyCardKind",
])
  requireText(widget, value, `행운카드 UI 항목이 없습니다: ${value}`);
for (const value of [
  "lucky-kind-switch",
  "카드 닫기",
  "HwatuCardArt",
  "widget-popover",
  "업무센터에서 전체 보기",
  "알림 전체 보기",
])
  requireText(widget + widgetCss, value, `위젯 개선 항목이 없습니다: ${value}`);
for (const value of [
  "isWidgetActionableChange",
  'change.status === "pending"',
  "lastLessonDate >= today",
  'title: "수업 변경 승인 요청"',
])
  requireText(widget, value, `위젯 새 알림 필터가 없습니다: ${value}`);
for (const forbidden of [
  "수업 변경 · ${change.status",
  'title: "수업 변경 · 취소"',
]) {
  if (widget.includes(forbidden))
    throw new Error(
      `처리 완료된 수업 변경을 새 알림으로 만드는 코드가 남아 있습니다: ${forbidden}`,
    );
}
for (const value of [
  "widget-event-filters",
  "showPersonalSchedules",
  "showPersonalTasksInEvents",
  "showNeisSchedules",
  "showCommitteeEvents",
  "showWeeklyPlans",
  "showGateDuty",
  "showMealDuty",
  "showCreativeActivities",
  "대시보드 달력의 체크박스와 별도로",
])
  requireText(
    widget + widgetCss,
    value,
    `위젯 주요 일정 독립 필터가 없습니다: ${value}`,
  );
for (const forbidden of [
  "listPulledLessonsForTeacher(teacher, today, today).map",
  'kind: "pulled"',
  'kind: "timetable-change"',
]) {
  if (widget.includes(forbidden))
    throw new Error(
      `당김수업·시간표 변경이 주요 일정에 중복 표시될 수 있습니다: ${forbidden}`,
    );
}
for (const value of [
  "kind === 'tarot'",
  "crypto.getRandomValues",
  "previousId",
])
  requireText(cards, value, `행운카드 무작위 로직이 없습니다: ${value}`);
for (const id of [
  "pine",
  "plum",
  "cherry",
  "wisteria",
  "iris",
  "peony",
  "clover",
  "moon",
  "chrysanthemum",
  "maple",
  "paulownia",
  "willow",
])
  requireText(hwatuArt, `case "${id}"`, `화투 SVG 월별 그림이 없습니다: ${id}`);
const unsafe = [
  "죽음",
  "사망",
  "질병",
  "사고가",
  "손실",
  "불행",
  "파산",
  "이별하게",
  "해고",
];
for (const word of unsafe) {
  if (cards.includes(word))
    throw new Error(`행운카드에 불안감을 줄 수 있는 표현이 있습니다: ${word}`);
}

for (const value of [
  "calculatePrintPreflight",
  "A4 한 장 출력 사전검사",
  "한 장 자동 맞춤",
  "estimatedPages",
])
  requireText(printEngine, value, `A4 출력 사전검사 항목이 없습니다: ${value}`);

requireText(
  privacyTool,
  "body{background:#f8fafc;color:#0f172a}",
  "생기부 블라인드 내장 화면의 밝은 모드 보정이 없습니다.",
);
requireText(
  privacyPage,
  "border-slate-300 bg-slate-100",
  "생기부 블라인드 호스트 화면이 밝게 고정되지 않았습니다.",
);
requireText(
  briefing,
  "border-sky-300 bg-sky-100 text-sky-950",
  "오늘 브리핑 선택 탭의 밝은 대비가 적용되지 않았습니다.",
);

const tarotCount = (cards.match(/card\('[a-z]+',/g) || []).length;
if (tarotCount < 24)
  throw new Error(`행운카드 수가 너무 적습니다: ${tarotCount}`);
console.log(`PASS 감사 증빙센터·업무 경로·기준자료 메타데이터`);
console.log(`PASS A4 출력 사전검사·자동 맞춤`);
console.log(
  `PASS 로컬 행운카드 ${tarotCount}장 · 타로/화투 · 즉시 중복 방지 · 안전문구`,
);
console.log(`PASS 화투 SVG 12개월 · 종류 전환 · 카드 닫기`);
console.log(`PASS 위젯 미완료 업무·새 알림 요약 패널 · 원본 상태 비변경`);
console.log(`PASS 생기부 블라인드·감사 증빙센터·오늘 브리핑 밝은 화면`);
