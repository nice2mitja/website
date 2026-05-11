import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types/api'
import type {
  BeverageItem,
  EventAccounting,
  RevenueEntry,
  InventoryEntry,
  ExpenseEntry,
  AccountingSplit,
  AccountingSummary,
  Purchase,
  StockEntry,
  GrantApplication,
  GrantSummary,
} from '@/types/accounting'

// ── Seed-Daten: Standard-Getränke ──────────────────────────────
// Werden über /api/drinks/ verwaltet.
// Die Daten hier dienen als Referenz für das initiale Befüllen
// via Django-Management-Command oder Admin-UI.

const SEED_BEVERAGES: Omit<BeverageItem, 'id' | 'created_at' | 'updated_at'>[] = [
  { name: 'Kurpfalz hell',              supplier_group: 'Bier',     purchase_price: '20.00', selling_price: null, deposit: '3.10',  units_per_crate: 20, sort_order: 1,  is_active: true },
  { name: 'Faust Pils',                 supplier_group: 'Bier',     purchase_price: '19.00', selling_price: null, deposit: '3.10',  units_per_crate: 20, sort_order: 2,  is_active: true },
  { name: 'Eichbaum Ur-Eich',           supplier_group: 'Bier',     purchase_price: '18.00', selling_price: null, deposit: '3.42',  units_per_crate: 24, sort_order: 3,  is_active: true },
  { name: 'Faust Naturradler',          supplier_group: 'Bier',     purchase_price: '17.00', selling_price: null, deposit: '3.10',  units_per_crate: 20, sort_order: 4,  is_active: true },
  { name: 'Faust alkoholfrei',          supplier_group: 'Bier',     purchase_price: '17.50', selling_price: null, deposit: '3.10',  units_per_crate: 20, sort_order: 5,  is_active: true },
  { name: 'Paulaner Spezi',             supplier_group: 'Limo',     purchase_price: '15.50', selling_price: null, deposit: '3.42',  units_per_crate: 24, sort_order: 6,  is_active: true },
  { name: 'Club Mate',                  supplier_group: 'Limo',     purchase_price: '14.50', selling_price: null, deposit: '4.50',  units_per_crate: 20, sort_order: 7,  is_active: true },
  { name: 'Afri Cola',                  supplier_group: 'Limo',     purchase_price: '14.00', selling_price: null, deposit: '5.10',  units_per_crate: 24, sort_order: 8,  is_active: true },
  { name: 'Black Forrest still',        supplier_group: 'Wasser',   purchase_price: '10.50', selling_price: null, deposit: '6.50',  units_per_crate: 20, sort_order: 9,  is_active: true },
  { name: 'Prinzenperle classic',       supplier_group: 'Wasser',   purchase_price: '3.90',  selling_price: null, deposit: '3.30',  units_per_crate: 12, sort_order: 10, is_active: true },
  { name: 'Thomas Henry Tonic Water',   supplier_group: 'Wasser',   purchase_price: '13.50', selling_price: null, deposit: '2.40',  units_per_crate: 6,  sort_order: 11, is_active: true },
  { name: 'Seezüngle Birne',            supplier_group: 'Seezüngle', purchase_price: '12.00', selling_price: null, deposit: '3.15', units_per_crate: 11, sort_order: 12, is_active: true },
  { name: 'Seezüngle Rhabarber',        supplier_group: 'Seezüngle', purchase_price: '12.00', selling_price: null, deposit: '3.15', units_per_crate: 11, sort_order: 13, is_active: true },
  { name: 'Seezüngle Kirsche',          supplier_group: 'Seezüngle', purchase_price: '12.00', selling_price: null, deposit: '3.15', units_per_crate: 11, sort_order: 14, is_active: true },
  { name: 'Seezüngle Träuble',          supplier_group: 'Seezüngle', purchase_price: '12.00', selling_price: null, deposit: '3.15', units_per_crate: 11, sort_order: 15, is_active: true },
  // Flaschen-Getränke (units_per_crate = 1 → Einzelflaschen, Dezimal-Eingabe)
  { name: 'Rotwein',                    supplier_group: 'Wein',       purchase_price: '7.99',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 20, is_active: true },
  { name: 'Rotwein (Angebot)',          supplier_group: 'Wein',       purchase_price: '4.99',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 21, is_active: true },
  { name: 'Steinmänndel Rotwein',       supplier_group: 'Wein',       purchase_price: '3.99',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 22, is_active: true },
  { name: 'Riesling',                   supplier_group: 'Wein',       purchase_price: '3.79',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 23, is_active: true },
  { name: 'Riesling Tiefenb. Htr.',     supplier_group: 'Wein',       purchase_price: '4.79',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 24, is_active: true },
  { name: 'Riesling Neuenburger',       supplier_group: 'Wein',       purchase_price: '3.99',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 25, is_active: true },
  { name: 'Sekt Söhnlein (klein)',      supplier_group: 'Wein',       purchase_price: '2.49',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 26, is_active: true },
  { name: 'Sekt Söhnlein (groß)',       supplier_group: 'Wein',       purchase_price: '4.49',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 27, is_active: true },
  { name: 'Three Sixty Vodka (Angebot)', supplier_group: 'Spirituosen', purchase_price: '8.99', selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 30, is_active: true },
  { name: 'Bombay Sapphire Gin',        supplier_group: 'Spirituosen', purchase_price: '16.99', selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 31, is_active: true },
  { name: 'Gordon\'s Gin',              supplier_group: 'Spirituosen', purchase_price: '9.99',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 32, is_active: true },
  { name: 'Jägermeister',               supplier_group: 'Spirituosen', purchase_price: '10.99', selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 33, is_active: true },
  { name: 'Pfeffi',                     supplier_group: 'Spirituosen', purchase_price: '4.99',  selling_price: null, deposit: '0.00', units_per_crate: 1, sort_order: 34, is_active: true },
]

