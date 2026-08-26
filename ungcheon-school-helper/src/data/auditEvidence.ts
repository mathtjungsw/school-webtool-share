export interface ReferenceMetadata {
  standardDate: string
  source: string
  verifiedAt: string
  sourceFile?: string
}

export interface AuditRegulation extends ReferenceMetadata {
  id: string
  title: string
  category: string
  summary: string
  appliesTo: string
  keywords: string[]
}

export interface AuditCase extends ReferenceMetadata {
  id: string
  category: string
  title: string
  issue: string
  cause: string
  prevention: string[]
  keywords: string[]
}

export interface AuditChecklistItem extends ReferenceMetadata {
  id: string
  area: string
  title: string
  criterion: string
  evidenceExamples: string[]
  keywords: string[]
}

const HELP_ROOT = '경상남도교육청 학교업무 도움자료 > 일반행정 > 감사일반'
const VERIFIED_AT = '2026-08-26'

export const AUDIT_REGULATIONS: AuditRegulation[] = [
  {
    id: 'audit-plan-2026', title: '2026년 자체감사 계획', category: '감사 운영',
    summary: '연간 자체감사의 운영 방향과 감사 종류·대상·처리 흐름을 확인하는 기본 자료입니다.',
    appliesTo: '학교 자체감사 담당자와 업무별 점검 참여자', standardDate: '2026학년도',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '03.2026년_자체감사_계획.pdf',
    keywords: ['자체감사', '감사 계획', '감사 일정', '감사 대상'],
  },
  {
    id: 'autonomous-audit-operation', title: '2026년 자율형 종합감사 운영 매뉴얼', category: '감사 운영',
    summary: '자율형 종합감사의 단계별 운영, 역할과 준비 절차를 확인하는 자료입니다.',
    appliesTo: '자율형 종합감사 대상 학교와 감사 담당자', standardDate: '2026학년도',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '06. 2026년 자율형 종합감사 운영 매뉴얼.pdf',
    keywords: ['자율형 종합감사', '운영 매뉴얼', '자체 점검', '교차 점검'],
  },
  {
    id: 'autonomous-audit-check', title: '2026년 자율형 종합감사 자율점검 매뉴얼', category: '자체점검',
    summary: '학사·인사·학생생활·정보보호·회계 등 분야별 자체점검 기준과 확인 방향을 안내합니다.',
    appliesTo: '각 업무 담당자와 자체점검 확인자', standardDate: '2026학년도',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '07. 2026년 자율형 종합감사 자율점검 매뉴얼.pdf',
    keywords: ['자율점검', '자체점검표', '학사관리', '교육과정', '회계'],
  },
  {
    id: 'audit-consulting', title: '사전컨설팅감사 운영 계획', category: '사전 상담',
    summary: '적극적인 업무 추진 과정에서 규정 해석이나 절차가 불명확할 때 사전에 확인할 제도를 안내합니다.',
    appliesTo: '사전컨설팅감사 신청을 검토하는 업무 담당자', standardDate: '관리자 보관본 기준',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '07. 사전컨설팅감사 운영 계획.hwp',
    keywords: ['사전컨설팅', '규정 해석', '적극행정', '사전 상담'],
  },
  {
    id: 'active-administration', title: '적극행정 면책제도 활성화 계획', category: '적극행정',
    summary: '공익을 위한 적극적인 업무 처리와 면책제도의 취지·확인 절차를 살펴보는 자료입니다.',
    appliesTo: '적극행정 및 감사 대응 업무 담당자', standardDate: '관리자 보관본 기준',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '05. 적극행정 면책제도 활성화 계획.hwp',
    keywords: ['적극행정', '면책', '공익', '감사 대응'],
  },
  {
    id: 'workplace-conduct', title: '2026년 갑질·직장 내 괴롭힘 근절 추진 계획', category: '행동강령·조직문화',
    summary: '갑질과 직장 내 괴롭힘 예방·신고·보호와 관련된 연간 추진 방향을 확인합니다.',
    appliesTo: '전 교직원 및 관련 업무 담당자', standardDate: '2026학년도',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '04. 2026년 갑질·직장 내 괴롭힘 근절 추진 계획.hwpx',
    keywords: ['갑질', '직장 내 괴롭힘', '조직문화', '신고', '예방'],
  },
  {
    id: 'misconduct-standard', title: '경남 공무원 비위사건 처리기준', category: '행동강령·복무',
    summary: '비위사건 처리와 관련한 기준자료의 위치를 확인합니다. 앱은 처분 여부를 판단하지 않습니다.',
    appliesTo: '인사·복무·감사 담당자', standardDate: '관리자 보관본 기준',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: '08. (경남)공무원 비위사건처리기준.hwp',
    keywords: ['비위사건', '처리기준', '복무', '인사'],
  },
  {
    id: 'conduct-family-events', title: '경조사 관련 공무원 행동강령 준수사항', category: '행동강령·복무',
    summary: '경조사 통지와 금품 수수 등 행동강령 관련 유의사항을 확인하는 참고자료입니다.',
    appliesTo: '전 교직원', standardDate: '2023년 안내자료',
    source: HELP_ROOT, verifiedAt: VERIFIED_AT, sourceFile: "09. 경조사 관련 '공무원 행동강령' 등 준수사항 안내(2023).hwp",
    keywords: ['경조사', '행동강령', '금품', '통지'],
  },
]

