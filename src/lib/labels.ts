export const SEGMENTS = ['warehouse','distributor','manufacturer','fmcg','third_party_logistics','other'] as const
export const REGIONS = ['luzon','visayas','mindanao'] as const
export const ACCOUNT_STATUSES = ['prospect','active','inactive'] as const
export const LEAD_SOURCES = ['cold_call','referral','direct_visit','inbound','website','facebook','event','other'] as const
export const OPP_STAGES = ['new','contacted','presentation_done','proposal_sent','conforme_signed','contract_sent','contract_signed','active','on_hold','lost'] as const
export const ACTIVITY_TYPES = ['call','visit','email','meeting','messenger','whatsapp','note'] as const
export const TASK_STATUSES = ['open','done','cancelled'] as const
export const TICKET_CHANNELS = ['messenger','whatsapp','email','phone','visit','internal','other'] as const
export const TICKET_CATEGORIES = ['delivery_delay','pallet_quality','pallet_shortage','billing','dehire_request','pallet_audit','pickup_request','contract','other'] as const
export const TICKET_PRIORITIES = ['low','normal','high','urgent'] as const
export const TICKET_STATUSES = ['new','assigned','in_progress','waiting_client','resolved','closed'] as const

const SPECIAL: Record<string, string> = {
  fmcg: 'FMCG', third_party_logistics: '3PL', csr: 'CSR', qc: 'QC', whatsapp: 'WhatsApp',
  sales_rep: 'Sales Rep', sales_manager: 'Sales Manager', ops_manager: 'Ops Manager',
  presentation_done: 'Presentation done', conforme_signed: 'Conforme signed', on_hold: 'On hold',
  dehire_request: 'Dehire request', waiting_client: 'Waiting on client',
}
export function label(v: string | null | undefined) {
  if (!v) return '—'
  return SPECIAL[v] ?? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