// ── Beverage Items ──────────────────────────────────────────────

export const beverageService = {
  async getAll(): Promise<PaginatedResponse<BeverageItem>> {
    return api.get<PaginatedResponse<BeverageItem>>('/api/drinks/')
  },

  async getById(id: number): Promise<BeverageItem> {
    return api.get<BeverageItem>(`/api/drinks/${id}/`)
  },

  async create(item: Partial<BeverageItem>): Promise<BeverageItem> {
    return api.post<BeverageItem>('/api/drinks/', item)
  },

  async update(id: number, item: Partial<BeverageItem>): Promise<BeverageItem> {
    return api.patch<BeverageItem>(`/api/drinks/${id}/`, item)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/drinks/${id}/`)
  },

  async seedIfEmpty(): Promise<void> {
    const { results } = await this.getAll()
    if (results.length > 0) return
    for (const beverage of SEED_BEVERAGES) {
      await this.create(beverage)
    }
  },
}

// ── Event Accounting ────────────────────────────────────────────

export const accountingService = {
  async getAll(): Promise<PaginatedResponse<EventAccounting>> {
    return api.get<PaginatedResponse<EventAccounting>>('/api/abrechnungen/')
  },

  async getById(id: number): Promise<EventAccounting> {
    return api.get<EventAccounting>(`/api/abrechnungen/${id}/`)
  },

  async getByEvent(eventId: string): Promise<EventAccounting | null> {
    const { results } = await this.getAll()
    return results.find(a => a.event === eventId) ?? null
  },

  async create(data: Partial<EventAccounting>): Promise<EventAccounting> {
    return api.post<EventAccounting>('/api/abrechnungen/', data)
  },

  async update(id: number, data: Partial<EventAccounting>): Promise<EventAccounting> {
    return api.put<EventAccounting>(`/api/abrechnungen/${id}/`, data)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/abrechnungen/${id}/`)
  },

  async getSummary(_id: number): Promise<AccountingSummary> {
    // Summary is computed on the frontend from loaded data
    return {
      total_revenue: '0', total_revenue_by_group: [],
      total_expenses: '0', total_inventory_value_before: '0',
      total_inventory_value_after: '0', total_consumption_value: '0',
      deposit_return: '0', result: '0', splits: [],
    }
  },

  // ── Revenues ──
  // Revenues are stored as nested objects within the Abrechnung.
  // To update, send the full accounting object via PUT.

  async getRevenues(accountingId: number): Promise<RevenueEntry[]> {
    const accounting = await this.getById(accountingId)
    return accounting.revenues ?? []
  },

  async saveRevenue(accountingId: number, entry: Partial<RevenueEntry>): Promise<RevenueEntry> {
    const accounting = await this.getById(accountingId)
    const revenues = [...(accounting.revenues ?? [])]
    const idx = entry.id ? revenues.findIndex(r => r.id === entry.id) : -1
    if (idx !== -1) {
      revenues[idx] = { ...revenues[idx], ...entry } as RevenueEntry
    } else {
      revenues.push({
        accounting: accountingId,
        source: entry.source || 'bar_cash',
        total: entry.total || '0.00',
        change_money: entry.change_money || '0.00',
        fees: entry.fees || '0.00',
      } as RevenueEntry)
    }
    const updated = await this.update(accountingId, { revenues })
    const saved = (updated.revenues ?? []).find(r => r.source === entry.source)
    return saved ?? revenues[revenues.length - 1]
  },

  async deleteRevenue(accountingId: number, entryId: number): Promise<void> {
    const accounting = await this.getById(accountingId)
    const revenues = (accounting.revenues ?? []).filter(r => r.id !== entryId)
    await this.update(accountingId, { revenues })
  },

  // ── Inventory ──

  async getInventory(accountingId: number): Promise<InventoryEntry[]> {
    const accounting = await this.getById(accountingId)
    return accounting.inventory_entries ?? []
  },

  async saveInventory(accountingId: number, entry: Partial<InventoryEntry>): Promise<InventoryEntry> {
    const accounting = await this.getById(accountingId)
    const entries = [...(accounting.inventory_entries ?? [])]
    const idx = entry.id ? entries.findIndex(i => i.id === entry.id) : -1
    if (idx !== -1) {
      entries[idx] = { ...entries[idx], ...entry } as InventoryEntry
    } else {
      entries.push({
        accounting: accountingId,
        beverage_item: entry.beverage_item || 0,
        quantity_before: entry.quantity_before || '0',
        quantity_after: entry.quantity_after || '0',
      } as InventoryEntry)
    }
    const updated = await this.update(accountingId, { inventory_entries: entries })
    return (updated.inventory_entries ?? [])[entries.length - 1]
  },

  async saveAllInventory(accountingId: number, entries: Partial<InventoryEntry>[]): Promise<InventoryEntry[]> {
    const inventory_entries = entries.map(e => ({
      accounting: accountingId,
      beverage_item: e.beverage_item || 0,
      quantity_before: e.quantity_before || '0',
      quantity_after: e.quantity_after || '0',
    })) as InventoryEntry[]
    const updated = await this.update(accountingId, { inventory_entries })
    return updated.inventory_entries ?? []
  },

  // ── Expenses ──

  async getExpenses(accountingId: number): Promise<ExpenseEntry[]> {
    const accounting = await this.getById(accountingId)
    return accounting.expenses ?? []
  },

  async saveExpense(accountingId: number, entry: Partial<ExpenseEntry>): Promise<ExpenseEntry> {
    const accounting = await this.getById(accountingId)
    const expenses = [...(accounting.expenses ?? [])]
    const idx = entry.id ? expenses.findIndex(e => e.id === entry.id) : -1
    if (idx !== -1) {
      expenses[idx] = { ...expenses[idx], ...entry } as ExpenseEntry
    } else {
      expenses.push({
        accounting: accountingId,
        description: entry.description || '',
        amount: entry.amount || '0.00',
        notes: entry.notes || '',
        paid_from: entry.paid_from || 'bar_cash',
      } as ExpenseEntry)
    }
    const updated = await this.update(accountingId, { expenses })
    return (updated.expenses ?? [])[expenses.length - 1]
  },

  async deleteExpense(accountingId: number, entryId: number): Promise<void> {
    const accounting = await this.getById(accountingId)
    const expenses = (accounting.expenses ?? []).filter(e => e.id !== entryId)
    await this.update(accountingId, { expenses })
  },

  // ── Splits ──

  async getSplits(accountingId: number): Promise<AccountingSplit[]> {
    const accounting = await this.getById(accountingId)
    return accounting.splits ?? []
  },

  async saveSplit(accountingId: number, entry: Partial<AccountingSplit>): Promise<AccountingSplit> {
    const accounting = await this.getById(accountingId)
    const splits = [...(accounting.splits ?? [])]
    const idx = entry.id ? splits.findIndex(s => s.id === entry.id) : -1
    if (idx !== -1) {
      splits[idx] = { ...splits[idx], ...entry } as AccountingSplit
    } else {
      splits.push({
        accounting: accountingId,
        participant_name: entry.participant_name || '',
        share_percentage: entry.share_percentage || '0',
      } as AccountingSplit)
    }
    const updated = await this.update(accountingId, { splits })
    return (updated.splits ?? [])[splits.length - 1]
  },

  async deleteSplit(accountingId: number, entryId: number): Promise<void> {
    const accounting = await this.getById(accountingId)
    const splits = (accounting.splits ?? []).filter(s => s.id !== entryId)
    await this.update(accountingId, { splits })
  },
}

