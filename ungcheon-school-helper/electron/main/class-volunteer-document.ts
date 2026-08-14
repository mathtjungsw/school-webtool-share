import { readFileSync } from 'fs'
import JSZip from 'jszip'

export interface ClassVolunteerStudentInput {
  studentId: string
  name: string
  hours: number | string
  remarks?: string
}

export interface ClassVolunteerDocumentInput {
  activityName: string
  startDate: string
  endDate: string
  institution: string
  area: 'neighbor' | 'environment' | 'campaign'
  location: string
  activityContent: string
  confirmTeacher: string
  schoolName: string
  commonRemarks: string
  grade: string
  className: string
  periodLabel: string
  certificateDate: string
  students: ClassVolunteerStudentInput[]
  totalStudents?: number
}

export interface CoordinatorVolunteerDocumentInput {
  activityContent: string
  startDate: string
  endDate: string
  grade: string
  hours: number | string
  confirmTeacher: string
  schoolName: string
  students: ClassVolunteerStudentInput[]
}

const EXCEPTION_WORDS = /^(결석|결과|조퇴|지각|병결|인정결석|미참여)$/

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function koreanDate(value: string) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return value
  return `${year} 년     ${month}월    ${day}일`
}

function footerDate(value: string) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return value
  return `${year}.   ${month}.  ${day}.`
}

