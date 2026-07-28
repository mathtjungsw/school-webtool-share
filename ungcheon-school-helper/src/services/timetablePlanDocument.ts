import { escapeHtml, printHtml } from '../utils/printHtml'
import {
  formatPlanDate,
  planKindLabel,
  slotPeriod,
  type TimetablePlanDraft,
  type TimetablePlanEntry,
} from './timetablePlan'

export const TIMETABLE_PLAN_DOCUMENT_CSS = `
.swap-plan{font-family:'바탕','Batang','맑은 고딕',serif;font-size:9pt;color:#000;width:100%;}
.swap-plan h1{text-align:center;font-size:18pt;letter-spacing:.12em;margin:0 0 8mm;}
.approval{width:64mm;margin-left:auto;margin-bottom:8mm;border-collapse:collapse;table-layout:fixed;}
.approval th,.approval td{border:1px solid #000;text-align:center;height:10mm;padding:1mm;}
.approval .label{width:8mm;line-height:1.5;}
.approval td{height:14mm;}
.meta-line{font-size:10pt;line-height:1.9;margin-left:2mm;}
.section-title{font-size:11pt;font-weight:bold;margin:5mm 0 2mm;}
.plan-table,.terms{width:100%;border-collapse:collapse;table-layout:fixed;}
.plan-table th,.plan-table td,.terms th,.terms td{border:1px solid #000;text-align:center;vertical-align:middle;padding:1.1mm .7mm;line-height:1.25;word-break:keep-all;}
.plan-table th{font-size:7.5pt;background:#f4f4f4;}
.plan-table td{font-size:7.5pt;height:9mm;}
.plan-table .group{font-size:9pt;height:6mm;}
.terms{margin-top:2mm;}
.terms th{background:#f4f4f4;font-size:8pt;}
.terms td{font-size:7.2pt;text-align:left;line-height:1.35;padding:1mm 1.5mm;}
.terms td:first-child,.terms td:last-child{text-align:center;}
.guide{font-size:8pt;margin:4mm 0 1mm;}
.signature{text-align:right;font-size:10pt;line-height:2;margin-top:4mm;padding-right:8mm;}
@media print{
  .sheet{padding:10mm 14mm;}
  .swap-plan{page-break-inside:avoid;}
}
`

export function printTimetablePlan(draft: TimetablePlanDraft) {
  printHtml(buildTimetablePlanBody(draft), TIMETABLE_PLAN_DOCUMENT_CSS)
}

export function buildTimetablePlanHwpBytes(draft: TimetablePlanDraft): number[] {
  return Array.from(new TextEncoder().encode('﻿' + buildTimetablePlanHtml(draft)))
}

export function buildTimetablePlanHtml(draft: TimetablePlanDraft): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
body{margin:0;background:#e5e7eb;}*{box-sizing:border-box;}${TIMETABLE_PLAN_DOCUMENT_CSS}
.sheet{width:210mm;min-height:297mm;margin:0 auto;padding:10mm 14mm;background:#fff;}
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
    <h1>교환·보강 계획서</h1>
    <table class="approval">
      <tr><th class="label" rowspan="2">결<br>재</th><th>담당</th><th>담당 부장</th><th>교감</th></tr>
      <tr><td></td><td></td><td></td></tr>
    </table>
    <p class="meta-line"><strong>1. 사&nbsp;&nbsp;유(택1)</strong> : ${reason}</p>
    <p class="meta-line">&nbsp;&nbsp;&nbsp;일&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;시 : ${period}</p>
    <p class="section-title">2. 수업계획</p>
    <table class="plan-table">
      <colgroup>
        <col style="width:4%"><col style="width:7%"><col style="width:5%"><col style="width:6%"><col style="width:8%"><col style="width:7%">
        <col style="width:2%"><col style="width:7%"><col style="width:5%"><col style="width:6%"><col style="width:8%"><col style="width:7%">
        <col style="width:8%"><col style="width:9%"><col style="width:11%">
      </colgroup>
      <thead>
        <tr><th class="group" colspan="6">결강</th><th rowspan="2"></th><th class="group" colspan="8">교환·보강·변경</th></tr>
        <tr>
          <th>연번</th><th>월일<br>(요일)</th><th>교시</th><th>학반</th><th>과목</th><th>교사</th>
          <th>월일<br>(요일)</th><th>교시</th><th>학반</th><th>과목</th><th>①교사</th><th>①교사의<br>서명</th><th>보강/교환<br>/변경</th><th>비고</th>
        </tr>
      </thead>
      <tbody>${rows.map((entry, index) => planRow(entry, index)).join('')}</tbody>
    </table>
    <p class="guide">※ 용어 정리 및 입력 내용 안내</p>
    <table class="terms">
      <colgroup><col style="width:10%"><col style="width:78%"><col style="width:12%"></colgroup>
      <tr><th>용어</th><th>설명</th><th>수당 지급</th></tr>
      <tr><td>교환</td><td>동일교과, 타교과 상관없이 수업 교환하여 시간표만 변경되어 운영 · 별첨1 제출</td><td>×</td></tr>
      <tr><td>보강</td><td>동일교과 또는 교과군에서 교사정보만 변경하여 운영<br>1) 동일교과, 생활·교양 또는 국어·수학·영어 각 교과군 내 보강 &lt;비고 1&gt; : 별첨1 제출<br>2) 사회·과학·체육·예술 각 교과군 내 보강 &lt;비고 2&gt; : 별첨1, 2 제출</td><td>○</td></tr>
      <tr><td>변경</td><td>교환, 결보강을 제외하고 타교과에서 과목과 교사정보를 변경하여 운영 · 별첨1 제출</td><td>○</td></tr>
    </table>
    <p class="signature">${fullDateKorean(draft.meta.documentDate)}<br>웅천고등학교 교사&nbsp;&nbsp;&nbsp;성명 : ${escapeHtml(draft.meta.author)}&nbsp;&nbsp;&nbsp;(인)</p>
  </article></div>`
}

function planRow(entry: TimetablePlanEntry, index: number) {
  const empty = !entry.id
  const cells = empty
    ? ['', '', '', '', '', '', '', '', '', '', '', '', '']
    : [
        formatPlanDate(entry.originalDate),
        String(slotPeriod(entry.originalSlotIndex)),
        entry.originalClass,
        entry.originalSubject,
        entry.originalTeacher,
        formatPlanDate(entry.replacementDate),
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
  return `<td>${escapeHtml(value)}</td>`
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
