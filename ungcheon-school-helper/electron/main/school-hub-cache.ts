import { app, safeStorage } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface PersistentHubCacheEntry {
  cacheKey: string
  resource: string
  data: unknown
  revision: string
  signature: string
  loadedAt: number
}

interface DiskEnvelope {
  format: 1
  cacheKey: string
  resource: string
  revision: string
  signature: string
  loadedAt: number
  encrypted: boolean
  payload: string
}

const MAX_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_ENTRY_COUNT = 80
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000
const CACHE_FOLDER = 'school-hub-cache-v1'

function cacheRoot() {
  const root = join(app.getPath('userData'), CACHE_FOLDER)
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function cacheFile(cacheKey: string) {
  const digest = createHash('sha256').update(cacheKey).digest('hex')
  return join(cacheRoot(), `${digest}.json`)
}

function decodeEnvelope(envelope: DiskEnvelope): PersistentHubCacheEntry | null {
  if (!envelope || envelope.format !== 1 || !envelope.cacheKey || !envelope.resource) return null
  if (!Number.isFinite(envelope.loadedAt) || Date.now() - envelope.loadedAt > MAX_AGE_MS) return null
  try {
    const json = envelope.encrypted
      ? safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'))
      : envelope.payload
    return {
      cacheKey: envelope.cacheKey,
      resource: envelope.resource,
      data: JSON.parse(json),
      revision: envelope.revision || '',
      signature: envelope.signature || '',
      loadedAt: envelope.loadedAt,
    }
  } catch {
    return null
  }
}

function pruneCacheFiles() {
  const files = readdirSync(cacheRoot())
    .filter(name => name.endsWith('.json'))
    .map(name => ({ path: join(cacheRoot(), name), mtime: statSync(join(cacheRoot(), name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  files.slice(MAX_ENTRY_COUNT).forEach(item => rmSync(item.path, { force: true }))
}

export function readPersistentHubCache(): PersistentHubCacheEntry[] {
  const entries: PersistentHubCacheEntry[] = []
  for (const name of readdirSync(cacheRoot()).filter(item => item.endsWith('.json'))) {
    const path = join(cacheRoot(), name)
    try {
      const envelope = JSON.parse(readFileSync(path, 'utf8')) as DiskEnvelope
      const entry = decodeEnvelope(envelope)
      if (entry) entries.push(entry)
      else rmSync(path, { force: true })
    } catch {
      rmSync(path, { force: true })
    }
  }
  return entries.sort((a, b) => b.loadedAt - a.loadedAt)
}

export function writePersistentHubCache(entry: PersistentHubCacheEntry) {
  const json = JSON.stringify(entry.data)
  if (Buffer.byteLength(json, 'utf8') > MAX_ENTRY_BYTES) throw new Error('로컬 캐시 자료가 너무 큽니다.')
  const encrypted = safeStorage.isEncryptionAvailable()
  // 학생·교직원 자료가 포함될 수 있으므로 암호화를 사용할 수 없는 환경에서는 디스크에 남기지 않는다.
  if (!encrypted) return false
  const envelope: DiskEnvelope = {
    format: 1,
    cacheKey: entry.cacheKey,
    resource: entry.resource,
    revision: entry.revision || '',
    signature: entry.signature || '',
    loadedAt: Number(entry.loadedAt) || Date.now(),
    encrypted: true,
    payload: safeStorage.encryptString(json).toString('base64'),
  }
  const target = cacheFile(entry.cacheKey)
  const temporary = `${target}.tmp`
  writeFileSync(temporary, JSON.stringify(envelope), 'utf8')
  rmSync(target, { force: true })
  renameSync(temporary, target)
  pruneCacheFiles()
  return true
}

export function deletePersistentHubCacheResource(resource: string) {
  for (const entry of readPersistentHubCache()) {
    if (entry.resource === resource) rmSync(cacheFile(entry.cacheKey), { force: true })
  }
}

export function clearPersistentHubCache() {
  rmSync(cacheRoot(), { recursive: true, force: true })
  mkdirSync(cacheRoot(), { recursive: true })
}

export function persistentHubCacheStatus() {
  const entries = readPersistentHubCache()
  return {
    count: entries.length,
    newestAt: entries.length ? Math.max(...entries.map(entry => entry.loadedAt)) : null,
    encrypted: safeStorage.isEncryptionAvailable(),
    resources: [...new Set(entries.map(entry => entry.resource))],
  }
}