export const AUDIT_CASES: AuditCase[] = [
  {
    id: 'case-budget-proof', category: '예산·회계', title: '예산 집행 증빙과 사전 절차 누락 예방',
    issue: '지출 목적과 근거가 불명확하거나 사전 품의·검수·증빙의 연결이 끊기는 사례를 예방합니다.',
    cause: '업무 진행을 먼저 하고 회계 서류를 나중에 맞추거나, 담당자 간 증빙 인계가 누락되는 경우가 있습니다.',
    prevention: ['집행 전 예산과목·근거·결재 절차 확인', '납품·검수·지출 증빙의 날짜와 내용을 서로 대조', '업무 완료 전 증빙 저장 위치 확인'],
    keywords: ['예산', '지출', '품의', '검수', '증빙'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-contract-split', category: '계약·구매', title: '계약 절차와 분할 집행 확인',
    issue: '유사한 목적의 구매가 반복되거나 계약 절차 선택 근거가 부족한 상황을 예방합니다.',
    cause: '연간 수요를 함께 검토하지 않고 건별로 처리하거나 계약 기준을 확인하지 않은 경우가 있습니다.',
    prevention: ['연간·분기 수요를 먼저 모아 유사 구매 여부 확인', '계약 방법과 업체 선정 근거 기록', '견적·계약·검수 자료를 한 업무에 연결'],
    keywords: ['계약', '구매', '분할', '견적', '업체'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-travel-pay', category: '복무·여비', title: '출장·여비와 실제 일정 대조',
    issue: '출장 시간·장소와 근무·수업·다른 지급자료가 서로 맞지 않는 상황을 예방합니다.',
    cause: '일정 변경 후 출장 기록이나 수업 조정 자료를 함께 수정하지 않은 경우가 있습니다.',
    prevention: ['출장 전 수업·회의 일정 충돌 확인', '일정 변경 시 관련 기록을 함께 수정', '여비 지급 전 실제 출장 내용과 중복 여부 확인'],
    keywords: ['출장', '여비', '복무', '수업 조정', '중복 지급'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-overtime', category: '복무·여비', title: '시간외근무 사전명령과 실제 근무 확인',
    issue: '시간외근무의 사전명령·확인·수당 자료가 서로 다르게 남는 상황을 예방합니다.',
    cause: '근무 사유나 시간을 구체적으로 기록하지 않거나 변경 내용을 반영하지 않은 경우가 있습니다.',
    prevention: ['사전명령 여부와 구체적인 업무내용 확인', '출퇴근 기록과 신청시간 대조', '출장·연가 등 같은 시간대 복무자료와 중복 확인'],
    keywords: ['시간외근무', '초과근무', '수당', '복무'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-assets', category: '물품·시설', title: '물품 취득·검수·대장 등록 연결',
    issue: '구매한 물품의 검수, 대장 등록, 보관장소와 실제 보유 상태가 맞지 않는 상황을 예방합니다.',
    cause: '구매 담당과 물품 담당 사이의 인계가 늦거나 이동·폐기 이력이 기록되지 않은 경우가 있습니다.',
    prevention: ['검수 직후 물품대장 등록 확인', '보관장소·사용자 변경 이력 기록', '불용·폐기 시 승인과 저장매체 처리 확인'],
    keywords: ['물품', '검수', '대장', '불용', '폐기'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-council', category: '학교운영', title: '학교운영위원회 심의·회의록·공개 확인',
    issue: '심의 대상 누락, 정족수 확인 부족, 회의록·결과 공개 누락을 예방합니다.',
    cause: '안건별 법정 절차와 공개 여부를 하나의 흐름으로 관리하지 않은 경우가 있습니다.',
    prevention: ['안건 접수 시 심의·자문 대상 여부 확인', '회의 전 위원 정족수와 제척 가능성 확인', '회의 후 회의록·심의결과 공개와 후속업무 확인'],
    keywords: ['학교운영위원회', '심의', '정족수', '회의록', '공개'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-student-assessment', category: '학사·평가', title: '평가계획과 실제 평가·성적 처리 일치',
    issue: '평가계획, 문항·배점, 결시 처리와 실제 성적 반영이 달라지는 상황을 예방합니다.',
    cause: '평가 변경 시 계획과 안내·처리기준을 함께 갱신하지 않은 경우가 있습니다.',
    prevention: ['평가 전 계획·배점·반영비율 검산', '변경 시 협의·승인·학생 안내 확인', '성적 반영 전 결시·누락·총점 대조'],
    keywords: ['평가계획', '성적', '배점', '결시', '반영비율'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-privacy', category: '정보보호', title: '문서·홈페이지 공개 전 개인정보 점검',
    issue: '숨김 행·시트, 문서 속성, 검색 가능한 PDF 등에 개인정보가 남는 상황을 예방합니다.',
    cause: '화면에서 보이지 않는 정보까지 삭제되었다고 오해하거나 공개용 복사본을 만들지 않은 경우가 있습니다.',
    prevention: ['공개용 복사본을 별도로 생성', '숨김 영역·메모·문서 속성·외부 연결 확인', 'PDF 변환 후 이름·학번 등 개인정보 재검색'],
    keywords: ['개인정보', '홈페이지', '공개', '숨김 시트', 'PDF'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
  {
    id: 'case-safety', category: '물품·시설', title: '시설 법정점검과 후속조치 누락 예방',
    issue: '점검은 실시했으나 결과 기록이나 보수·후속 확인이 이어지지 않는 상황을 예방합니다.',
    cause: '점검일정, 결과보고, 수리업무가 서로 다른 문서에서 관리되는 경우가 있습니다.',
    prevention: ['시설별 점검주기와 다음 점검일 관리', '점검 결과와 보완조치 담당자·기한 연결', '완료 후 사진·검사결과·비용 증빙 확인'],
    keywords: ['시설', '안전점검', '법정점검', '보수', '후속조치'], standardDate: '2026학년도', source: `${HELP_ROOT} > 감사사례집`, verifiedAt: VERIFIED_AT,
    sourceFile: '08. 2026년 자율형 종합감사 감사사례집.pdf',
  },
]

function checklist(id: string, area: string, title: string, criterion: string, evidenceExamples: string[], keywords: string[]): AuditChecklistItem {
  return {
    id, area, title, criterion, evidenceExamples, keywords,
    standardDate: '2026학년도', source: `${HELP_ROOT} > 분야별 자율점검표`, verifiedAt: VERIFIED_AT,
    sourceFile: `2026. 자율형종합감사 자율점검 매뉴얼 점검표_${area}.hwp`,
  }
}

export const AUDIT_CHECKLISTS: AuditChecklistItem[] = [
  checklist('middle-academic-plan', '중등 학사관리', '학사운영계획과 실제 운영 확인', '연간 학사일정과 실제 수업·행사·휴업일 운영이 일치하는지 확인합니다.', ['학교교육계획', '학사일정 변경 결재', '가정통신문'], ['학사일정', '수업일수', '휴업일']),
  checklist('middle-attendance', '중등 학사관리', '출결 처리 근거 확인', '출결 종류와 인정 사유, 증빙, NEIS 입력 내용이 일치하는지 확인합니다.', ['출결 증빙', '학급 출결 자료', 'NEIS 확인자료'], ['출결', '결석', '지각', '조퇴']),
  checklist('curriculum-organization', '중등 교육과정 평가', '교육과정 편성 기준 확인', '학년별 교육과정 편성과 시수·학점이 적용 기준에 맞는지 확인합니다.', ['교육과정 편성표', '교육과정위원회 회의록', '시수 검산표'], ['교육과정', '편성표', '시수', '학점']),
  checklist('assessment-plan', '중등 교육과정 평가', '평가계획과 성적 처리 일치', '평가계획의 영역·배점·반영비율·결시처리와 실제 성적 처리가 일치하는지 확인합니다.', ['평가계획', '교과협의록', '성적 검산자료'], ['평가계획', '성적', '배점', '결시']),
  checklist('teacher-personnel', '교원인사·교육활동보호', '인사·복무 처리 근거 확인', '인사와 복무 처리에 필요한 승인·근거·기간이 정확한지 확인합니다.', ['인사발령 자료', '복무 결재', '업무분장표'], ['교원인사', '복무', '업무분장']),
  checklist('teacher-protection', '교원인사·교육활동보호', '교육활동 보호 절차 확인', '교육활동 침해 예방·대응과 관련된 계획·안내·기록의 구비 여부를 확인합니다.', ['교육활동 보호 계획', '교직원 안내자료', '관련 회의자료'], ['교육활동보호', '교권', '예방']),
  checklist('student-guidance', '학생생활교육', '학생생활교육 절차 확인', '학교규칙과 학생생활교육 처리 절차가 일관되게 적용되는지 확인합니다.', ['학교규칙', '학생생활교육 계획', '심의·협의 기록'], ['학생생활', '학교규칙', '생활교육']),
  checklist('violence-prevention', '학생생활교육', '학교폭력 예방·처리 자료 확인', '예방교육과 사안 처리 단계별 기록·통지·보호조치의 누락 여부를 확인합니다.', ['예방교육 실적', '사안 처리 기록', '보호·지원 기록'], ['학교폭력', '예방교육', '사안처리']),
  checklist('science-safety', '과학·직업교육·정보보호', '과학실 안전관리 확인', '과학실 안전점검, 시약·폐액 관리, 안전교육 기록을 확인합니다.', ['안전점검표', '시약·폐액 대장', '안전교육 자료'], ['과학실', '안전', '시약', '폐액']),
  checklist('privacy-security', '과학·직업교육·정보보호', '개인정보·정보보안 확인', '개인정보 최소수집, 접근권한, 공개 전 점검과 파기 절차를 확인합니다.', ['개인정보 처리대장', '권한 점검표', '파기 기록'], ['개인정보', '정보보안', '권한', '파기']),
  checklist('physical-education', '체육교육·학교보건', '체육활동 안전계획 확인', '체육수업·행사의 사전 안전점검과 비상대응 계획을 확인합니다.', ['안전계획', '시설 점검표', '비상연락망'], ['체육', '안전계획', '행사']),
  checklist('school-health', '체육교육·학교보건', '학교보건 업무 기록 확인', '보건교육, 건강관리, 감염병 대응 관련 계획과 기록을 확인합니다.', ['학교보건계획', '교육 실적', '대응 기록'], ['학교보건', '감염병', '보건교육']),
  checklist('library-operation', '독서교육·학교도서관', '도서관 운영과 자료관리 확인', '도서 구입·등록·제적과 독서교육 운영자료가 적절히 관리되는지 확인합니다.', ['도서 구입 자료', '도서대장', '운영계획'], ['도서관', '도서', '독서교육']),
  checklist('special-education', '특수교육', '특수교육 운영자료 확인', '개별화교육과 관련 지원·회의·보호자 안내자료의 구비 여부를 확인합니다.', ['개별화교육계획', '지원팀 회의록', '보호자 안내자료'], ['특수교육', '개별화교육', '지원팀']),
  checklist('after-school', '방과후학교', '방과후학교 운영 절차 확인', '수요조사, 강사선정, 출결·회계·만족도 자료가 운영계획과 일치하는지 확인합니다.', ['운영계획', '강사 계약자료', '출결부', '정산자료'], ['방과후학교', '강사', '출결', '정산']),
]
