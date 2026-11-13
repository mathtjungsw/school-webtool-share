import { hubRequest } from './schoolHub'

export interface MigrationResource {
  resource: string
  sheetName: string
  identity: string
  status: string
  exists?: boolean
  usedRowsUpperBound?: number
  usedColumns?: number
}

export interface MigrationStatus {
  phase: 'PREPARING' | 'TRACKING'
  mode: 'SHEETS_PRIMARY'
  activeBackend: 'SHEETS'
  replicaConnected: boolean
  liveTrackingEnabled: boolean
  cutoverReady: boolean
  pendingCount: number | null
  errorCount: number | null
  verifiedRevision: number | null
  recordedRevision?: number | null
  resources: MigrationResource[]
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
