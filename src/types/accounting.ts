export interface BeverageItem {
  id?: number
  name: string
  supplier_group: string
  purchase_price: string
  selling_price?: string | null
  deposit: string
  units_per_crate: number
  sort_order: number
  is_active: boolean
  bottle_size?: string | null
  portions_per_bottle?: number | null
  selling_price_portion?: string | null
  created_at?: string
  updated_at?: string
}

export type RevenueSource =
  | 'bar_cash'
  | 'bar_paypal'
  | 'entrance_cash'
  | 'entrance_paypal'
  | 'vvk_pretix'
  | 'vvk_paypal'
  | 'vvk_stripe'

export type TaxSphere = 'zweckbetrieb' | 'wirtschaftlich' | 'vermoegensverwaltung' | 'ideell'

export const TAX_SPHERE_LABELS: Record<TaxSphere, string> = {
  zweckbetrieb: 'Zweckbetrieb',
  wirtschaftlich: 'Wirtschaftl. Betrieb',
  vermoegensverwaltung: 'Vermögensverwaltung',
  ideell: 'Ideeller Bereich',
}

export type VatRate = 'none' | '7' | '19'

export const VAT_RATE_LABELS: Record<VatRate, string> = {
  none: 'Keine USt',
  '7': '7% (ermäßigt)',
  '19': '19% (Regelsteuersatz)',
}

export const REVENUE_SOURCE_LABELS: Record<RevenueSource, string> = {
  bar_cash: 'Bar (Bargeld)',
  bar_paypal: 'Bar (PayPal)',
  entrance_cash: 'Einlass (Bargeld)',
  entrance_paypal: 'Einlass (PayPal)',
  vvk_pretix: 'VVK (Pretix)',
  vvk_paypal: 'VVK (PayPal)',
  vvk_stripe: 'VVK (Stripe)',
}

export const REVENUE_GROUPS: { label: string; sources: RevenueSource[] }[] = [
  { label: 'Getränkeverkauf', sources: ['bar_cash', 'bar_paypal'] },
  { label: 'Eintritt', sources: ['entrance_cash', 'entrance_paypal', 'vvk_pretix'] },
]

export interface RevenueEntry {
  id?: number
  accounting: number
  source: RevenueSource
  total: string
  change_money: string
  fees: string
  tax_sphere?: TaxSphere | null
  vat_rate?: VatRate | null
}

export interface InventoryEntry {
  id?: number
  accounting: number
  beverage_item: number
  beverage_item_name?: string
  beverage_item_supplier_group?: string
  quantity_before: string
  quantity_after: string
  snapshot_purchase_price?: string
  snapshot_selling_price?: string | null
  snapshot_deposit?: string
  recorded_by?: number
  recorded_at?: string
}

export type ExpensePaidFrom = 'entrance_cash' | 'bar_cash' | 'other'

export const EXPENSE_PAID_FROM_LABELS: Record<ExpensePaidFrom, string> = {
  entrance_cash: 'Einlasskasse',
  bar_cash: 'Barkasse',
  other: 'Offen',
}

export interface ExpenseEntry {
  id?: number
  accounting: number
  description: string
  amount: string
  notes: string
  paid_from: ExpensePaidFrom
  grant_category?: GrantCategory | null
  tax_sphere?: TaxSphere | null
  vat_rate?: VatRate | null
  is_paid_out?: boolean
}

export interface AccountingSplit {
  id?: number
  accounting: number
  participant_name: string
  share_percentage: string
}

export type AccountingStatus = 'draft' | 'final'

export interface EventAccounting {
  id?: number
  event: string | null
  event_title?: string
  event_date?: string
  status: AccountingStatus
  notes: string
  deposit_return: string
  created_by?: number
  created_at?: string
  updated_at?: string
  revenues?: RevenueEntry[]
  inventory_entries?: InventoryEntry[]
  expenses?: ExpenseEntry[]
  splits?: AccountingSplit[]
}

export interface AccountingSummary {
  total_revenue: string
  total_revenue_by_group: { label: string; total: string }[]
  total_expenses: string
  total_inventory_value_before: string
  total_inventory_value_after: string
  total_consumption_value: string
  deposit_return: string
  result: string
  splits: { participant_name: string; amount: string }[]
}

// ── Purchase (Wareneingang / Einkauf) ───────────────────────────

export type PurchaseStatus = 'draft' | 'final'

export interface PurchaseItem {
  id?: number
  beverage_item: number
  quantity: number
  unit_price: string
  total_price: string
}

export interface Purchase {
  id?: number
  date: string
  supplier: string
  invoice_number: string
  invoice_total: string
  net_amount?: string | null
  vat_amount?: string | null
  notes: string
  status: PurchaseStatus
  tax_sphere?: TaxSphere
  vat_rate?: VatRate
  created_at?: string
  updated_at?: string
  items?: PurchaseItem[]
}

// ── Stock (Bestandsübersicht) ───────────────────────────────────

export interface StockEntry {
  id: number
  name: string
  supplier_group: string
  units_per_crate: number
  bottle_size: string | null
  quantity: number
  crates: number
  loose_bottles: number
  purchase_price: string
  fifo_price: string
  deposit: string
  stock_value: string
  deposit_value: string
}

export type GrantCategory = 'kuenstlerhonorar' | 'sachkosten' | 'sonstiges'

export interface GrantApplication {
  id?: number
  event: string
  event_title?: string
  event_date?: string
  requested_amount: string
  eligible_expenses: string
  own_revenue: string
  annual_staff_costs: string
  annual_rent_costs: string
  approved_amount?: string | null
  sachbericht: string
  budget_plan: Record<string, any>
  zuwendungsbescheid_date?: string | null
  auszahlung_amount?: string | null
  actual_admission_revenue?: string
  actual_beverage_revenue?: string
  notes: string
  created?: string
  updated?: string
  has_abrechnung?: boolean
}

export interface GrantSummary {
  total_requested: number
  grant_count: number
}
