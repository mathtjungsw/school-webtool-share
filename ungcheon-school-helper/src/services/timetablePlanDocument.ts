import { escapeHtml, printHtml } from '../utils/printHtml'
import {
  formatPlanDate,
  planKindLabel,
  slotPeriod,
  type TimetablePlanDraft,
  type TimetablePlanEntry,
} from './timetablePlan'

export const TIMETABLE_PLAN_DOCUMENT_CSS = `
.swap-plan{font-family:'바탕','Batang','함초롬바탕','맑은 고딕',serif;font-size:9pt;color:#000;width:100%;}
.attachment{font-size:9.5pt;margin:0 0 5mm;}
.swap-plan h1{width:122mm;text-align:center;font-size:18pt;font-weight:bold;letter-spacing:.08em;margin:0 auto 8mm;padding-bottom:3mm;border-bottom:0.7mm double #000;}
.approval{width:63.5mm;margin:0 0 6mm auto;border-collapse:collapse;table-layout:fixed;}
.approval th,.approval td{border:0.25mm solid #000;text-align:center;padding:0.8mm;font-size:9pt;font-weight:normal;}
.approval th{height:12.5mm;}
.approval .label{width:8mm;line-height:1.55;background:#c5e6f7;}
.approval .approver{background:#c5e6f7;}
.approval td{height:12.5mm;}
.meta-line{font-size:10pt;line-height:1.85;margin:0;}
.meta-line.date{padding-left:6.5mm;}
.section-title{font-size:10pt;font-weight:normal;margin:7mm 0 0.6mm;}
.plan-table,.terms{width:100%;border-collapse:collapse;table-layout:fixed;}
.plan-table{width:167mm;}
.plan-table th,.plan-table td,.terms th,.terms td{border:0.25mm solid #000;text-align:center;vertical-align:middle;padding:0.7mm 0.45mm;line-height:1.24;word-break:keep-all;overflow-wrap:anywhere;}
.plan-table th{font-size:8pt;font-weight:normal;background:#c5e6f7;}
.plan-table thead tr:nth-child(2) th{height:17.7mm;}
.plan-table td{font-size:8pt;height:9.2mm;}
.plan-table .group{font-size:9pt;height:6.1mm;}
.plan-table .spacer{background:#c5e6f7;padding:0;}
.terms{margin-top:0;width:169mm;}
.terms th{height:4.4mm;background:#dce5f6;font-size:8pt;line-height:1;font-weight:bold;}
.terms td{font-size:7.2pt;text-align:left;line-height:1.4;padding:0.8mm 1.5mm;}
.terms td:first-child,.terms td:last-child{text-align:center;}
.terms .exchange-row td{height:5.2mm;}
.terms .substitution-row td{height:24.5mm;}
.terms .change-row td{height:4.4mm;}
.terms .reference{color:#0000ff;font-weight:bold;}
.guide{font-size:8pt;margin:7.7mm 0 1mm;}
.signature{text-align:center;font-size:10pt;margin-top:3.5mm;}
.signature .school-signature{display:block;margin-top:5mm;}
@media print{.swap-plan{page-break-inside:avoid;}}
`

export function printTimetablePlan(draft: TimetablePlanDraft) {
  printHtml(buildTimetablePlanBody(draft), TIMETABLE_PLAN_DOCUMENT_CSS)
}

