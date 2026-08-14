import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { basename, extname, join, resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import type { ParsedVolunteerForm } from './volunteer-hwp'

export interface StoredVolunteerHwp {
  id: string
  originalName: string
  storedName: string
  importedAt: string
  size: number
  sha256: string
  formCount: number
  activities: string[]
  fileType?: 'hwp' | 'pdf' | 'generated'
  pageCount?: number
  analysisMode?: 'hwp' | 'text' | 'ocr' | 'mixed'
  averageConfidence?: number
  warnings?: string[]
  forms?: ParsedVolunteerForm[]
}

function vaultDirectory() { return join(app.getPath('userData'), 'volunteer-hwp') }
function manifestPath() { return join(vaultDirectory(), 'manifest.json') }

function ensureVault() { mkdirSync(vaultDirectory(), { recursive: true }) }

function readManifest(): StoredVolunteerHwp[] {
  ensureVault()
  try {
    const parsed = JSON.parse(readFileSync(manifestPath(), 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => item && typeof item.id === 'string' && existsSync(join(vaultDirectory(), item.storedName)))
  } catch { return [] }
}

function writeManifest(items: StoredVolunteerHwp[]) {
  ensureVault()
  const temporary = `${manifestPath()}.tmp`
  writeFileSync(temporary, JSON.stringify(items, null, 2), 'utf8')
  const target = manifestPath()
  if (existsSync(target)) unlinkSync(target)
  copyFileSync(temporary, target)
  unlinkSync(temporary)
}

export function listVolunteerHwpFiles() {
  const items = readManifest().sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  writeManifest(items)
  return items
}

export function importVolunteerHwpFile(
  sourcePath: string,
  summary: Omit<StoredVolunteerHwp, 'id' | 'originalName' | 'storedName' | 'importedAt' | 'size' | 'sha256'>,
  allowDuplicate = false,
) {
  const extension = extname(sourcePath).toLowerCase()
  if (!['.hwp', '.pdf'].includes(extension)) throw new Error('HWP 또는 PDF 확인서만 보관할 수 있습니다.')
  const bytes = readFileSync(sourcePath)
  return storeBytes(basename(sourcePath), bytes, summary, allowDuplicate, extension)
}

export function storeGeneratedVolunteerHwp(
  originalName: string,
  bytes: Buffer,
  summary: { formCount: number; activities: string[] },
) {
  return storeBytes(originalName.toLowerCase().endsWith('.hwp') ? originalName : `${originalName}.hwp`, bytes, summary)
}

export function storeGeneratedVolunteerForms(title: string, forms: ParsedVolunteerForm[]) {
  const cleanTitle = String(title || '').trim()
  if (!cleanTitle) throw new Error('수기 생성 확인서의 제목을 입력해 주세요.')
  if (!forms.length) throw new Error('수기 생성 확인서에 반영할 학생 자료가 없습니다.')
  const bytes = Buffer.from(JSON.stringify(forms, null, 2), 'utf8')
  return storeBytes(`${cleanTitle} · 수기 생성한 확인서`, bytes, {
    formCount: forms.length,
    activities: [...new Set(forms.map(form => form.activityContent || form.activityName).filter(Boolean))],
    analysisMode: 'text',
    averageConfidence: 100,
    warnings: [],
    forms,
  }, false, '.json')
}

function storeBytes(
  originalName: string,
  bytes: Buffer,
  summary: Omit<StoredVolunteerHwp, 'id' | 'originalName' | 'storedName' | 'importedAt' | 'size' | 'sha256'>,
  allowDuplicate = false,
  extension = '.hwp',
) {
  ensureVault()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const current = readManifest()
  const duplicate = current.find(item => item.sha256 === sha256)
  if (duplicate && !allowDuplicate) return duplicate
  const id = randomUUID()
  const storedName = `${id}${extension}`
  writeFileSync(join(vaultDirectory(), storedName), bytes)
  const item: StoredVolunteerHwp = {
    id,
    originalName: originalName.replace(/[\\/:*?"<>|]/g, '_'),
    storedName,
    importedAt: new Date().toISOString(),
    size: bytes.length,
    sha256,
    formCount: summary.formCount,
    activities: summary.activities.map(String).filter(Boolean),
    fileType: extension === '.pdf' ? 'pdf' : extension === '.json' ? 'generated' : 'hwp',
    pageCount: summary.pageCount,
    analysisMode: summary.analysisMode,
    averageConfidence: summary.averageConfidence,
    warnings: summary.warnings || [],
    forms: summary.forms,
  }
  writeManifest([item, ...current])
  return item
}

export function resolveVolunteerHwpPath(id: string) {
  const item = readManifest().find(entry => entry.id === id)
  if (!item) throw new Error('보관된 확인서 파일을 찾지 못했습니다.')
  const base = resolve(vaultDirectory())
  const target = resolve(base, item.storedName)
  if (!target.startsWith(`${base}\\`) || !['.hwp', '.pdf', '.json'].includes(extname(target).toLowerCase()) || !existsSync(target)) {
    throw new Error('보관된 확인서 경로가 올바르지 않습니다.')
  }
  return { item, path: target }
}

export function updateVolunteerDocumentForms(id: string, forms: ParsedVolunteerForm[]) {
  const items = readManifest()
  const index = items.findIndex(item => item.id === id)
  if (index < 0) throw new Error('보관된 확인서 파일을 찾지 못했습니다.')
  items[index] = {
    ...items[index],
    forms,
    formCount: forms.length,
    activities: [...new Set(forms.map(form => form.activityContent || form.activityName).filter(Boolean))],
    warnings: [],
  }
  writeManifest(items)
  return items[index]
}

export function deleteVolunteerHwpFile(id: string) {
  const { item, path } = resolveVolunteerHwpPath(id)
  if (existsSync(path)) unlinkSync(path)
  writeManifest(readManifest().filter(entry => entry.id !== id))
  return item
}

export function volunteerHwpFileInfo(id: string) {
  const resolved = resolveVolunteerHwpPath(id)
  return { ...resolved.item, size: statSync(resolved.path).size, path: resolved.path }
}