function printableHours(value: number | string) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const numeric = Number(text)
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric}시간` : text
}

function participantCount(students: ClassVolunteerStudentInput[]) {
  return students.filter(student => {
    if (!student?.studentId || !student?.name) return false
    const text = String(student.hours ?? '').trim()
    if (!text || EXCEPTION_WORDS.test(text)) return false
    const numeric = Number(text)
    return Number.isFinite(numeric) ? numeric > 0 : true
  }).length
}

function commonHourText(students: ClassVolunteerStudentInput[]) {
  for (const student of students) {
    if (!student?.studentId || !student?.name) continue
    const numeric = Number(String(student.hours ?? '').trim())
    if (Number.isFinite(numeric) && numeric > 0) return `${numeric}시간`
  }
  return ''
}

function cellPattern(col: number, row: number) {
  return `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/>`
}

function replaceCellText(xml: string, col: number, row: number, value: unknown) {
  const cells = [...xml.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)]
  const target = cells.find(match => match[0].includes(cellPattern(col, row)))
  if (!target || target.index === undefined) throw new Error(`HWPX 양식 셀을 찾지 못했습니다: ${row},${col}`)
  let first = true
  let block = target[0].replace(/<hp:t(?:\s[^>]*)?>[\s\S]*?<\/hp:t>|<hp:t\/>/g, () => {
    if (!first) return '<hp:t/>'
    first = false
    return `<hp:t>${xmlEscape(value)}</hp:t>`
  })
  if (first) {
    block = block.replace(/<hp:run([^>]*)\/>/, `<hp:run$1><hp:t>${xmlEscape(value)}</hp:t></hp:run>`)
  }
  return `${xml.slice(0, target.index)}${block}${xml.slice(target.index + target[0].length)}`
}

function replaceCellTextAt(xml: string, col: number, row: number, textIndex: number, value: unknown) {
  const cells = [...xml.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)]
  const target = cells.find(match => match[0].includes(cellPattern(col, row)))
  if (!target || target.index === undefined) throw new Error(`HWPX 양식 셀을 찾지 못했습니다: ${row},${col}`)
  let index = 0
  const block = target[0].replace(/<hp:t(?:\s[^>]*)?>[\s\S]*?<\/hp:t>|<hp:t\/>/g, match => {
    const current = index++
    return current === textIndex ? `<hp:t>${xmlEscape(value)}</hp:t>` : match
  })
  return `${xml.slice(0, target.index)}${block}${xml.slice(target.index + target[0].length)}`
}

function replaceFirstText(xml: string, from: string, to: string) {
  const needle = `<hp:t>${from}</hp:t>`
  const index = xml.indexOf(needle)
  if (index < 0) return xml
  return `${xml.slice(0, index)}<hp:t>${xmlEscape(to)}</hp:t>${xml.slice(index + needle.length)}`
}

function fillTemplateXml(source: string, draft: ClassVolunteerDocumentInput) {
  let xml = source
  const total = draft.students.length
  const participants = participantCount(draft.students)
  const commonHours = commonHourText(draft.students)
  const area = `이웃돕기활동( ${draft.area === 'neighbor' ? 'O' : ' '} ) 환경보호활동( ${draft.area === 'environment' ? 'O' : ' '} ) 캠페인활동( ${draft.area === 'campaign' ? 'O' : ' '} )`
  const location = `학교 내( ${draft.location === '학교 내' ? 'O' : ' '} )   지역사회( ${draft.location === '지역사회' ? 'O' : ' '} )${draft.location !== '학교 내' && draft.location !== '지역사회' ? `  기타( ${draft.location} )` : ''}`

  xml = replaceFirstText(xml, '※ 3학년용', `※ ${draft.grade}학년용`)
  xml = replaceCellText(xml, 3, 1, ` ${draft.schoolName} ( ${draft.grade} )학년 ( ${draft.className} )반       총원 ${total}명 중, ${participants}명 참가`)
  xml = replaceCellTextAt(xml, 3, 2, 0, ` ${koreanDate(draft.startDate)}    ${draft.periodLabel} `)
  xml = replaceCellTextAt(xml, 3, 2, 2, `총 ${commonHours || '-'})`)
  xml = replaceCellText(xml, 3, 3, draft.institution)
  xml = replaceCellText(xml, 3, 4, area)
  xml = replaceCellText(xml, 3, 5, location)
  xml = replaceCellText(xml, 3, 6, draft.activityContent)

  for (let slot = 0; slot < 40; slot += 1) {
    const student = draft.students[slot]
    const row = 9 + (slot % 20)
    const right = slot >= 20
    const col = right ? 7 : 0
    const id = String(student?.studentId || '').replace(/\D/g, '').slice(-4).padStart(4, '0')
    const grade = student ? id.slice(0, 1) : ''
    const className = student ? String(Number(id.slice(1, 2))) : ''
    const number = student ? String(Number(id.slice(2, 4))) : ''
    xml = replaceCellText(xml, col, row, slot + 1)
    xml = replaceCellText(xml, col + 1, row, grade)
    xml = replaceCellText(xml, col + 2, row, className)
    xml = replaceCellText(xml, right ? col + 3 : col + 4, row, number)
    xml = replaceCellText(xml, right ? col + 4 : col + 5, row, student?.name || '')
    xml = replaceCellText(xml, right ? col + 5 : col + 6, row, student ? printableHours(student.hours) : '')
  }

  xml = replaceFirstText(xml, '2026.   6.  25.', footerDate(draft.certificateDate))
  xml = replaceFirstText(xml, '         확인자 : 담임교사        (인)', `         확인자 : ${draft.confirmTeacher}        (인)`)
  return xml
}

export async function buildClassVolunteerHwpx(templatePath: string, draft: ClassVolunteerDocumentInput) {
  if (!draft.students.length || draft.students.length > 40) throw new Error('반별 HWPX 확인서는 1명부터 40명까지 발급할 수 있습니다.')
  const zip = await JSZip.loadAsync(readFileSync(templatePath))
  const section = zip.file('Contents/section0.xml')
  if (!section) throw new Error('HWPX 원본 양식의 본문을 찾지 못했습니다.')
  const filledXml = fillTemplateXml(await section.async('string'), draft)
  zip.file('Contents/section0.xml', filledXml)
  const preview = zip.file('Preview/PrvText.txt')
  if (preview) {
    const text = await preview.async('string')
    zip.file('Preview/PrvText.txt', text
      .replace('※ 3학년용', `※ ${draft.grade}학년용`)
      .replace('사제동행 교내 환경정화', draft.activityContent)
      .replace('확인자 : 담임교사', `확인자 : ${draft.confirmTeacher}`))
  }
  const mimetype = zip.file('mimetype')
  if (mimetype) zip.file('mimetype', await mimetype.async('string'), { compression: 'STORE' })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'DOS' })
}

function htmlEscape(value: unknown) {
  return xmlEscape(value)
}

export function buildClassVolunteerHtml(draft: ClassVolunteerDocumentInput) {
  const total = draft.totalStudents ?? draft.students.filter(student => student?.studentId && student?.name).length
  const participants = participantCount(draft.students)
  const commonHours = commonHourText(draft.students)
  const rows = Array.from({ length: 20 }, (_, row) => {
    const cells = [row, row + 20].map((slot, side) => {
      const student = draft.students[slot]
      const id = String(student?.studentId || '').replace(/\D/g, '').slice(-4).padStart(4, '0')
      const present = Boolean(student?.studentId && student?.name)
      return `<td>${slot + 1}</td><td>${present ? id[0] : ''}</td><td>${present ? Number(id[1]) : ''}</td><td>${present ? Number(id.slice(2)) : ''}</td><td class="name">${htmlEscape(present ? student.name : '')}</td><td class="hours">${htmlEscape(present ? printableHours(student.hours) : '')}</td>${side === 0 ? '' : ''}`
    })
    return `<tr>${cells.join('')}</tr>`
  }).join('')
  const mark = (value: ClassVolunteerDocumentInput['area']) => draft.area === value ? 'O' : '&nbsp;'
  const loc = (value: string) => draft.location === value ? 'O' : '&nbsp;'
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4 portrait;margin:7mm 10mm}*{box-sizing:border-box}body{margin:0;color:#000;font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:9pt}.note{font-size:8pt;margin:0 0 2mm}.title{font-family:"Batang","바탕",serif;font-size:16pt;font-weight:700;text-align:center;border:1.3px solid #000;padding:2.6mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #000;text-align:center;padding:1mm .7mm;line-height:1.15}.meta th{width:20%;font-weight:700}.meta td{text-align:left;padding-left:2mm}.roster th{background:#f3f3f3;font-weight:700}.roster tr{height:7.1mm}.roster td:nth-child(1),.roster td:nth-child(7){width:5%}.roster td:nth-child(2),.roster td:nth-child(3),.roster td:nth-child(4),.roster td:nth-child(8),.roster td:nth-child(9),.roster td:nth-child(10){width:5.2%}.roster .name{width:12%}.roster .hours{width:12%}.footer{height:22mm;text-align:center;font-family:"Batang","바탕",serif;font-size:11pt;line-height:1.9}.footer strong{font-size:13pt}.small{font-size:8pt}
  </style></head><body><p class="note">※ ${htmlEscape(draft.grade)}학년용</p><div class="title">학교교육계획에 의한 단체봉사활동 실시 확인서</div><table class="meta"><tr><th>인적 사항</th><td>${htmlEscape(draft.schoolName)} ( ${htmlEscape(draft.grade)} )학년 ( ${htmlEscape(draft.className)} )반　총원 ${total}명 중, ${participants}명 참가</td></tr><tr><th>봉사활동 기간</th><td>${htmlEscape(koreanDate(draft.startDate))}　${htmlEscape(draft.periodLabel)} (총 ${htmlEscape(commonHours || '-')} )</td></tr><tr><th>봉사활동 기관</th><td>${htmlEscape(draft.institution)}</td></tr><tr><th>봉사 영역</th><td>이웃돕기활동( ${mark('neighbor')} )　환경보호활동( ${mark('environment')} )　캠페인활동( ${mark('campaign')} )</td></tr><tr><th>활동 장소</th><td>학교 내( ${loc('학교 내')} )　지역사회( ${loc('지역사회')} )${draft.location !== '학교 내' && draft.location !== '지역사회' ? `　기타( ${htmlEscape(draft.location)} )` : ''}</td></tr><tr><th>활동 내용</th><td>${htmlEscape(draft.activityContent)}</td></tr></table><table class="roster"><tr><th colspan="12">봉사활동 참여자 명단</th></tr><tr><th>순번</th><th>학년</th><th>반</th><th>번호</th><th>성명</th><th>인정시간</th><th>순번</th><th>학년</th><th>반</th><th>번호</th><th>성명</th><th>인정시간</th></tr>${rows}<tr><td colspan="12" class="footer">위 학생들은 위와 같이 단체봉사활동에 참여하였으며 이 기재내용은 사실과 틀림없음을 확인합니다.<br>${htmlEscape(footerDate(draft.certificateDate))}<br>확인자 : ${htmlEscape(draft.confirmTeacher)}　(인)<br><strong>확인기관명 : ${htmlEscape(draft.schoolName)}장(직인)</strong></td></tr></table><p class="small">※ 고등학교 정규 교육과정 내 봉사활동은 50분을 1시간으로 산정함.</p></body></html>`
}

