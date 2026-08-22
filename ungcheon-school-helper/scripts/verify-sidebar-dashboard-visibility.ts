import assert from 'node:assert/strict'
import {
  isSidebarExpanded,
  normalizeSidebarExpandedPinned,
} from '../src/services/sidebarPreferences'
import {
  isDashboardTaskVisible,
  normalizeDashboardTaskStatusVisibility,
} from '../src/services/dashboardTaskVisibility'

assert.equal(normalizeSidebarExpandedPinned(undefined), true)
assert.equal(normalizeSidebarExpandedPinned('false'), true)
assert.equal(normalizeSidebarExpandedPinned(false), false)
assert.equal(isSidebarExpanded(true, false, false), true)
assert.equal(isSidebarExpanded(false, true, false), true)
assert.equal(isSidebarExpanded(false, false, true), true)
assert.equal(isSidebarExpanded(false, false, false), false)

assert.deepEqual(normalizeDashboardTaskStatusVisibility(undefined), { incomplete: true, completed: true })
assert.deepEqual(normalizeDashboardTaskStatusVisibility({ incomplete: false }), { incomplete: false, completed: true })
assert.deepEqual(normalizeDashboardTaskStatusVisibility({ incomplete: 'no', completed: false }), { incomplete: true, completed: false })

const allVisible = { incomplete: true, completed: true }
assert.equal(isDashboardTaskVisible('weekly', true, { incomplete: false, completed: false }), true)
assert.equal(isDashboardTaskVisible('sharedWork', false, allVisible), true)
assert.equal(isDashboardTaskVisible('personal', true, allVisible), true)
assert.equal(isDashboardTaskVisible('sharedWork', false, { incomplete: false, completed: true }), false)
assert.equal(isDashboardTaskVisible('personal', true, { incomplete: true, completed: false }), false)

console.log('PASS 좌측 메뉴 전체 핀·대시보드 완료/미완료 업무 필터')