export function buildTimetablePlanHtml(draft: TimetablePlanDraft): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
body{margin:0;background:#e5e7eb;}*{box-sizing:border-box;}${TIMETABLE_PLAN_DOCUMENT_CSS}
.sheet{width:210mm;height:297mm;margin:0 auto;padding:24.3mm 18mm 8mm 23.3mm;background:#fff;overflow:hidden;}
@page{size:A4 portrait;margin:0;}</style></head><body>${buildTimetablePlanBody(draft)}</body></html>`
}

export function buildTimetablePlanBody(draft: TimetablePlanDraft) {
  const rows = [...draft.entries]
  while (rows.length < 6) rows.push(emptyEntry(rows.length))
  const reason = draft.meta.reason === '기타'
    ? `기타(${escapeHtml(draft.meta.customReason)})`
    : escapeHtml(draft.meta.reason)
  const period = draft.meta.startDate === draft.meta.endDate
    ? fullDate(draft.meta.startDate)
    : `${fullDate(draft.meta.startDate)} ~ ${fullDate(draft.meta.endDate)}`

  return `<div class="sheet"><article class="swap-plan">
    <p class="attachment">&lt;별첨 1&gt;</p>
    <h1>교환·보강 계획서</h1>
    <table class="approval">
      <tr><th class="label" rowspan="2">결<br>재</th><th class="approver">담당</th><th class="approver">담당 부장</th><th class="approver">교감</th></tr>
      <tr><td></td><td></td><td></td></tr>
    </table>
    <p class="meta-line">1. 사&nbsp;&nbsp;유(택1) : ${reason}</p>
    <p class="meta-line date">일&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;시 : &nbsp;${period}</p>
    <p class="section-title">2. 수업계획</p>
    <table class="plan-table">
      <colgroup>
        <col style="width:3.35%"><col style="width:6.79%"><col style="width:6.89%"><col style="width:6.89%"><col style="width:6.89%"><col style="width:6.89%">
        <col style="width:2.13%"><col style="width:6.69%"><col style="width:6.69%"><col style="width:6.69%"><col style="width:6.69%"><col style="width:6.69%">
        <col style="width:10.23%"><col style="width:10.94%"><col style="width:5.57%">
      </colgroup>
      <thead>
        <tr><th class="group" colspan="6">결강</th><th class="spacer" rowspan="2"></th><th class="group" colspan="8">교환·보강·변경</th></tr>
        <tr>
          <th>연번</th><th>월일<br>(요일)</th><th>교시</th><th>학반</th><th>과목</th><th>교사</th>
          <th>월일<br>(요일)</th><th>교시</th><th>학반</th><th>과목</th><th>①교사</th><th>①교사의<br>서명</th><th>보강/교환<br>/변경</th><th>비고</th>
        </tr>
      </thead>
      <tbody>${rows.map((entry, index) => planRow(entry, index, !entry.id && index === draft.entries.length)).join('')}</tbody>
    </table>
    <p class="guide">※ 용어 정리 및 입력 내용 안내</p>
    <table class="terms">
      <colgroup><col style="width:10%"><col style="width:78%"><col style="width:12%"></colgroup>
      <tr><th>용어</th><th>설명</th><th>수당 지급</th></tr>
      <tr class="exchange-row"><td>교환</td><td>동일교과, 타교과 상관없이 수업 교환하여 시간표만 변경되어 운영 <span class="reference">별첨1 제출</span></td><td>×</td></tr>
      <tr class="substitution-row"><td>보강</td><td>동일교과 또는 교과군에서 교사정보만 변경하여 운영<br>1) 동일교과, 생활·교양 또는 국어, 수학, 영어 각 교과군 내 보강&nbsp; <span class="reference">&lt;비고 1표기&gt; : 별첨1 제출</span><br>2) 사회, 과학, 체육·예술 각 교과군 내 보강&nbsp; <span class="reference">&lt;비고 2표기&gt; : 별첨1,2 제출</span></td><td>○</td></tr>
      <tr class="change-row"><td>변경</td><td>교환, 결보강을 제외하고 타교과에서 과목과 교사정보를 변경하여 운영 <span class="reference">별첨1 제출</span></td><td>○</td></tr>
    </table>
    <p class="signature">${fullDateKorean(draft.meta.documentDate)}<span class="school-signature">웅천고등학교 교사&nbsp;&nbsp;&nbsp;성명 : ${escapeHtml(draft.meta.author)}&nbsp;&nbsp;&nbsp;(인)</span></p>
  </article></div>`
}

function planRow(entry: TimetablePlanEntry, index: number, isFirstEmpty: boolean) {
  const empty = !entry.id
  const cells = empty
    ? [isFirstEmpty ? '이' : '', isFirstEmpty ? '하' : '', isFirstEmpty ? '여' : '', isFirstEmpty ? '백' : '', '', '', '', '', '', '', '', '', '']
    : [
        tableDate(entry.originalDate),
        String(slotPeriod(entry.originalSlotIndex)),
        entry.originalClass,
        entry.originalSubject,
        entry.originalTeacher,
        tableDate(entry.replacementDate),
        String(slotPeriod(entry.replacementSlotIndex)),
        entry.replacementClass,
        entry.replacementSubject,
        entry.replacementTeacher,
        '',
        planKindLabel(entry.kind),
        entry.note,
      ]
  return `<tr><td>${index + 1}</td>${cells.slice(0, 5).map(cell).join('')}<td></td>${cells.slice(5).map(cell).join('')}</tr>`
}

function cell(value: string) {
  return `<td>${escapeHtml(value).replace(/\n/g, '<br>')}</td>`
}

function tableDate(value: string) {
  return formatPlanDate(value).replace('(', '\n(')
}

function emptyEntry(index: number): TimetablePlanEntry {
  return {
    id: '',
    kind: 'exchange',
    originalSlotIndex: index,
    replacementSlotIndex: index,
    originalDate: '',
    replacementDate: '',
    originalTeacher: '',
    replacementTeacher: '',
    originalClass: '',
    replacementClass: '',
    originalSubject: '',
    replacementSubject: '',
    note: '',
    createdAt: '',
  }
}

function fullDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}. ${month}. ${day}.`
}

function fullDateKorean(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}
