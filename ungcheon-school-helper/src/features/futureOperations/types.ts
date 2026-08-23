export type FutureOperationsTab = 'notifications' | 'reservations' | 'density' | 'collections' | 'duties' | 'handover'

export type NotificationCategory = 'action' | 'reference' | 'done'
export type NotificationSource = 'task' | 'committee' | 'timetable' | 'reservation' | 'collection' | 'duty' | 'handover'

export interface OperationsNotification {
  id: string
  source: NotificationSource
  category: NotificationCategory
  title: string
  summary: string
  dueAt: string
  createdAt: string
  readAt: string
  snoozedUntil: string
  href?: string
}

export type ResourceKind = 'room' | 'device' | 'vehicle' | 'other'
export type RecurrenceKind = 'once' | 'daily' | 'weekly'

export interface FacilityReservation {
  id: string
  resourceKind: ResourceKind
  resourceName: string
  title: string
  reserverName: string
  date: string
  startTime: string
  endTime: string
  recurrenceGroupId: string
  createdAt: string
}

export type DensityEventKind = 'assessment' | 'schoolEvent'

export interface DensityEvent {
  id: string
  kind: DensityEventKind
  title: string
  subject: string
  grade: string
  className: string
  date: string
  createdAt: string
}

export type CollectionResponseType = 'check' | 'shortText' | 'select' | 'link'

export interface CollectionResponse {
  respondentName: string
  value: string
  submittedAt: string
}

export interface CollectionCampaign {
  id: string
  title: string
  description: string
  deadline: string
  responseType: CollectionResponseType
  options: string[]
  targetNames: string[]
  responses: CollectionResponse[]
  createdAt: string
}

export interface DutyAssignment {
  id: string
  dutyName: string
  date: string
  startTime: string
  location: string
  assigneeName: string
  createdAt: string
}

export type HandoverCadence = 'once' | 'monthly' | 'semester' | 'annual'

export interface HandoverTemplate {
  id: string
  title: string
  department: string
  cadence: HandoverCadence
  targetMonthDay: string
  purpose: string
  procedure: string
  priorDocumentUrl: string
  caution: string
  successorName: string
  successorConfirmedAt: string
  createdAt: string
  updatedAt: string
}

export interface FutureOperationsState {
  version: 1
  notifications: OperationsNotification[]
  reservations: FacilityReservation[]
  densityEvents: DensityEvent[]
  collections: CollectionCampaign[]
  dutyAssignments: DutyAssignment[]
  handoverTemplates: HandoverTemplate[]
}

