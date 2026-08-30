const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const moduleCache = new Map()

function loadTypeScript(relativePath) {
  const absolutePath = path.resolve(root, relativePath)
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports
  const source = fs.readFileSync(absolutePath, 'utf8')
  const output = ts.transpileModule(source, {
    fileName: absolutePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  moduleCache.set(absolutePath, module)
  const localRequire = request => {
    if (!request.startsWith('.')) return require(request)
    const resolved = path.resolve(path.dirname(absolutePath), request)
    const candidate = fs.existsSync(resolved) ? resolved : `${resolved}.ts`
    return loadTypeScript(path.relative(root, candidate))
  }
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports)
  return module.exports
}

const settings = loadTypeScript('src/services/widgetSettings.ts')
const viewModel = loadTypeScript('src/services/widgetViewModel.ts')
const localData = loadTypeScript('src/services/widgetLocalData.ts')

async function main() {
  const widgetAppSource = fs.readFileSync(path.resolve(root, 'src/components/widget/WidgetApp.tsx'), 'utf8')
  const settingsPanelSource = fs.readFileSync(path.resolve(root, 'src/components/widget/WidgetSettingsPanel.tsx'), 'utf8')
  const quickToolsSource = fs.readFileSync(path.resolve(root, 'src/components/widget/WidgetQuickTools.tsx'), 'utf8')
  assert.equal(settings.WIDGET_MODULE_IDS.length, 13)
  assert.equal(new Set(settings.WIDGET_MODULE_IDS).size, 13)
  assert(!settings.WIDGET_MODULE_IDS.includes('change-summary'), '제외 기능 2가 모듈에 포함됐습니다.')
  assert(!settings.WIDGET_MODULE_IDS.includes('focus-mode'), '제외 기능 9가 모듈에 포함됐습니다.')
  assert(widgetAppSource.includes('widget.productivity.user.'), '메모·문구 저장소가 로그인 사용자별로 분리되지 않았습니다.')
  assert(widgetAppSource.includes('dataOwner !== auth.teacherName') && widgetAppSource.includes('remoteGenerationRef'), '사용자 전환 중 이전 교사 자료 노출 차단이 없습니다.')
  assert(quickToolsSource.includes('1_500') && quickToolsSource.includes('catch'), '과도한 QR 입력과 생성 실패 처리가 없습니다.')
  assert(widgetAppSource.includes('onDismiss=') && widgetAppSource.includes('onSnooze='), '퇴근 전 브리핑 닫기·10분 미루기 연결이 없습니다.')
  assert(settingsPanelSource.includes('tomorrowStartTime') && settingsPanelSource.includes('weatherAlerts') && settingsPanelSource.includes('endOfDay.time'), '위젯 세부 설정 UI가 누락됐습니다.')

  const migrated = settings.normalizeWidgetProductivitySettings({
    dense: true,
    showMeal: false,
    showFortune: false,
    moduleOrder: ['tasks', 'tasks', 'unknown', 'timer'],
    shortcutIds: ['student_locator', 'student_locator', 'staff_tasks', 'calendar', 'dashboard', 'settings'],
  })
  assert.equal(migrated.version, 2)
  assert.equal(migrated.density, 'compact')
  assert.deepEqual(migrated.moduleOrder.slice(0, 2), ['tasks', 'timer'])
  assert.equal(migrated.moduleOrder.length, 13)
  assert.equal(migrated.moduleVisibility.meal, false)
  assert.equal(migrated.moduleVisibility.fortune, false)
  assert.equal(migrated.moduleVisibility.tomorrow, true)
  assert.equal(migrated.moduleVisibility.memo, false)
  assert.equal(migrated.shortcutIds.length, 4)
  assert(!migrated.shortcutIds.includes('settings'))
  assert.equal(settings.moveWidgetModule(migrated.moduleOrder, 'timer', 'up')[0], 'timer')
  assert.equal(settings.setWidgetModuleVisibility(migrated, 'memo', true).moduleVisibility.memo, true)
  const currentVisibilityWins = settings.normalizeWidgetProductivitySettings({
    showMeal: true,
    showFortune: true,
    showLuckyCard: true,
    moduleVisibility: { meal: false, fortune: false, 'lucky-card': false },
  })
  assert.equal(currentVisibilityWins.moduleVisibility.meal, false)
  assert.equal(currentVisibilityWins.moduleVisibility.fortune, false)
  assert.equal(currentVisibilityWins.moduleVisibility['lucky-card'], false)

  const before = viewModel.getWidgetPeriodTiming(new Date(2026, 7, 31, 8, 30))
  const lesson = viewModel.getWidgetPeriodTiming(new Date(2026, 7, 31, 9, 0))
  const breakTime = viewModel.getWidgetPeriodTiming(new Date(2026, 7, 31, 9, 35))
  const lunch = viewModel.getWidgetPeriodTiming(new Date(2026, 7, 31, 12, 45))
  const finished = viewModel.getWidgetPeriodTiming(new Date(2026, 7, 31, 16, 21))
  assert.equal(before.phase, 'before-school')
  assert.equal(before.remainingMinutes, 10)
  assert.equal(lesson.phase, 'lesson')
  assert.equal(lesson.currentPeriod, 1)
  assert.equal(lesson.remainingMinutes, 30)
  assert.equal(breakTime.phase, 'break')
  assert.equal(breakTime.nextPeriod, 2)
  assert.equal(lunch.phase, 'lunch')
  assert.equal(lunch.nextPeriod, 5)
  assert.equal(finished.phase, 'after-school')

  const buckets = viewModel.buildTaskBuckets([
    { id: 'a', title: '초과', deadline: '2026-08-29' },
    { id: 'b', title: '오늘', deadline: '2026-08-30' },
    { id: 'c', title: '임박', deadline: '2026-09-02' },
    { id: 'd', title: '이후', deadline: '2026-09-03' },
    { id: 'e', title: '완료', deadline: '2026-08-30', completed: true },
  ], '2026-08-30')
  assert.deepEqual(buckets.map(bucket => bucket.count), [1, 1, 1, 1])
  assert.equal(viewModel.buildTaskBuckets([
    { id: 'e', title: '완료', deadline: '2026-08-30', completed: true },
  ], '2026-08-30', true)[1].count, 1)

  assert.equal(viewModel.addDaysYmd('2026-08-31', 1), '2026-09-01')
  assert.equal(viewModel.differenceInYmdDays('2026-08-30', '2026-09-02'), 3)
  assert.equal(viewModel.shouldShowTomorrowPreview(new Date(2026, 7, 30, 15, 0), '16:00', '14:20'), true)
  const preview = viewModel.resolveTomorrowPreviewDay('2026-08-30', [
    { date: '2026-08-31', kind: 'non_instruction', label: '재량휴업일' },
    { date: '2026-09-01', kind: 'instruction', label: '' },
  ], true)
  assert.equal(preview.tomorrow.label, '재량휴업일')
  assert.equal(preview.target.date, '2026-09-01')
  assert.equal(preview.continued, true)

  const weather = viewModel.buildWeatherActions([
    { time: '2026-08-30T08:00', precipitationProbability: 70, windSpeedKph: 12, temperatureC: 20 },
    { time: '2026-08-30T17:00', precipitationProbability: 70, windSpeedKph: 12, temperatureC: 34 },
  ], {
    now: new Date('2026-08-30T12:00:00+09:00'),
    fetchedAt: new Date('2026-08-30T07:00:00+09:00'),
  })
  assert(weather.some(action => action.id === 'precipitation' && action.label.includes('퇴근')))
  assert(!weather.some(action => action.label.includes('등교지도')), '지난 시간대 날씨 알림이 남아 있습니다.')
  assert(weather.some(action => action.id === 'wind'))
  assert(weather.some(action => action.id === 'heat'))
  assert(weather.some(action => action.id === 'stale'))

  assert.deepEqual(viewModel.countText('가 a'), {
    characters: 3,
    charactersWithoutSpaces: 2,
    utf8Bytes: 5,
    lines: 1,
  })
  const students = viewModel.normalizeStudentList('20201 김예은\n2202 박지은\n???')
  assert.equal(students.entries[0].status, 'valid')
  assert.equal(students.entries[0].studentId, '2201')
  assert.equal(students.entries[2].status, 'invalid')
  assert.equal(viewModel.calculatePeriodTotal('월 5,6,7교시 / 화 1~4교시'), 7)

  const memory = new Map()
  const adapter = {
    async get(key) { return memory.get(key) },
    async set(key, value) { memory.set(key, structuredClone(value)) },
  }
  const todayMemos = await localData.addWidgetQuickMemo('인쇄물 확인', 'today', adapter, '2026-08-30')
  assert.equal(todayMemos.length, 1)
  assert.equal(localData.pruneWidgetQuickMemos(todayMemos, '2026-08-31').length, 0)
  assert.equal((await localData.loadWidgetQuickMemos(adapter, '2026-08-31')).length, 0)
  assert.equal(memory.get(localData.WIDGET_QUICK_MEMOS_KEY).length, 0)
  const retained = await localData.addWidgetQuickMemo('계속 보관', 'until-deleted', adapter, '2026-08-30')
  assert.equal(localData.pruneWidgetQuickMemos(retained, '2026-08-31').length, 1)
  const draft = localData.quickMemoToPersonalTaskDraft(retained.find(item => item.retention === 'until-deleted'), '2026-09-01')
  assert.equal(draft.date, '2026-09-01')
  assert.equal(draft.kind, 'task')
  const snippets = await localData.addWidgetQuickSnippet('학부모 안내', '안녕하세요.', adapter)
  assert.equal(snippets.length, 1)
  assert.equal((await localData.loadWidgetQuickSnippets(adapter))[0].text, '안녕하세요.')

  console.log('PASS 위젯 모듈 13개 · 제외 기능 2·9 미포함 · 설정 마이그레이션')
  console.log('PASS 교시 타이머 · 내일 수업일 · 업무 마감 4구간 · 날씨 행동 알림')
  console.log('PASS 빠른 메모·문구 로컬 저장 · 날짜·글자·학번이름·교시 유틸')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
