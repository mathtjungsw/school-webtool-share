import { hubRequest } from './schoolHub'

export interface MigrationResource {
  resource: string
  sheetName: string
  identity: string
  status: string
  exists?: boolean
  usedRowsUpperBound?: number
  usedColumns?: number
  replicaCount?: number | null
}

export interface MigrationStatus {
  phase: 'PREPARING' | 'DRAINING' | 'TRACKING' | 'COPYING_BASELINE' | 'MIRRORING' | 'NEEDS_REVIEW' | 'PAUSED' | 'REBASE_REQUIRED' | 'FIRESTORE' | 'RETURNING' | 'SHEETS_RETURNED'
  mode: 'SHEETS_PRIMARY' | 'FIRESTORE_PRIMARY'
  activeBackend: 'SHEETS' | 'FIRESTORE'
  backupVerifiedAt?: string | null
  replicaConnected: boolean
  liveTrackingEnabled: boolean
  cutoverReady: boolean
  pendingCount: number | null
  errorCount: number | null
  verifiedRevision: number | null
  recordedRevision?: number | null
  baselinePrepared?: boolean
  replicaPaused?: boolean
  workerBusy?: boolean
  canRun?: boolean
  baseRevision?: number | null
  blockedRevision?: number | null
  resolvedCount?: number | null
  activationNotBefore?: string
  lastRun?: { completedAt: string; result: MigrationRunResult } | null
  resources: MigrationResource[]
}

export interface MigrationRunResult {
  status: 'PROGRESS' | 'BUDGET_EXHAUSTED' | 'IDLE' | 'NEEDS_REVIEW' | 'RETRY_LATER' | 'BUSY' | 'PAUSED' | 'ERROR'
  steps: number
  appliedRevision?: number
  blockedRevision?: number
  code?: string
}

export interface MigrationReview {
  challengeRef: string
  revision: number
  expiresAt: string
  changes: { resource: string; sheetName: string; count: number; putCount: number; deleteCount: number; source: 'NEXT_BEFORE_IMAGE' | 'CURRENT_SOURCE' }[]
}

export function runMigrationReplica(adminPassword: string) {
  return hubRequest<MigrationRunResult>({ action: 'runMigrationReplica', adminPassword })
}

export function setMigrationReplicaPaused(adminPassword: string, paused: boolean) {
  return hubRequest<{ paused: boolean; trackingContinues: boolean }>({ action: 'setMigrationReplicaPaused', adminPassword, paused })
}

export function prepareMigrationReview(adminPassword: string, revision: number) {
  return hubRequest<MigrationReview>({ action: 'prepareMigrationReview', adminPassword, revision })
}

export function confirmMigrationReview(adminPassword: string, challengeRef: string) {
  return hubRequest<{ accepted: boolean; duplicate: boolean; revision: number }>({ action: 'confirmMigrationReview', adminPassword, challengeRef, decision: 'ACCEPT_OBSERVED_SOURCE', sourceChecked: true })
}

export interface MigrationInventory {
  inspectedAt: string
  consistentSnapshot: boolean
  resources: MigrationResource[]
  unclassifiedSheetCount: number
  externalSourcesInspected: boolean
  rowValuesRead: boolean
}

export function getMigrationStatus(adminPassword: string) {
  return hubRequest<MigrationStatus>({ action: 'getMigrationStatus', adminPassword })
}

export function getMigrationInventory(adminPassword: string) {
  return hubRequest<MigrationInventory>({ action: 'getMigrationInventory', adminPassword })
}
