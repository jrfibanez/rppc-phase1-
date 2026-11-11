export const ROLES = [
  'owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer',
  'finance','billing','purchasing','hr','production_officer','qc',
  'driver','helper','pallet_maker','painter',
] as const
export type Role = (typeof ROLES)[number]

export type Action =
  | 'account:read' | 'account:create' | 'account:update' | 'account:archive' | 'account:accredit'
  | 'account:finance:read' | 'account:finance:write'
  | 'contact:create' | 'contact:update' | 'site:write'
  | 'opportunity:read' | 'opportunity:write' | 'opportunity:reassign'
  | 'activity:read' | 'activity:create' | 'task:write'
  | 'ticket:read' | 'ticket:create' | 'ticket:update'
  | 'attachment:upload'
  | 'user:manage' | 'audit:read' | 'import:run' | 'settings:manage' | 'export:sap'
  | 'dashboard:team'

const MGMT: Role[] = ['owner','admin','sales_manager']
export const CRM_ROLES: Role[] = [...MGMT,'sales_rep','csr','ops_manager','deployment_officer','finance','billing']

export const PERMISSIONS: Record<Action, Role[]> = {
  'account:read':     CRM_ROLES,
  'account:create':   [...MGMT,'sales_rep'],
  'account:update':   [...MGMT,'sales_rep','ops_manager'],   // reps/ops further limited by RLS + field guard
  'account:archive':  MGMT,
  'account:accredit': [...MGMT,'ops_manager'],
  'account:finance:read':  [...MGMT,'finance','billing'],
  'account:finance:write': ['owner','admin','finance','billing'],
  'contact:create':   [...MGMT,'sales_rep','csr'],
  'contact:update':   [...MGMT,'sales_rep'],
  'site:write':       [...MGMT,'sales_rep','ops_manager'],
  'opportunity:read': [...MGMT,'sales_rep','csr','ops_manager'],
  'opportunity:write':[...MGMT,'sales_rep'],
  'opportunity:reassign': MGMT,
  'activity:read':    CRM_ROLES,
  'activity:create':  [...MGMT,'sales_rep','csr','deployment_officer'],
  'task:write':       CRM_ROLES,
  'ticket:read':      CRM_ROLES,
  'ticket:create':    [...MGMT,'sales_rep','csr','ops_manager','deployment_officer'],
  'ticket:update':    [...MGMT,'csr','ops_manager','deployment_officer','sales_rep','finance','billing'],
  'attachment:upload': CRM_ROLES,
  'user:manage':      ['owner','admin'],
  'audit:read':       ['owner','admin'],
  'import:run':       MGMT,
  'settings:manage':  ['owner','admin'],
  'export:sap':       [...MGMT,'finance','billing'],
  'dashboard:team':   [...MGMT,'ops_manager'],
}

export const can = (role: Role | null | undefined, action: Action) =>
  !!role && PERMISSIONS[action].includes(role)

export const hasCrmAccess = (role: Role | null | undefined) => !!role && CRM_ROLES.includes(role)
