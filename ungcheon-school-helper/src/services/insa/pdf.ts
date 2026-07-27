// pdfjs-dist 로딩 + 워커 설정 + 파싱 오케스트레이션
import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import { pageToGrid } from './grid'
import { parseInsaGrids } from './parser'
import type { InsaRecord, PageGrid } from './types'

let workerReady = false
function ensureWorker() {
  if (workerReady) return
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
  workerReady = true
}

export async function parseInsaPdf(bytes: Uint8Array): Promise<InsaRecord> {
  ensureWorker()
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  try {
    const grids: PageGrid[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      grids.push(await pageToGrid(page))
      page.cleanup()
    }
    return parseInsaGrids(grids)
  } finally {
    await (doc as unknown as { destroy: () => Promise<void> }).destroy()
  }
}
