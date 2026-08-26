import { CalendarClock, ExternalLink, ShieldCheck } from 'lucide-react'
import type { ReferenceMetadata } from '../data/auditEvidence'

export default function ReferenceMetadataView({ metadata, compact = false }: { metadata: ReferenceMetadata; compact?: boolean }) {
  return (
    <div className={`reference-metadata ${compact ? 'reference-metadata-compact' : ''}`}>
      <span><CalendarClock size={13} />기준일 <b>{metadata.standardDate || '확인되지 않음'}</b></span>
      <span title={metadata.sourceFile || metadata.source}><ExternalLink size={13} />출처 <b>{metadata.source || '확인되지 않음'}</b></span>
      <span><ShieldCheck size={13} />최종 확인일 <b>{metadata.verifiedAt || '확인되지 않음'}</b></span>
    </div>
  )
}
