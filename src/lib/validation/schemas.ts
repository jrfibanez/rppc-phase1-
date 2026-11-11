import { z } from 'zod'
import {
  SEGMENTS, REGIONS, ACCOUNT_STATUSES, LEAD_SOURCES, OPP_STAGES, ACTIVITY_TYPES, TASK_STATUSES,
  TICKET_CHANNELS, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES,
} from '@/lib/labels'
import { ROLES } from '@/lib/auth/permissions'

/** Empty form strings become null. */
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v === undefined ? null : v), s.nullable())
const optText = (max: number) => opt(z.string().trim().max(max))
const optUuid = opt(z.string().uuid())
const optInt = (min: number, max: number) => opt(z.coerce.number().int().min(min).max(max))
const optNum = (min: number, max: number) => opt(z.coerce.number().min(min).max(max))
const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())

export const uuid = z.string().uuid()

export const accountSchema = z.object({
  name: z.string().trim().min(2).max(200),
  legal_name: optText(200),
  segment: z.enum(SEGMENTS),
  status: z.enum(ACCOUNT_STATUSES),
  lead_source: opt(z.enum(LEAD_SOURCES)),
  owner_id: optUuid,
  lock_in_months: optInt(1, 60),
  principal_account_id: optUuid,
  notes: optText(4000),
}).strip()

export const accreditationSchema = z.object({
  is_accredited: checkbox,
  accredited_at: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  billing_cutoff_day: z.coerce.number().int().min(1).max(28),
}).strip().refine((v) => !v.is_accredited || v.accredited_at, { message: 'Accreditation date is required', path: ['accredited_at'] })

export const financeSchema = z.object({
  tin: opt(z.string().trim().regex(/^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$/, 'TIN format: 000-000-000 or 000-000-000-00000')),
  billing_address: optText(500),
  billing_email: opt(z.string().trim().email()),
}).strip()

export const contactSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  job_title: optText(120),
  department: optText(120),
  email: opt(z.string().trim().toLowerCase().email()),
  mobile: optText(40),
  messenger_link: opt(z.string().trim().url().max(500)),
  is_primary: checkbox,
}).strip()

export const siteSchema = z.object({
  name: z.string().trim().min(2).max(200),
  region: z.enum(REGIONS),
  province: optText(120),
  city: optText(120),
  address: optText(500),
  lat: optNum(-90, 90),
  lng: optNum(-180, 180),
  receiving_hours: optText(200),
  site_contact_id: optUuid,
  trucking_zone: optText(60),
}).strip()

export const opportunitySchema = z.object({
  account_id: uuid,
  title: z.string().trim().min(2).max(200),
  stage: z.enum(OPP_STAGES).default('new'),
  owner_id: optUuid,
  est_pallets: optInt(1, 10_000_000),
  pallet_spec: optText(200),
  target_region: opt(z.enum(REGIONS)),
  expected_start: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  lost_reason: optText(1000),
}).strip().refine((v) => v.stage !== 'lost' || !!v.lost_reason, { message: 'A lost reason is required', path: ['lost_reason'] })

export const stageMoveSchema = z.object({
  id: uuid,
  stage: z.enum(OPP_STAGES),
  lost_reason: optText(1000),
}).strict().refine((v) => v.stage !== 'lost' || !!v.lost_reason, { message: 'A lost reason is required', path: ['lost_reason'] })

