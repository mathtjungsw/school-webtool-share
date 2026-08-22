export interface DashboardTaskStatusVisibility {
  incomplete: boolean
  completed: boolean
}

export const DASHBOARD_TASK_STATUS_VISIBILITY_KEY = 'dashboard.taskStatusVisibility.v1'
export const DEFAULT_DASHBOARD_TASK_STATUS_VISIBILITY: DashboardTaskStatusVisibility = {
  incomplete: true,
  completed: true,
}

export function normalizeDashboardTaskStatusVisibility(value: unknown): DashboardTaskStatusVisibility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_DASHBOARD_TASK_STATUS_VISIBILITY }
  }
  const saved = value as Partial<DashboardTaskStatusVisibility>
  return {
    incomplete: typeof saved.incomplete === 'boolean' ? saved.incomplete : true,
    completed: typeof saved.completed === 'boolean' ? saved.completed : true,
  }
}

export function isDashboardTaskVisible(
  source: string,
  completed: boolean | undefined,
  visibility: DashboardTaskStatusVisibility,
) {
  if (source !== 'sharedWork' && source !== 'personal') return true
  return completed ? visibility.completed : visibility.incomplete
}
