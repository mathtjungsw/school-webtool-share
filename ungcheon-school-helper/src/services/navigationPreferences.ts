import { NAVIGATION_BY_ID, NAVIGATION_ITEMS } from '../config/navigationRegistry'

export const MAIN_MENU_IDS = ['dashboard', 'feature_catalog', 'feature_overview', 'settings']
export const EXECUTIVE_MENU_IDS = ['executive_live_classes', 'executive_teacher_schedule']
export const LEGACY_MENU_LINKS = ['notifier', 'pdf_extractor', 'file_parser']
export const SHORTCUTS_KEY = 'navigation.shortcuts.v1'
export const HIDDEN_MENUS_KEY = 'sidebar.hiddenMenus.v1'

const DEFAULT_SHORTCUTS = ['calendar', 'timetable_swap', 'staff_tasks', 'student_locator', 'attendance_print']

export function knownMenuIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && NAVIGATION_BY_ID.has(id)))]
    : []
}

export function canAddShortcut(id: string) {
  return NAVIGATION_BY_ID.has(id) && !MAIN_MENU_IDS.includes(id) && !EXECUTIVE_MENU_IDS.includes(id)
}

export function restoreShortcuts(saved: unknown, oldPins: unknown, oldFavorites: unknown, oldOrder: unknown): string[] {
  if (Array.isArray(saved)) return knownMenuIds(saved).filter(canAddShortcut)
  if (!Array.isArray(oldPins) && !Array.isArray(oldFavorites)) return DEFAULT_SHORTCUTS.slice()
  const pins = knownMenuIds(oldPins)
  const orderedPins = knownMenuIds(oldOrder).filter(id => pins.includes(id))
  return [...new Set([...orderedPins, ...pins, ...knownMenuIds(oldFavorites)])].filter(canAddShortcut)
}

export function availableMenus(order: string[], hidden: string[], shortcuts: string[], isAdmin: boolean, isExecutive: boolean) {
  const ids = new Set([...order, ...MENU_GROUPS.flatMap(group => group.items), ...NAVIGATION_ITEMS.map(item => item.id)])
  return [...ids].filter(id =>
    !MAIN_MENU_IDS.includes(id) &&
    !hidden.includes(id) &&
    (id !== 'admin_center' || isAdmin) &&
    (!EXECUTIVE_MENU_IDS.includes(id) || isExecutive) &&
    (!LEGACY_MENU_LINKS.includes(id) || shortcuts.includes(id)),
  ).map(id => NAVIGATION_BY_ID.get(id)).filter(item => item !== undefined)
}

export const MENU_GROUPS = [
  { id: 'schedule', label: '일정·시간표', items: ['calendar', 'timetable_swap', 'mini_widget', 'operations_notifications', 'notifier'] },
  { id: 'school', label: '학교운영', items: ['staff_tasks', 'mandatory_training', 'audit_evidence', 'school_hub', 'staff_roster', 'committees', 'feature_requests', 'form_center', 'admin_center'] },
  { id: 'student', label: '학생·학사', items: ['student_timetable', 'yaja_attendance', 'attendance_print', 'volunteer_work', 'student_locator', 'student_identity_audit', 'subject_remarks_print', 'record_privacy_blind'] },
  { id: 'evaluation', label: '평가·교육과정', items: ['grade_preview', 'estimated_split_score', 'curriculum', 'schoolinfo_evaluation'] },
  { id: 'admissions', label: '진학·대입', items: ['admission_results', 'recommended_subjects', 'gyeongnam_curriculum', 'performance_assessment_guide', 'saenggibu_generator', 'university_webzines', 'average_grade_calculator', 'admission_success_cases'] },
  { id: 'reading', label: '독서교육', items: ['ungcheon_library', 'university_recommended_books'] },
  { id: 'tools', label: '인사·교사용 도구', items: ['transfer_score', 'teacher_tools', 'excel_processor', 'payroll', 'insa_analysis', 'pdf_extractor', 'file_parser'] },
  { id: 'help', label: '시작·도움말', items: ['dashboard', 'settings', 'help'] },
  { id: 'executive', label: '교장·교감', items: EXECUTIVE_MENU_IDS },
]