export const activitySchema = z.object({
  client_uuid: z.string().uuid(),
  type: z.enum(ACTIVITY_TYPES),
  account_id: z.string().uuid(),
  contact_id: z.string().uuid().nullish(),
  opportunity_id: z.string().uuid().nullish(),
  site_id: z.string().uuid().nullish(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
  summary: z.string().trim().min(3).max(4000),
  next_step: z.string().trim().max(500).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
}).strict()
export type ActivityInput = z.infer<typeof activitySchema>

export const taskSchema = z.object({
  client_uuid: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(300),
  due_at: z.string().datetime({ offset: true }).nullish(),
  assigned_to: z.string().uuid(),
  account_id: z.string().uuid().nullish(),
  opportunity_id: z.string().uuid().nullish(),
  activity_id: z.string().uuid().nullish(),
  ticket_id: z.string().uuid().nullish(),
}).strict()

export const taskStatusSchema = z.object({ id: uuid, status: z.enum(TASK_STATUSES) }).strict()

export const ticketSchema = z.object({
  client_uuid: z.string().uuid(),
  account_id: z.string().uuid(),
  site_id: z.string().uuid().nullish(),
  contact_id: z.string().uuid().nullish(),
  channel: z.enum(TICKET_CHANNELS),
  source_ref: z.string().trim().max(1000).nullish(),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().max(8000).nullish(),
  assigned_to: z.string().uuid().nullish(),
}).strict()

export const ticketUpdateSchema = z.object({
  id: uuid,
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
  category: z.enum(TICKET_CATEGORIES),
  assigned_to: optUuid,
  resolution_note: optText(4000),
}).strip().refine((v) => !['resolved','closed'].includes(v.status) || !!v.resolution_note,
  { message: 'A resolution note is required to resolve or close', path: ['resolution_note'] })

export const ticketCommentSchema = z.object({
  client_uuid: z.string().uuid(),
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
  is_internal: z.boolean().default(false),
}).strict()

export const PASSWORD_MIN = 12
export const passwordSchema = z.string().min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`).max(128)

export function passwordProblems(password: string, email: string | null | undefined) {
  const r = passwordSchema.safeParse(password)
  if (!r.success) return r.error.issues[0].message
  const local = (email ?? '').split('@')[0]?.toLowerCase()
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) return 'Password must not contain your email name'
  return null
}

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  phone: optText(40),
}).strip()

export const userUpdateSchema = z.object({
  id: uuid,
  role: z.enum(ROLES),
  is_active: checkbox,
}).strip()

export const slaSchema = z.object({
  priority: z.enum(TICKET_PRIORITIES),
  first_response_h: z.coerce.number().int().min(1).max(720),
  resolution_h: z.coerce.number().int().min(1).max(2160),
}).strip().refine((v) => v.resolution_h >= v.first_response_h, { message: 'Resolution must be ≥ first response', path: ['resolution_h'] })

// ===== CSV import row schemas =====
const csvOpt = (s: z.ZodTypeAny) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v), s.nullable().optional())
const csvEnum = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^3pl$/, 'third_party_logistics') : v), z.enum(vals))

export const importAccountRow = z.object({
  name: z.string().trim().min(2).max(200),
  legal_name: csvOpt(z.string().max(200)),
  segment: z.preprocess((v) => (v === '' || v == null ? 'other' : v), csvEnum(SEGMENTS)),
  status: z.preprocess((v) => (v === '' || v == null ? 'prospect' : v), csvEnum(ACCOUNT_STATUSES)),
  lead_source: z.preprocess((v) => (v === '' ? null : v), csvEnum(LEAD_SOURCES).nullable().optional()),
  billing_cutoff_day: z.preprocess((v) => (v === '' || v == null ? 10 : v), z.coerce.number().int().min(1).max(28)),
  lock_in_months: csvOpt(z.coerce.number().int().min(1).max(60)),
  notes: csvOpt(z.string().max(4000)),
}).strip()

export const importContactRow = z.object({
  account_code: z.string().trim().min(1),
  full_name: z.string().trim().min(2).max(120),
  job_title: csvOpt(z.string().max(120)),
  department: csvOpt(z.string().max(120)),
  email: csvOpt(z.string().toLowerCase().email()),
  mobile: csvOpt(z.string().max(40)),
  is_primary: z.preprocess((v) => typeof v === 'string' && /^(y|yes|true|1)$/i.test(v.trim()), z.boolean()),
}).strip()

export const importSiteRow = z.object({
  account_code: z.string().trim().min(1),
  name: z.string().trim().min(2).max(200),
  region: z.preprocess((v) => (v === '' || v == null ? 'luzon' : v), csvEnum(REGIONS)),
  province: csvOpt(z.string().max(120)),
  city: csvOpt(z.string().max(120)),
  address: csvOpt(z.string().max(500)),
  receiving_hours: csvOpt(z.string().max(200)),
}).strip()
