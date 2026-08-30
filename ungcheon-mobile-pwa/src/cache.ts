import type { DashboardPayload } from './types'

const LEGACY_DB_NAME = 'ungcheon-mobile-read-cache-v1'
const DB_NAME = 'ungcheon-mobile-read-cache-v2'
const STORE = 'snapshots'
const CACHE_TIMEOUT_MS = 1_500
let legacyCleanup: Promise<void> | null = null
const userGenerations = new Map<string, number>()

function deleteLegacyCache() {
  if (!legacyCleanup) legacyCleanup = new Promise(resolve => {
    const timeout = setTimeout(resolve, CACHE_TIMEOUT_MS)
    const finish = () => { clearTimeout(timeout); resolve() }
    try {
      const request = indexedDB.deleteDatabase(LEGACY_DB_NAME)
      request.onsuccess = request.onerror = request.onblocked = finish
    } catch { finish() }
  })
  return legacyCleanup
}

async function openDb() {
  await deleteLegacyCache()
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    const fail = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('기기 저장소를 열 수 없습니다.')) } }
    const timeout = setTimeout(fail, CACHE_TIMEOUT_MS)
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => {
        if (settled) { request.result.close(); return }
        settled = true; clearTimeout(timeout); resolve(request.result)
      }
      request.onerror = request.onblocked = fail
    } catch { fail() }
  })
}

async function userKey(name: string) {
  const bytes = new TextEncoder().encode(`ungcheon-mobile:${name.trim()}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function readUserCache(name: string): Promise<DashboardPayload | null> {
  let db: IDBDatabase | undefined
  try {
    db = await openDb()
    const key = await userKey(name)
    return (await transact<DashboardPayload | undefined>(db, 'readonly', store => store.get(key))) ?? null
  } catch { return null } finally { db?.close() }
}

function transact<T>(db: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const timeout = setTimeout(() => {
      try { transaction.abort() } catch { /* 이미 종료된 트랜잭션도 시간초과로 정리한다. */ }
      reject(new Error('기기 저장소 응답이 지연됩니다.'))
    }, CACHE_TIMEOUT_MS)
    try {
      const request = operation(transaction.objectStore(STORE))
      transaction.oncomplete = () => { clearTimeout(timeout); resolve(request.result) }
      transaction.onerror = transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error ?? new Error('기기 저장소 작업에 실패했습니다.')) }
    } catch (error) { clearTimeout(timeout); reject(error) }
  })
}

export async function writeUserCache(name: string, payload: DashboardPayload) {
  const normalizedName = name.trim()
  const generation = userGenerations.get(normalizedName) ?? 0
  const db = await openDb()
  try {
    const key = await userKey(normalizedName)
    // 로그아웃 이후 뒤늦게 열린 저장 작업이 개인정보 캐시를 되살리지 않는다.
    if (generation !== (userGenerations.get(normalizedName) ?? 0)) return
    await transact(db, 'readwrite', store => store.put(payload, key))
  } finally { db.close() }
}

export async function deleteUserCache(name: string) {
  const normalizedName = name.trim()
  userGenerations.set(normalizedName, (userGenerations.get(normalizedName) ?? 0) + 1)
  let db: IDBDatabase | undefined
  try {
    db = await openDb()
    const key = await userKey(normalizedName)
    await transact(db, 'readwrite', store => store.delete(key))
  } catch { /* 로그아웃은 저장소를 쓸 수 없는 환경에서도 계속한다. */ }
  finally { db?.close() }
}
