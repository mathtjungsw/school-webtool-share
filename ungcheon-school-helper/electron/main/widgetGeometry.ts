export interface WidgetRectangle { x: number; y: number; width: number; height: number }

/** Electron workArea and BrowserWindow bounds already use logical DIP units. */
export function fitWidgetBounds(current: WidgetRectangle, workArea: WidgetRectangle, requestedHeight: number, requestedWidth = current.width): WidgetRectangle {
  const areaWidth = Math.max(1, Math.floor(workArea.width))
  const areaHeight = Math.max(1, Math.floor(workArea.height))
  const marginX = Math.min(12, Math.floor((areaWidth - 1) / 2))
  const marginY = Math.min(12, Math.floor((areaHeight - 1) / 2))
  const maxWidth = areaWidth - marginX * 2
  const maxHeight = areaHeight - marginY * 2
  const width = Math.min(maxWidth, Math.max(Math.min(350, maxWidth), Math.ceil(Number.isFinite(requestedWidth) ? requestedWidth : current.width)))
  const height = Math.min(maxHeight, Math.max(Math.min(84, maxHeight), Math.ceil(Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : current.height)))
  const x = Math.max(workArea.x + marginX, Math.min(Number.isFinite(current.x) ? current.x : workArea.x, workArea.x + areaWidth - marginX - width))
  const y = Math.max(workArea.y + marginY, Math.min(Number.isFinite(current.y) ? current.y : workArea.y, workArea.y + areaHeight - marginY - height))
  return { x: Math.round(x), y: Math.round(y), width, height }
}