// ── Purchases (Wareneingänge / Einkäufe) ────────────────────────

export const purchaseService = {
  async getAll(): Promise<PaginatedResponse<Purchase>> {
    return api.get<PaginatedResponse<Purchase>>('/api/purchases/')
  },

  async getById(id: number): Promise<Purchase> {
    return api.get<Purchase>(`/api/purchases/${id}/`)
  },

  async create(data: Partial<Purchase>): Promise<Purchase> {
    return api.post<Purchase>('/api/purchases/', data)
  },

  async update(id: number, data: Partial<Purchase>): Promise<Purchase> {
    return api.put<Purchase>(`/api/purchases/${id}/`, data)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/purchases/${id}/`)
  },

  async scanReceipt(imageFile: File, eventId?: string): Promise<{ items: any[], raw: string, drive_upload?: { file_id: string, url: string } }> {
    const formData = new FormData()
    formData.append('image', imageFile)
    if (eventId) formData.append('event_id', eventId)
    return api.post<{ items: any[], raw: string, drive_upload?: { file_id: string, url: string } }>('/api/purchases/scan/', formData)
  },
}

// ── Stock (Bestandsübersicht) ───────────────────────────────────

export const stockService = {
  async getAll(): Promise<StockEntry[]> {
    return api.get<StockEntry[]>('/api/drinks/stock/')
  },

  async hasDraft(): Promise<boolean> {
    const [acc, pur] = await Promise.all([
      accountingService.getAll(),
      purchaseService.getAll(),
    ])
    return (
      acc.results.some(a => a.status === 'draft') ||
      pur.results.some(p => p.status === 'draft')
    )
  },
}

// ── Pretix (VVK-Daten) ──────────────────────────────────────────

export interface PretixSourceSummary {
  tickets: number
  revenue: number
  fees: number
}

export interface PretixOrderSummary {
  event_slug: string
  total_tickets: number
  total_revenue: number
  pretix_fee: number
  by_source: Record<string, PretixSourceSummary>
  warnings?: string[]
}

export const pretixService = {
  async getOrderSummary(eventSlug: string): Promise<PretixOrderSummary> {
    return api.get<PretixOrderSummary>(`/api/pretix/orders/${eventSlug}/`)
  },
}

// ── PayPal Bar Transactions ─────────────────────────────────────

export type PayPalCategory = 'bar' | 'entrance'

export interface PayPalBarTransaction {
  timestamp: string
  name: string
  description: string
  amount: number
  fee: number
  net: number
  type: string
  category: PayPalCategory
}

export interface PayPalBarSummary {
  event_id: string
  event_date: string
  entry_price: number | null
  entry_price_ak: number | null
  search_window: { start: string; end: string }
  transaction_count: number
  total_amount: number
  total_fees: number
  total_net: number
  transactions: PayPalBarTransaction[]
}

export const paypalBarService = {
  async getBarTransactions(eventId: string): Promise<PayPalBarSummary> {
    return api.get<PayPalBarSummary>(`/api/paypal/bar-transactions/${eventId}/`)
  },
}

// ── Grant Applications (Förderung) ──────────────────────────────

export const grantService = {
  async getAll(): Promise<PaginatedResponse<GrantApplication>> {
    return api.get<PaginatedResponse<GrantApplication>>('/api/grants/')
  },

  async getByEvent(eventId: string): Promise<GrantApplication | null> {
    const { results } = await api.get<PaginatedResponse<GrantApplication>>(`/api/grants/?event=${eventId}`)
    return results[0] ?? null
  },

  async create(data: Partial<GrantApplication>): Promise<GrantApplication> {
    return api.post<GrantApplication>('/api/grants/', data)
  },

  async update(id: number, data: Partial<GrantApplication>): Promise<GrantApplication> {
    return api.patch<GrantApplication>(`/api/grants/${id}/`, data)
  },

  async getSummary(year?: number): Promise<GrantSummary> {
    const params = year ? `?year=${year}` : ''
    return api.get<GrantSummary>(`/api/grants/summary/${params}`)
  },

  async downloadVerwendungsnachweis(eventId: string): Promise<void> {
    // Find the accounting for this event
    const { results } = await api.get<PaginatedResponse<EventAccounting>>('/api/abrechnungen/')
    const acc = results.find(a => a.event === eventId)
    if (!acc?.id) throw new Error('Keine Abrechnung für dieses Event gefunden')

    const token = localStorage.getItem('access_token')
    const baseUrl = api.getBaseUrl()
    const response = await fetch(`${baseUrl}/api/abrechnungen/${acc.id}/verwendungsnachweis/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Download fehlgeschlagen' }))
      throw new Error(err.error || 'Download fehlgeschlagen')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Verwendungsnachweis_${eventId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  },

  async downloadAntrag(grantId: number, eventTitle: string): Promise<void> {
    const token = localStorage.getItem('access_token')
    const baseUrl = api.getBaseUrl()
    const response = await fetch(`${baseUrl}/api/grants/${grantId}/antrag-pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Download fehlgeschlagen' }))
      throw new Error(err.error || 'Download fehlgeschlagen')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Antrag_${eventTitle.replace(/\s+/g, '_')}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  },
}

// ── Tax Export (EÜR / Sphären) ──────────────────────────────────

export interface TaxSummaryResponse {
  year: number
  spheres: Record<string, { label: string; income: number; expense: number; result: number }>
  vat: { ust_7: number; ust_19: number; ust_total: number; vorsteuer: number; zahllast: number }
}

export const taxExportService = {
  async getSummary(year: number): Promise<TaxSummaryResponse> {
    return api.get<TaxSummaryResponse>(`/api/export/euer/${year}/?output=json`)
  },

  async downloadExcel(year: number): Promise<void> {
    const token = localStorage.getItem('access_token')
    const baseUrl = api.getBaseUrl()
    const response = await fetch(`${baseUrl}/api/export/euer/${year}/?output=xlsx`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      throw new Error('Export fehlgeschlagen')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `EUER_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  },

  async downloadCsv(year: number): Promise<void> {
    const token = localStorage.getItem('access_token')
    const baseUrl = api.getBaseUrl()
    const response = await fetch(`${baseUrl}/api/export/euer/${year}/?output=csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      throw new Error('Export fehlgeschlagen')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `EUER_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
}

export interface EventDocument {
  id: number
  event: string
  file_name: string
  drive_file_id: string
  drive_url: string
  uploaded_by: number | null
  uploaded_by_name: string
  uploaded_at: string
  warning?: string
}

export const documentService = {
  async list(eventId: string): Promise<EventDocument[]> {
    const data = await api.get<any>(`/api/events/${eventId}/documents/`)
    return Array.isArray(data) ? data : data.results || []
  },

  async upload(eventId: string, file: File): Promise<EventDocument> {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<EventDocument>(`/api/events/${eventId}/documents/`, formData)
  },

  async remove(eventId: string, docId: number): Promise<void> {
    return api.delete(`/api/events/${eventId}/documents/${docId}/`)
  },

  async createDriveFolder(eventId: string): Promise<{ drive_folder_id: string; event_id: string }> {
    return api.post(`/api/events/${eventId}/create-drive-folder/`)
  },
}
