import { Badge } from './ui/badge'

export function JobStatusBadge({ status, reason }: { status: string; reason?: string }) {
  const variant = status === 'COMPLETED' ? 'success'
    : ['ABORTED', 'FAILED', 'PROCESSING_STOPPED'].includes(status) ? 'error'
      : ['HELD', 'PENDING_HELD', 'AWAITING_FLIP', 'SUBMISSION_UNKNOWN'].includes(status) ? 'warning'
        : ['QUEUED', 'PENDING', 'PROCESSING'].includes(status) ? 'default' : 'secondary'
  const label = status.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  return <Badge variant={variant} shape="pill" title={reason}>{label}</Badge>
}
