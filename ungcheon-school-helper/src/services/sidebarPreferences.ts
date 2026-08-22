export const SIDEBAR_EXPANDED_PINNED_KEY = 'sidebar.expandedPinned.v1'

export function normalizeSidebarExpandedPinned(value: unknown) {
  return typeof value === 'boolean' ? value : true
}

export function isSidebarExpanded(pinned: boolean, hovered: boolean, editing: boolean) {
  return pinned || hovered || editing
}