export function buildCoordinatorVolunteerHtml(draft: CoordinatorVolunteerDocumentInput) {
  const classes = [...new Set(draft.students.map(student => String(student.studentId).replace(/\D/g, '').slice(-4, -2)))]
    .filter(classKey => new RegExp(`^${draft.grade}\\d$`).test(classKey))
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  if (!classes.length) throw new Error('담당자용 확인서에 포함할 학급을 찾지 못했습니다.')

  const pages = classes.map(classKey => {
    const classStudents = draft.students.filter(student => String(student.studentId).replace(/\D/g, '').slice(-4, -2) === classKey)
    const slots: ClassVolunteerStudentInput[] = Array.from({ length: 40 }, () => ({ studentId: '', name: '', hours: '', remarks: '' }))
    for (const student of classStudents) {
      const studentId = String(student.studentId).replace(/\D/g, '').slice(-4)
      const number = Number(studentId.slice(2))
      if (!Number.isInteger(number) || number < 1 || number > 40) throw new Error(`${student.name} 학생의 번호는 담당자용 확인서에서 지원하는 1~40 범위를 벗어났습니다.`)
      slots[number - 1] = { ...student, studentId, hours: draft.hours }
    }
    const classDraft: ClassVolunteerDocumentInput = {
      activityName: draft.activityContent,
      startDate: draft.startDate,
      endDate: draft.endDate,
      institution: draft.schoolName,
      area: 'neighbor',
      location: '학교 내',
      activityContent: draft.activityContent,
      confirmTeacher: draft.confirmTeacher,
      schoolName: draft.schoolName,
      commonRemarks: '',
      grade: draft.grade,
      className: String(Number(classKey[1])),
      periodLabel: draft.startDate === draft.endDate ? '담당자 확인 입력' : `${draft.startDate} ~ ${draft.endDate}`,
      certificateDate: new Date().toISOString().slice(0, 10),
      students: slots,
      totalStudents: classStudents.length,
    }
    const marker = Buffer.from(JSON.stringify({
      formIndex: 0,
      activityName: draft.activityContent,
      startDate: draft.startDate,
      endDate: draft.endDate,
      institution: draft.schoolName,
      area: '이웃돕기활동',
      location: '학교 내',
      activityContent: draft.activityContent,
      confirmTeacher: draft.confirmTeacher,
      participants: classStudents.map(student => ({
        studentId: String(student.studentId).replace(/\D/g, '').slice(-4),
        name: student.name,
        hours: Number(draft.hours),
        remarks: '',
        correctionNote: '담당자용 확인서 생성',
      })),
    }), 'utf8').toString('base64')
    return { html: buildClassVolunteerHtml(classDraft), marker }
  })
  const bodies = pages.map(page => `${page.html.match(/<body>([\s\S]*?)<\/body>/)?.[1] || ''}<div class="coordinator-machine-data">UNGCOORDV1:${page.marker}</div>`)
  return pages[0].html
    .replace('</style>', '.coordinator-page{position:relative;break-after:page}.coordinator-page:last-child{break-after:auto}.coordinator-machine-data{position:absolute;left:0;bottom:0;width:190mm;height:1px;overflow:hidden;font-size:1px;line-height:1px;color:#fff;opacity:.01;word-break:break-all}</style>')
    .replace(/<body>[\s\S]*?<\/body>/, `<body>${bodies.map(body => `<section class="coordinator-page">${body}</section>`).join('')}</body>`)
}

async function documentWindow(html: string) {
  const { BrowserWindow } = await import('electron')
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise(resolve => setTimeout(resolve, 250))
  return window
}

export async function buildClassVolunteerPdf(draft: ClassVolunteerDocumentInput) {
  const window = await documentWindow(buildClassVolunteerHtml(draft))
  try {
    return await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true })
  } finally {
    window.destroy()
  }
}

export async function buildCoordinatorVolunteerPdf(draft: CoordinatorVolunteerDocumentInput) {
  const window = await documentWindow(buildCoordinatorVolunteerHtml(draft))
  try {
    return await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true })
  } finally {
    window.destroy()
  }
}

export async function printClassVolunteer(draft: ClassVolunteerDocumentInput) {
  const window = await documentWindow(buildClassVolunteerHtml(draft))
  window.setTitle('반별 봉사활동 확인서 인쇄')
  window.show()
  window.focus()
  return new Promise<boolean>((resolve) => {
    window.webContents.print({ silent: false, printBackground: true }, (success) => {
      window.destroy()
      resolve(success)
    })
  })
}
