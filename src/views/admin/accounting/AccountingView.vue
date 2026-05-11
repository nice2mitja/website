<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { accountingService, beverageService, eventService, pretixService, paypalBarService, grantService, stockService, documentService } from '@/services'
import type { Event } from '@/services'
import type { PretixOrderSummary, PayPalBarSummary, PayPalCategory, EventDocument } from '@/services/accounting'
import type {
  EventAccounting,
  RevenueEntry,
  RevenueSource,
  InventoryEntry,
  ExpenseEntry,
  AccountingSplit,
  ExpensePaidFrom,
  BeverageItem,
  GrantApplication,
  GrantSummary,
  StockEntry,
  TaxSphere,
  VatRate,
} from '@/types/accounting'
import {
  REVENUE_SOURCE_LABELS,
  REVENUE_GROUPS,
  EXPENSE_PAID_FROM_LABELS,
  TAX_SPHERE_LABELS,
  VAT_RATE_LABELS,
} from '@/types/accounting'
import { useSort } from '@/composables/useSort'


const props = defineProps<{
  eventId: string
}>()

const router = useRouter()
const activeTab = ref('cashcount')

// ── State ────────────────────────────────────────────────────────
const event = ref<Event | null>(null)
const accounting = ref<EventAccounting | null>(null)
const beverages = ref<BeverageItem[]>([])
const stockData = ref<Record<number, StockEntry>>({})
const revenues = ref<RevenueEntry[]>([])
const inventory = ref<InventoryEntry[]>([])
const expenses = ref<ExpenseEntry[]>([])
const splits = ref<AccountingSplit[]>([])

const isLoading = ref(false)
const isSaving = ref(false)
const error = ref('')
const saveSuccess = ref('')

// ── Pretix VVK ───────────────────────────────────────────────────
const pretixData = ref<PretixOrderSummary | null>(null)
const pretixLoading = ref(false)
const pretixError = ref('')

// ── PayPal Bar ───────────────────────────────────────────────────
const paypalBarData = ref<PayPalBarSummary | null>(null)
const paypalBarLoading = ref(false)
const paypalBarError = ref('')
const paypalBarExpanded = ref(false)

// ── Grant (Förderung) ────────────────────────────────────────────
const grantRecord = ref<GrantApplication | null>(null)
const grantSummary = ref<GrantSummary | null>(null)
const grantSubTab = ref<'antrag' | 'nachweis'>('antrag')
const rentFlatAmount = ref(134.46)
const approvedAmount = ref<number | null>(null)
const grantSaving = ref(false)
const grantDownloading = ref<string | null>(null)

// Zuwendungsbescheid
const zuwendungsbescheidDate = ref('')
const auszahlungAmount = ref<number | null>(null)

// Sachbericht
const sachbericht = ref('')
const grantNotes = ref('')

// Budget plan (expected expenses & revenues for Antrag)
const budgetKuenstler = ref<{ name: string; amount: string }[]>([])
const budgetSachkosten = ref<{ name: string; amount: string }[]>([])
const budgetSonstiges = ref<{ name: string; amount: string }[]>([])
const budgetRevEintritt = ref('0')
const budgetRevGetraenke = ref('0')
const budgetRevEigenmittel = ref('0')
const budgetRevDrittmittel = ref('0')
const budgetRevSonstige = ref('0')

// ── Documents (Google Drive) ────────
const documents = ref<EventDocument[]>([])
const isLoadingDocs = ref(false)
const uploadingFiles = ref<{ name: string }[]>([])
const dragOver = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadError = ref('')

const paypalBarTotals = computed(() => {
  if (!paypalBarData.value) return { amount: 0, fees: 0, net: 0, count: 0 }
  const txns = paypalBarData.value.transactions
  return {
    amount: txns.reduce((s, t) => s + t.amount, 0),
    fees: txns.reduce((s, t) => s + t.fee, 0),
    net: txns.reduce((s, t) => s + t.net, 0),
    count: txns.length,
  }
})

const paypalBarCategoryTotals = computed(() => {
  if (!paypalBarData.value) return { bar: { amount: 0, fees: 0, count: 0 }, entrance: { amount: 0, fees: 0, count: 0 } }
  const txns = paypalBarData.value.transactions
  const bar = txns.filter(t => t.category === 'bar')
  const entrance = txns.filter(t => t.category === 'entrance')
  return {
    bar: { amount: bar.reduce((s, t) => s + t.amount, 0), fees: bar.reduce((s, t) => s + t.fee, 0), count: bar.length },
    entrance: { amount: entrance.reduce((s, t) => s + t.amount, 0), fees: entrance.reduce((s, t) => s + t.fee, 0), count: entrance.length },
  }
})

// ── Sorting ──────────────────────────────────────────────────────
const invSort = useSort<{ beverage: BeverageItem; entry: InventoryEntry }>()
const expSort = useSort<ExpenseEntry>()

function sortedInventory(items: { beverage: BeverageItem; entry: InventoryEntry }[]) {
  return invSort.sorted(items, (item, key) => {
    switch (key) {
      case 'name': return item.beverage.name.toLowerCase()
      case 'before': return parseFloat(item.entry.quantity_before || '0')
      case 'after': return parseFloat(item.entry.quantity_after || '0')
      case 'consumed': return inventoryConsumption(item.entry)
      case 'value': return inventoryValue(item.entry, item.beverage)
      default: return 0
    }
  })
}

const sortedExpenses = computed(() => {
  return expSort.sorted(expenses.value, (item, key) => {
    switch (key) {
      case 'desc': return (item.description || '').toLowerCase()
      case 'amount': return parseFloat(item.amount || '0')
      default: return 0
    }
  })
})

async function fetchPretixData() {
  if (!props.eventId) return
  pretixLoading.value = true
  pretixError.value = ''
  try {
    pretixData.value = await pretixService.getOrderSummary(props.eventId)
  } catch (e: any) {
    pretixError.value = e.message || 'Pretix-Daten konnten nicht geladen werden'
  } finally {
    pretixLoading.value = false
  }
}

function applyPretixData() {
  if (!pretixData.value) return
  const d = pretixData.value
  const totalFees = d.pretix_fee + Object.values(d.by_source).reduce((s, i) => s + i.fees, 0)
  const rev = getRevenue('vvk_pretix')
  rev.total = d.total_revenue.toFixed(2)
  rev.fees = totalFees.toFixed(2)
  rev.change_money = '0.00'
}

async function fetchPaypalBarData() {
  if (!props.eventId) return
  paypalBarLoading.value = true
  paypalBarError.value = ''
  try {
    paypalBarData.value = await paypalBarService.getBarTransactions(props.eventId)
  } catch (e: any) {
    paypalBarError.value = e.message || 'PayPal-Daten konnten nicht geladen werden'
  } finally {
    paypalBarLoading.value = false
  }
}

function applyPaypalBarData() {
  if (!paypalBarData.value) return
  const ct = paypalBarCategoryTotals.value
  // Apply bar transactions
  const barRev = getRevenue('bar_paypal')
  barRev.total = ct.bar.amount.toFixed(2)
  barRev.fees = ct.bar.fees.toFixed(2)
  barRev.change_money = '0.00'
  // Apply entrance transactions
  const entranceRev = getRevenue('entrance_paypal')
  entranceRev.total = ct.entrance.amount.toFixed(2)
  entranceRev.fees = ct.entrance.fees.toFixed(2)
  entranceRev.change_money = '0.00'
}

function removePaypalBarTransaction(idx: number) {
  if (!paypalBarData.value) return
  paypalBarData.value.transactions.splice(idx, 1)
}

function togglePaypalCategory(idx: number) {
  if (!paypalBarData.value) return
  const txn = paypalBarData.value.transactions[idx]
  txn.category = txn.category === 'bar' ? 'entrance' : 'bar'
}

function setAllPaypalCategory(category: PayPalCategory) {
  if (!paypalBarData.value) return
  paypalBarData.value.transactions.forEach(t => { t.category = category })
}

// ── Computed: Revenue ────────────────────────────────────────────

const allRevenueSources: RevenueSource[] = [
  'bar_cash', 'bar_paypal',
  'entrance_cash', 'entrance_paypal',
  'vvk_pretix',
]

function getRevenue(source: RevenueSource): RevenueEntry {
  const existing = revenues.value.find(r => r.source === source)
  if (existing) return existing
  const entry: RevenueEntry = {
    accounting: accounting.value?.id || 0,
    source,
    total: '0.00',
    change_money: '0.00',
    fees: '0.00',
  }
  revenues.value.push(entry)
  return entry
}

function revenueNet(entry: RevenueEntry): number {
  return parseFloat(entry.total || '0') - parseFloat(entry.change_money || '0') - parseFloat(entry.fees || '0')
}

const totalRevenue = computed(() => {
  return revenues.value.reduce((sum, r) => sum + revenueNet(r), 0)
})

function groupRevenue(sources: RevenueSource[]): number {
  return revenues.value
    .filter(r => sources.includes(r.source))
    .reduce((sum, r) => sum + revenueNet(r), 0)
}

// ── Computed: Inventory ──────────────────────────────────────────

// ── Kisten/Flaschen-Hilfs-State für Inventur-UI ─────────────────
// Speichert die aufgeteilte Eingabe (Kisten + Einzelflaschen),
// berechnet daraus den Gesamtwert für quantity_before / quantity_after.
const inventoryCrates = ref<Record<string, { beforeCrates: number; beforeBottles: number; afterCrates: number; afterBottles: number }>>({})

function crateKey(bevId: number, field: 'before' | 'after'): string {
  return `${bevId}_${field}`
}

function getOrInitCrateState(bevId: number, unitsPerCrate: number, entry: InventoryEntry) {
  const key = String(bevId)
  if (!inventoryCrates.value[key]) {
    const totalBefore = parseFloat(entry.quantity_before || '0')
    const totalAfter = parseFloat(entry.quantity_after || '0')
    inventoryCrates.value[key] = {
      beforeCrates: Math.floor(totalBefore / unitsPerCrate),
      beforeBottles: Math.round((totalBefore % unitsPerCrate) * 100) / 100,
      afterCrates: Math.floor(totalAfter / unitsPerCrate),
      afterBottles: Math.round((totalAfter % unitsPerCrate) * 100) / 100,
    }
  }
  return inventoryCrates.value[key]
}

function updateEntryFromCrates(entry: InventoryEntry, beverage: BeverageItem) {
  const state = inventoryCrates.value[String(beverage.id)]
  if (!state) return
  const upc = beverage.units_per_crate || 1
  entry.quantity_before = String(state.beforeCrates * upc + state.beforeBottles)
  entry.quantity_after = String(state.afterCrates * upc + state.afterBottles)
}

const inventoryBySupplier = computed(() => {
  const groups: Record<string, { beverage: BeverageItem; entry: InventoryEntry }[]> = {}
  for (const bev of beverages.value) {
    if (!bev.is_active) continue
    const group = bev.supplier_group || 'Sonstige'
    if (!groups[group]) groups[group] = []
    let entry = inventory.value.find(i => i.beverage_item === bev.id)
    if (!entry) {
      // Auto-fill quantity_before from current stock
      const stock = stockData.value[bev.id!]
      const stockQty = stock ? stock.quantity : 0
      entry = {
        accounting: accounting.value?.id || 0,
        beverage_item: bev.id!,
        quantity_before: String(stockQty),
        quantity_after: '0',
      }
      inventory.value.push(entry)
    }
    getOrInitCrateState(bev.id!, bev.units_per_crate || 1, entry)
    groups[group].push({ beverage: bev, entry })
  }
  return groups
})

function inventoryConsumption(entry: InventoryEntry): number {
  return parseFloat(entry.quantity_before || '0') - parseFloat(entry.quantity_after || '0')
}

function stockWarning(bevId: number, entry: InventoryEntry): string | null {
  const stock = stockData.value[bevId]
  if (!stock) return null
  const before = parseFloat(entry.quantity_before || '0')
  if (before > stock.quantity) {
    return `Bestand nur ${stock.quantity}, aber ${before} angegeben`
  }
  return null
}

function inventoryValue(entry: InventoryEntry, beverage: BeverageItem): number {
  const upc = beverage.units_per_crate || 1
  const consumedCrates = inventoryConsumption(entry) / upc
  const price = parseFloat(entry.snapshot_purchase_price || beverage.purchase_price || '0')
  const deposit = parseFloat(entry.snapshot_deposit || beverage.deposit || '0')
  return consumedCrates * (price + deposit)
}

function groupInventoryValue(items: { beverage: BeverageItem; entry: InventoryEntry }[]): number {
  return items.reduce((sum, { beverage, entry }) => sum + inventoryValue(entry, beverage), 0)
}

const totalInventoryValue = computed(() => {
  return Object.values(inventoryBySupplier.value).reduce(
    (sum, items) => sum + groupInventoryValue(items), 0
  )
})

function stockValue(entry: InventoryEntry, beverage: BeverageItem): number {
  const upc = beverage.units_per_crate || 1
  const afterCrates = parseFloat(entry.quantity_after || '0') / upc
  const price = parseFloat(entry.snapshot_purchase_price || beverage.purchase_price || '0')
  const deposit = parseFloat(entry.snapshot_deposit || beverage.deposit || '0')
  return afterCrates * (price + deposit)
}

const totalStockValue = computed(() => {
  return Object.values(inventoryBySupplier.value).reduce(
    (sum, items) => sum + items.reduce(
      (s, { beverage, entry }) => s + stockValue(entry, beverage), 0
    ), 0
  )
})

// ── Computed: Expenses ───────────────────────────────────────────

const totalExpenses = computed(() => {
  return expenses.value.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)
})

// Expenses paid from a cash register are already deducted from the cash count,
// so we need to add them back to get the true revenue.
function expensesFromSource(source: string): number {
  return expenses.value
    .filter(e => e.paid_from === source)
    .reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)
}

const expensesPaidFromRegister = computed(() => {
  return expensesFromSource('entrance_cash') + expensesFromSource('bar_cash')
})

const externalExpenses = computed(() => {
  return expenses.value
    .filter(e => e.paid_from === 'other')
    .reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)
})

function addExpense() {
  expenses.value.push({
    accounting: accounting.value?.id || 0,
    description: '',
    amount: '0.00',
    notes: '',
    paid_from: 'bar_cash',
    is_paid_out: false,
  })
}

function removeExpense(index: number) {
  expenses.value.splice(index, 1)
}

// ── Computed: Result ─────────────────────────────────────────────

const depositReturn = computed({
  get: () => accounting.value?.deposit_return || '0.00',
  set: (val) => {
    if (accounting.value) accounting.value.deposit_return = val
  },
})

// True revenue = cash counted + expenses paid from registers (which reduced the count)
const adjustedRevenue = computed(() => {
  return totalRevenue.value + expensesPaidFromRegister.value
})

const artistHospitality = computed(() => {
  return (event.value?.artists?.length ?? 0) * 20
})

const result = computed(() => {
  return adjustedRevenue.value - totalExpenses.value - totalInventoryValue.value + parseFloat(depositReturn.value || '0')
})

function addSplit() {
  splits.value.push({
    accounting: accounting.value?.id || 0,
    participant_name: '',
    share_percentage: '0',
  })
}

function removeSplit(index: number) {
  splits.value.splice(index, 1)
}

function splitAmount(split: AccountingSplit): number {
  const pct = parseFloat(split.share_percentage || '0')
  return result.value * (pct / 100)
}

const totalSplitPercentage = computed(() => {
  return splits.value.reduce((sum, s) => sum + parseFloat(s.share_percentage || '0'), 0)
})

const remainingAfterSplits = computed(() => {
  return result.value - splits.value.reduce((sum, s) => sum + splitAmount(s), 0)
})

// ── Grant computeds ──────────────────────────────────────────────

const grantRecordedExpenses = computed(() => {
  return expenses.value.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)
})

const grantCostOfGoods = computed(() => {
  return Math.max(0, totalInventoryValue.value - artistHospitality.value)
})

const grantTotalEligible = computed(() => {
  return grantRecordedExpenses.value + artistHospitality.value + grantCostOfGoods.value + rentFlatAmount.value
})

const grantAdmissionRevenue = computed(() => {
  const admissionNet = revenues.value
    .filter(r => r.source === 'entrance_cash' || r.source === 'entrance_paypal' || r.source === 'vvk_pretix')
    .reduce((sum, r) => sum + revenueNet(r), 0)
  // Add back expenses paid from entrance cash (these were admission revenue used for payouts)
  return admissionNet + expensesFromSource('entrance_cash')
})

const grantBarContribution = computed(() => {
  const barTotal = revenues.value
    .filter(r => r.source === 'bar_cash' || r.source === 'bar_paypal')
    .reduce((sum, r) => sum + revenueNet(r), 0)
  return barTotal * 0.2
})

const grantTotalOwnRevenue = computed(() => {
  return grantAdmissionRevenue.value + grantBarContribution.value
})

const grantEligibleAmount = computed(() => {
  return Math.max(0, grantTotalEligible.value - grantTotalOwnRevenue.value)
})

const grantAmount = computed(() => {
  const calculated = Math.min(1000, grantEligibleAmount.value)
  if (approvedAmount.value != null && approvedAmount.value > 0) {
    return Math.min(calculated, approvedAmount.value)
  }
  return calculated
})

// ── Kostenplan-based computeds (for Antrag) ──────────────────────

const budgetTotalKuenstler = computed(() => {
  return budgetKuenstler.value.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
})

const budgetTotalSachkosten = computed(() => {
  return budgetSachkosten.value.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
})

const budgetTotalSonstiges = computed(() => {
  return budgetSonstiges.value.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
})

const budgetTotalExpenses = computed(() => {
  return budgetTotalKuenstler.value + budgetTotalSachkosten.value + budgetTotalSonstiges.value + rentFlatAmount.value
})

const budgetTotalRevenues = computed(() => {
  return (parseFloat(budgetRevEintritt.value) || 0)
    + (parseFloat(budgetRevGetraenke.value) || 0)
    + (parseFloat(budgetRevEigenmittel.value) || 0)
    + (parseFloat(budgetRevDrittmittel.value) || 0)
    + (parseFloat(budgetRevSonstige.value) || 0)
})

const budgetEligibleAmount = computed(() => {
  return Math.max(0, budgetTotalExpenses.value - budgetTotalRevenues.value)
})

const budgetGrantAmount = computed(() => {
  return Math.min(1000, budgetEligibleAmount.value)
})

// ── Format helpers ───────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function formatTime(isoString: string): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ── Load & Save ──────────────────────────────────────────────────

async function loadData() {
  isLoading.value = true
  error.value = ''
  try {
    const [ev, bevData] = await Promise.all([
      eventService.getById(props.eventId),
      beverageService.getAll(),
    ])
    event.value = ev
    beverages.value = bevData.results

    // Fetch current stock for auto-fill and warnings
    try {
      const stockEntries = await stockService.getAll()
      const map: Record<number, StockEntry> = {}
      for (const s of stockEntries) map[s.id] = s
      stockData.value = map
    } catch { /* stock is optional */ }

    try {
      const acc = await accountingService.getByEvent(props.eventId)
      if (!acc) throw new Error('not found')
      accounting.value = acc

      // Nested data is included in the accounting response
      revenues.value = acc.revenues ?? []
      inventory.value = acc.inventory_entries ?? []
      expenses.value = acc.expenses ?? []
      splits.value = acc.splits ?? []
    } catch {
      // No accounting yet — create one
      accounting.value = await accountingService.create({
        event: props.eventId,
        status: 'draft',
        notes: '',
        deposit_return: '0.00',
      })
    }

    // Default splits: Thierry 33%, Carousel e.V. 67%
    if (splits.value.length === 0) {
      splits.value.push(
        {
          accounting: accounting.value?.id || 0,
          participant_name: 'Thierry',
          share_percentage: '33',
        },
        {
          accounting: accounting.value?.id || 0,
          participant_name: 'Carousel e.V.',
          share_percentage: '67',
        },
      )
    }

    // Load grant record (optional)
    try {
      const existing = await grantService.getByEvent(props.eventId)
      if (existing) {
        grantRecord.value = existing
        const rent = parseFloat(existing.annual_rent_costs || '0')
        rentFlatAmount.value = rent > 0 ? rent : 134.46
        const approved = parseFloat(existing.approved_amount || '0')
        approvedAmount.value = approved > 0 ? approved : null

        // Zuwendungsbescheid fields
        zuwendungsbescheidDate.value = existing.zuwendungsbescheid_date || ''
        const auszahlung = parseFloat(existing.auszahlung_amount || '0')
        auszahlungAmount.value = auszahlung > 0 ? auszahlung : null

        // Sachbericht + notes
        sachbericht.value = existing.sachbericht || ''
        grantNotes.value = existing.notes || ''

        // Budget plan
        const bp = existing.budget_plan || {}
        const bpExp = bp.expenses || {}
        const bpRev = bp.revenues || {}
        budgetKuenstler.value = (bpExp.kuenstlerhonorar || []).map((i: any) => ({ name: i.name || '', amount: String(i.amount || '0') }))
        budgetSachkosten.value = (bpExp.sachkosten || []).map((i: any) => ({ name: i.name || '', amount: String(i.amount || '0') }))
        budgetSonstiges.value = (bpExp.sonstiges || []).map((i: any) => ({ name: i.name || '', amount: String(i.amount || '0') }))
        budgetRevEintritt.value = String(bpRev.eintritt || '0')
        budgetRevGetraenke.value = String(bpRev.getraenke || '0')
        budgetRevEigenmittel.value = String(bpRev.eigenmittel || '0')
        budgetRevDrittmittel.value = String(bpRev.drittmittel || '0')
        budgetRevSonstige.value = String(bpRev.sonstige || '0')
      }
      const eventYear = ev.date ? new Date(ev.date).getFullYear() : new Date().getFullYear()
      grantSummary.value = await grantService.getSummary(eventYear)
    } catch { /* grant data is optional */ }
  } catch (e: any) {
    error.value = e.message || 'Daten konnten nicht geladen werden'
  } finally {
    isLoading.value = false
  }
}

async function finalizeAccounting() {
  if (!accounting.value?.id) return
  if (!confirm('Abrechnung wirklich abschließen? Danach kann sie nur noch im Lesemodus geöffnet werden.')) return
  try {
    await accountingService.update(accounting.value.id, { status: 'final' })
    accounting.value.status = 'final'
    saveSuccess.value = 'Abrechnung abgeschlossen!'
    setTimeout(() => { saveSuccess.value = '' }, 3000)
  } catch (e: any) {
    error.value = e.message || 'Fehler beim Speichern'
  }
}

async function reopenAccounting() {
  if (!accounting.value?.id) return
  try {
    await accountingService.update(accounting.value.id, { status: 'draft' })
    accounting.value.status = 'draft'
  } catch (e: any) {
    error.value = e.message || 'Fehler beim Speichern'
  }
}

async function saveAll() {
  if (!accounting.value?.id) return
  isSaving.value = true
  error.value = ''
  saveSuccess.value = ''

  try {
    const accId = accounting.value.id

    // Build all nested data and save in one PUT
    await accountingService.update(accId, {
      status: accounting.value.status,
      notes: accounting.value.notes,
      deposit_return: accounting.value.deposit_return,
      revenues: revenues.value
        .filter(rev => parseFloat(rev.total || '0') !== 0 || rev.id),
      inventory_entries: inventory.value
        .filter(inv => parseFloat(inv.quantity_before || '0') !== 0 || parseFloat(inv.quantity_after || '0') !== 0 || inv.id),
      expenses: expenses.value
        .filter(exp => exp.description)
        .map(exp => ({ ...exp, amount: exp.amount || '0' })),
      splits: splits.value
        .filter(split => split.participant_name || split.id),
    })

    saveSuccess.value = 'Gespeichert!'
    setTimeout(() => { saveSuccess.value = '' }, 3000)
  } catch (e: any) {
    error.value = e.message || 'Fehler beim Speichern'
  } finally {
    isSaving.value = false
  }
}

async function saveGrant() {
  grantSaving.value = true
  error.value = ''
  try {
    // Save accounting first so grant uses persisted data
    await saveAll()

    const budgetPlan = {
      expenses: {
        kuenstlerhonorar: budgetKuenstler.value.filter(i => i.name || parseFloat(i.amount) > 0).map(i => ({ name: i.name, amount: parseFloat(i.amount) || 0 })),
        sachkosten: budgetSachkosten.value.filter(i => i.name || parseFloat(i.amount) > 0).map(i => ({ name: i.name, amount: parseFloat(i.amount) || 0 })),
        sonstiges: budgetSonstiges.value.filter(i => i.name || parseFloat(i.amount) > 0).map(i => ({ name: i.name, amount: parseFloat(i.amount) || 0 })),
      },
      revenues: {
        zuwendung: budgetGrantAmount.value,
        eintritt: parseFloat(budgetRevEintritt.value) || 0,
        getraenke: parseFloat(budgetRevGetraenke.value) || 0,
        eigenmittel: parseFloat(budgetRevEigenmittel.value) || 0,
        drittmittel: parseFloat(budgetRevDrittmittel.value) || 0,
        sonstige: parseFloat(budgetRevSonstige.value) || 0,
      },
    }

    const data: Partial<GrantApplication> = {
      event: props.eventId,
      requested_amount: budgetGrantAmount.value.toFixed(2),
      eligible_expenses: grantTotalEligible.value.toFixed(2),
      own_revenue: grantTotalOwnRevenue.value.toFixed(2),
      annual_rent_costs: rentFlatAmount.value.toFixed(2),
      approved_amount: approvedAmount.value != null ? approvedAmount.value.toFixed(2) : null,
      zuwendungsbescheid_date: zuwendungsbescheidDate.value || null,
      auszahlung_amount: auszahlungAmount.value != null ? auszahlungAmount.value.toFixed(2) : null,
      actual_admission_revenue: grantAdmissionRevenue.value.toFixed(2),
      actual_beverage_revenue: grantBarContribution.value.toFixed(2),
      sachbericht: sachbericht.value,
      notes: grantNotes.value,
      budget_plan: budgetPlan,
    }
    if (grantRecord.value?.id) {
      grantRecord.value = await grantService.update(grantRecord.value.id, data)
    } else {
      grantRecord.value = await grantService.create(data)
    }
    saveSuccess.value = 'Gespeichert!'
    setTimeout(() => { saveSuccess.value = '' }, 3000)

    const eventYear = event.value?.date ? new Date(event.value.date).getFullYear() : new Date().getFullYear()
    grantSummary.value = await grantService.getSummary(eventYear)
  } catch (e: any) {
    error.value = e.message || 'Fehler beim Speichern'
  } finally {
    grantSaving.value = false
  }
}

async function downloadAntrag() {
  if (!grantRecord.value?.id) return
  grantDownloading.value = 'antrag'
  error.value = ''
  try {
    await grantService.downloadAntrag(grantRecord.value.id, event.value?.title || 'Event')
  } catch (e: any) {
    error.value = e.message || 'Download fehlgeschlagen'
  } finally {
    grantDownloading.value = null
  }
}

async function downloadVerwendungsnachweis() {
  grantDownloading.value = 'verwendungsnachweis'
  error.value = ''
  try {
    await saveGrant()
    await grantService.downloadVerwendungsnachweis(props.eventId)
  } catch (e: any) {
    error.value = e.message || 'Download fehlgeschlagen'
  } finally {
    grantDownloading.value = null
  }
}

function addBudgetItem(category: 'kuenstler' | 'sachkosten' | 'sonstiges') {
  const item = { name: '', amount: '0' }
  if (category === 'kuenstler') budgetKuenstler.value.push(item)
  else if (category === 'sachkosten') budgetSachkosten.value.push(item)
  else budgetSonstiges.value.push(item)
}

function removeBudgetItem(category: 'kuenstler' | 'sachkosten' | 'sonstiges', index: number) {
  if (category === 'kuenstler') budgetKuenstler.value.splice(index, 1)
  else if (category === 'sachkosten') budgetSachkosten.value.splice(index, 1)
  else budgetSonstiges.value.splice(index, 1)
}

// ── Document Methods ─────────────────────────────────────────────

async function loadDocuments() {
  isLoadingDocs.value = true
  try {
    documents.value = await documentService.list(props.eventId)
  } catch {
    // silently fail — documents are non-critical
  } finally {
    isLoadingDocs.value = false
  }
}

function triggerFileUpload() {
  fileInputRef.value?.click()
}

async function handleFileUpload(e: globalThis.Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  await uploadFiles(Array.from(input.files))
  input.value = ''
}

function handleDrop(e: DragEvent) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files?.length) {
    uploadFiles(Array.from(files))
  }
}

async function uploadFiles(files: File[]) {
  uploadError.value = ''
  for (const file of files) {
    uploadingFiles.value.push({ name: file.name })
    try {
      const doc = await documentService.upload(props.eventId, file)
      documents.value.unshift(doc)
    } catch (err: any) {
      uploadError.value = err.response?.data?.error || 'Upload fehlgeschlagen'
    } finally {
      uploadingFiles.value = uploadingFiles.value.filter(f => f.name !== file.name)
    }
  }
}

async function deleteDocument(doc: EventDocument) {
  if (!confirm(`"${doc.file_name}" wirklich löschen?`)) return
  try {
    await documentService.remove(props.eventId, doc.id)
    documents.value = documents.value.filter(d => d.id !== doc.id)
  } catch (err: any) {
    console.error('Delete failed:', err)
  }
}

onMounted(() => {
  loadData()
  loadDocuments()
})
</script>

<template lang="pug">
.accounting-view
  .loading(v-if="isLoading") Abrechnung wird geladen...
  template(v-else-if="accounting")
    .page-header
      .header-left
        router-link.btn-back(to="/admin/accounting") ← Zurück
        h2 {{ event?.title || props.eventId }}
      .header-right
        span.save-success(v-if="saveSuccess") {{ saveSuccess }}
        button.btn-save(@click="saveAll" :disabled="isSaving || accounting.status === 'final'")
          | {{ isSaving ? 'Speichern...' : 'Alles speichern' }}
        button.btn-finalize(v-if="accounting.status === 'draft'" @click="finalizeAccounting") Abschließen
        button.btn-reopen(v-if="accounting.status === 'final'" @click="reopenAccounting") Wieder öffnen

    .error(v-if="error") {{ error }}

    .tabs
      button.tab(
        :class="{ active: activeTab === 'cashcount' }"
        @click="activeTab = 'cashcount'"
      ) Kassenzählung
      button.tab(
        :class="{ active: activeTab === 'inventory' }"
        @click="activeTab = 'inventory'"
      ) Inventur
      button.tab(
        :class="{ active: activeTab === 'expenses' }"
        @click="activeTab = 'expenses'"
      ) Ausgaben
      button.tab(
        :class="{ active: activeTab === 'documents' }"
        @click="activeTab = 'documents'"
      ) Belege
      button.tab(
        :class="{ active: activeTab === 'result' }"
        @click="activeTab = 'result'"
      ) Ergebnis
      button.tab.tab-grant(
        :class="{ active: activeTab === 'grant' }"
        @click="activeTab = 'grant'"
      ) Förderung

    //- ── Cash Count Tab ──
    .tab-content(v-if="activeTab === 'cashcount'")
      .section(v-for="group in REVENUE_GROUPS" :key="group.label")
        .section-title-row
          h3.section-title {{ group.label }}
          .pretix-actions(v-if="group.sources.some(s => s.startsWith('vvk_'))")
            button.btn-pretix(
              @click="fetchPretixData"
              :disabled="pretixLoading"
            ) {{ pretixLoading ? 'Laden...' : 'VVK von Pretix laden' }}
            button.btn-pretix.btn-apply(
              v-if="pretixData"
              @click="applyPretixData"
            ) Übernehmen ({{ pretixData.total_tickets }} Tickets, {{ formatCurrency(pretixData.total_revenue) }})
            span.pretix-error(v-if="pretixError") {{ pretixError }}
            .pretix-warnings(v-if="pretixData?.warnings?.length")
              .pretix-warning(v-for="w in pretixData.warnings" :key="w") ⚠️ {{ w }}
          .pretix-actions(v-if="group.sources.includes('bar_paypal')")
            button.btn-pretix(
              @click="fetchPaypalBarData"
              :disabled="paypalBarLoading"
            ) {{ paypalBarLoading ? 'Laden...' : 'PayPal-Transaktionen laden' }}
            button.btn-pretix.btn-apply(
              v-if="paypalBarData"
              @click="applyPaypalBarData"
            ) Übernehmen
            template(v-if="paypalBarData")
              span.paypal-cat-summary 🍺 {{ paypalBarCategoryTotals.bar.count }} Bar ({{ formatCurrency(paypalBarCategoryTotals.bar.amount) }}) · 🚪 {{ paypalBarCategoryTotals.entrance.count }} Einlass ({{ formatCurrency(paypalBarCategoryTotals.entrance.amount) }})
            span.pretix-error(v-if="paypalBarError") {{ paypalBarError }}
        .revenue-table
          .revenue-header
            .col-source Quelle
            .col-amount Gesamt
            .col-amount Wechselgeld
            .col-amount Gebühren
            .col-amount Netto

          template(v-for="source in group.sources" :key="source")
            .revenue-row
              .col-source {{ REVENUE_SOURCE_LABELS[source] }}
              .col-amount
                .amount-wrap
                  input.amount-input(
                    v-model="getRevenue(source).total"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  )
              .col-amount
                .amount-wrap(v-if="source.endsWith('_cash')")
                  input.amount-input(
                    v-model="getRevenue(source).change_money"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  )
                span.no-field(v-else) —
              .col-amount
                .amount-wrap
                  input.amount-input(
                    v-model="getRevenue(source).fees"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  )
              .col-amount.col-computed {{ formatCurrency(revenueNet(getRevenue(source))) }}
            template(v-if="(source === 'entrance_cash' || source === 'bar_cash') && expensesFromSource(source) > 0")
              .revenue-row.sub-row.register-payout
                .col-source.sub-source └ Aus Kasse bezahlt
                .col-amount.sub-val
                .col-amount.sub-val
                .col-amount.sub-val
                .col-amount.sub-val.positive + {{ formatCurrency(expensesFromSource(source)) }}
              .revenue-row.sub-row.register-gross
                .col-source.sub-source = Einnahmen brutto
                .col-amount.sub-val
                .col-amount.sub-val
                .col-amount.sub-val
                .col-amount.sub-val
                  strong {{ formatCurrency(revenueNet(getRevenue(source)) + expensesFromSource(source)) }}
            template(v-if="source === 'vvk_pretix' && pretixData")
              .revenue-row.sub-row(v-for="(info, src) in pretixData.by_source" :key="src")
                .col-source.sub-source {{ src === 'vvk_stripe' ? '└ Stripe' : src === 'vvk_paypal' ? '└ PayPal' : '└ ' + src }}
                .col-amount.sub-val {{ formatCurrency(info.revenue) }}
                .col-amount.sub-val —
                .col-amount.sub-val {{ formatCurrency(info.fees) }}
                .col-amount.sub-val
              .revenue-row.sub-row
                .col-source.sub-source └ Pretix-Gebühr
                .col-amount.sub-val
                .col-amount.sub-val —
                .col-amount.sub-val {{ formatCurrency(pretixData.pretix_fee) }}
                .col-amount.sub-val
            template(v-if="source === 'bar_paypal' && paypalBarData")
              .revenue-row.sub-row.sub-toggle(@click="paypalBarExpanded = !paypalBarExpanded")
                .col-source.sub-source {{ paypalBarExpanded ? '▼' : '▶' }} {{ paypalBarTotals.count }} Transaktionen
                .col-amount.sub-val {{ formatCurrency(paypalBarTotals.amount) }}
                .col-amount.sub-val —
                .col-amount.sub-val {{ formatCurrency(paypalBarTotals.fees) }}
                .col-amount.sub-val {{ formatCurrency(paypalBarTotals.net) }}
              template(v-if="paypalBarExpanded")
                .revenue-row.sub-row.paypal-cat-actions
                  .col-source.sub-source
                    button.btn-cat-all(@click="setAllPaypalCategory('bar')") Alle → Bar
                    button.btn-cat-all(@click="setAllPaypalCategory('entrance')") Alle → Einlass
                    span.entry-price-hint(v-if="paypalBarData.entry_price") Eintritt: {{ paypalBarData.entry_price }}€{{ paypalBarData.entry_price_ak ? ' / AK ' + paypalBarData.entry_price_ak + '€' : '' }}
                .revenue-row.sub-row.sub-detail(
                  v-for="(txn, idx) in paypalBarData.transactions"
                  :key="idx"
                  :class="{ 'cat-entrance': txn.category === 'entrance', 'cat-bar': txn.category === 'bar' }"
                )
                  .col-source.sub-source.sub-detail-source
                    button.btn-cat-toggle(
                      @click.stop="togglePaypalCategory(idx)"
                      :title="txn.category === 'bar' ? 'Klick → Einlass' : 'Klick → Bar'"
                    ) {{ txn.category === 'bar' ? '🍺' : '🚪' }}
                    span └ {{ txn.name }} · {{ formatTime(txn.timestamp) }}
                  .col-amount.sub-val {{ formatCurrency(txn.amount) }}
                  .col-amount.sub-val —
                  .col-amount.sub-val {{ formatCurrency(txn.fee) }}
                  .col-amount.sub-val {{ formatCurrency(txn.net) }}
                  button.btn-remove-txn(@click.stop="removePaypalBarTransaction(idx)" title="Transaktion entfernen") ✕

        .group-total
          span Gesamt {{ group.label }}:
          strong {{ formatCurrency(groupRevenue(group.sources)) }}

      .grand-total
        span Gesamteinnahmen:
        strong {{ formatCurrency(totalRevenue) }}

    //- ── Inventory Tab ──
    .tab-content(v-if="activeTab === 'inventory'")
      .section(v-for="(items, group) in inventoryBySupplier" :key="group")
        h3.section-title {{ group }}
        .inventory-table
          .inventory-header
            .col-inv-name.sortable(@click="invSort.toggle('name')") Getränk{{ invSort.indicator('name') }}
            .col-inv-info Kiste
            .col-inv-pair.sortable(@click="invSort.toggle('before')") Vorher{{ invSort.indicator('before') }}
            .col-inv-pair.sortable(@click="invSort.toggle('after')") Nachher{{ invSort.indicator('after') }}
            .col-inv-num Gesamt
            .col-inv-num.sortable(@click="invSort.toggle('consumed')") Verbraucht{{ invSort.indicator('consumed') }}
            .col-inv-amount.sortable(@click="invSort.toggle('value')") Wert{{ invSort.indicator('value') }}

          .inventory-row(v-for="{ beverage, entry } in sortedInventory(items)" :key="beverage.id")
            .col-inv-name
              .bev-name {{ beverage.name }}
              .bev-info(v-if="(beverage.units_per_crate || 1) > 1") {{ beverage.units_per_crate }}St. · {{ formatCurrency(parseFloat(beverage.purchase_price || '0')) }} · Pf. {{ formatCurrency(parseFloat(beverage.deposit || '0')) }}
              .bev-info(v-else) Flasche · {{ formatCurrency(parseFloat(beverage.purchase_price || '0')) }}
              .stock-warning(v-if="stockWarning(beverage.id, entry)") ⚠ {{ stockWarning(beverage.id, entry) }}
            .col-inv-info(v-if="(beverage.units_per_crate || 1) > 1") {{ beverage.units_per_crate }}St.
            .col-inv-info(v-else) Fl.

            //- Crate mode (units_per_crate > 1)
            template(v-if="(beverage.units_per_crate || 1) > 1")
              .col-inv-pair
                .crate-input
                  input.qty-input(
                    v-model.number="getOrInitCrateState(beverage.id, beverage.units_per_crate || 1, entry).beforeCrates"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    @input="updateEntryFromCrates(entry, beverage)"
                  )
                  span.input-label K
                .crate-input
                  input.qty-input(
                    v-model.number="getOrInitCrateState(beverage.id, beverage.units_per_crate || 1, entry).beforeBottles"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    @input="updateEntryFromCrates(entry, beverage)"
                  )
                  span.input-label Fl
              .col-inv-pair
                .crate-input
                  input.qty-input(
                    v-model.number="getOrInitCrateState(beverage.id, beverage.units_per_crate || 1, entry).afterCrates"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    @input="updateEntryFromCrates(entry, beverage)"
                  )
                  span.input-label K
                .crate-input
                  input.qty-input(
                    v-model.number="getOrInitCrateState(beverage.id, beverage.units_per_crate || 1, entry).afterBottles"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    @input="updateEntryFromCrates(entry, beverage)"
                  )
                  span.input-label Fl

            //- Bottle mode (units_per_crate = 1)
            template(v-else)
              .col-inv-pair.bottle-mode
                input.qty-input(
                  v-model="entry.quantity_before"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                )
                span.input-label Fl.
              .col-inv-pair.bottle-mode
                input.qty-input(
                  v-model="entry.quantity_after"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                )
                span.input-label Fl.

            .col-inv-num {{ entry.quantity_before }}
            .col-inv-num {{ inventoryConsumption(entry) }}
            .col-inv-amount {{ formatCurrency(inventoryValue(entry, beverage)) }}

        .group-total
          span Zwischensumme {{ group }}:
          strong {{ formatCurrency(groupInventoryValue(items)) }}

      .grand-total
        div
          span Lagerwert (inkl. Pfand):
          strong {{ formatCurrency(totalStockValue) }}
        div.separator
        div
          span Wareneinsatz (inkl. Pfand):
          strong {{ formatCurrency(totalInventoryValue) }}

    //- ── Expenses Tab ──
    .tab-content(v-if="activeTab === 'expenses'")
      h3.section-title Ausgaben
      .expenses-table
        .expense-header
          span.sortable(@click="expSort.toggle('desc')") Beschreibung{{ expSort.indicator('desc') }}
          span.sortable(@click="expSort.toggle('amount')") Betrag{{ expSort.indicator('amount') }}
          span Bezahlt aus
          span Sphäre
          span

        .expense-row(v-for="(exp, index) in sortedExpenses" :key="index")
          input.text-input(
            v-model="exp.description"
            type="text"
            placeholder="z.B. Rewe, Hotel..."
          )
          .amount-wrap
            input.amount-input(
              v-model="exp.amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
            )
          select.select-input(v-model="exp.paid_from")
            option(v-for="(label, source) in EXPENSE_PAID_FROM_LABELS" :key="source" :value="source")
              | {{ label }}
          select.select-input(v-model="exp.tax_sphere" :class="{ 'missing': !exp.tax_sphere }")
            option(:value="null" disabled hidden) Sphäre wählen
            option(v-for="(label, key) in TAX_SPHERE_LABELS" :key="key" :value="key")
              | {{ label }}
          button.btn-remove(@click="removeExpense(index)") ×

      button.btn-add(@click="addExpense") + Ausgabe hinzufügen

      .grand-total
        span Gesamtausgaben:
        strong {{ formatCurrency(totalExpenses) }}

      .footnote
        p
          strong Sphären-Zuordnung (Pflichtfeld)
        ul
          li
            strong Zweckbetrieb
            |  — Ausgaben für den Vereinszweck (z.B. Künstlergagen, GEMA, Technik)
          li
            strong Wirtschaftlich
            |  — Ausgaben für wirtschaftlichen Geschäftsbetrieb (z.B. Getränkeeinkauf, Bar-Zubehör)
          li
            strong Vermögensverwaltung
            |  — langfristige Vermietung/Verpachtung (z.B. Proberaum)
          li
            strong Ideell
            |  — allgemeine Vereinsarbeit ohne wirtschaftlichen Bezug

    //- ── Result Tab ──
    .tab-content(v-if="activeTab === 'result'")

      //- Revenue breakdown
      h3.section-title Einnahmen
      .result-detail
        template(v-for="rev in revenues" :key="rev.source")
          .detail-row(v-if="revenueNet(rev) !== 0")
            span {{ REVENUE_SOURCE_LABELS[rev.source] }}
            span.amount {{ formatCurrency(revenueNet(rev)) }}
        .detail-row(v-if="expensesPaidFromRegister > 0")
          span + Auszahlungen aus Kassen
          span.amount {{ formatCurrency(expensesPaidFromRegister) }}
        .detail-row.detail-total
          span Tatsächliche Einnahmen
          strong.positive {{ formatCurrency(adjustedRevenue) }}

      //- Cost of goods breakdown
      h3.section-title Wareneinsatz
      .result-detail
        template(v-for="(items, group) in inventoryBySupplier" :key="group")
          .detail-row(v-if="groupInventoryValue(items) !== 0")
            span {{ group }}
            span.amount -{{ formatCurrency(groupInventoryValue(items)) }}
        .detail-row.detail-total
          span Wareneinsatz gesamt
          strong.negative {{ formatCurrency(totalInventoryValue) }}

      //- Expenses breakdown
      h3.section-title Ausgaben
      .result-detail
        template(v-for="exp in expenses" :key="exp.description")
          .detail-row(v-if="parseFloat(exp.amount || '0') !== 0")
            span {{ exp.description || '(keine Beschreibung)' }}
            span.amount {{ formatCurrency(parseFloat(exp.amount || '0')) }}
        .detail-row.detail-total
          span Ausgaben gesamt
          strong.negative {{ formatCurrency(totalExpenses) }}

      //- Final result
      .result-summary
        .result-row
          span Einnahmen (gezählt)
          strong {{ formatCurrency(totalRevenue) }}
        .result-row(v-if="expensesPaidFromRegister > 0")
          span + Aus Kassen bezahlt
          strong {{ formatCurrency(expensesPaidFromRegister) }}
        .result-row
          span = Tatsächliche Einnahmen
          strong.positive {{ formatCurrency(adjustedRevenue) }}
        .result-row
          span − Wareneinsatz
          strong.negative {{ formatCurrency(totalInventoryValue) }}
        .result-row
          span − Ausgaben
          strong.negative {{ formatCurrency(totalExpenses) }}
        .result-row
          span Pfandrückgabe
          .input-inline
            input.amount-input(
              v-model="depositReturn"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
            )
            span.unit €
        .result-row.result-total
          span Ergebnis
          strong(:class="result >= 0 ? 'positive' : 'negative'")
            | {{ formatCurrency(result) }}

      h3.section-title Gewinnverteilung
      .splits-table
        .split-row(v-for="(split, index) in splits" :key="index")
          .col-name
            input.text-input(
              v-model="split.participant_name"
              type="text"
              placeholder="Name"
            )
          .col-pct
            input.amount-input(
              v-model="split.share_percentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0"
            )
            span.unit %
          .col-amount {{ formatCurrency(splitAmount(split)) }}
          .col-action
            button.btn-remove(@click="removeSplit(index)") ×

      button.btn-add(@click="addSplit") + Anteil hinzufügen

      .splits-summary(v-if="splits.length")
        .result-row
          span Verteilt ({{ totalSplitPercentage.toFixed(1) }}%)
          strong {{ formatCurrency(result - remainingAfterSplits) }}
        .result-row.result-total
          span Verbleibend
          strong(:class="remainingAfterSplits >= 0 ? 'positive' : 'negative'")
            | {{ formatCurrency(remainingAfterSplits) }}

      .notes-section
        h3.section-title Notizen
        textarea.notes-input(
          v-model="accounting.notes"
          placeholder="Notizen zu dieser Abrechnung..."
          rows="4"
        )

    //- ── Grant Tab ──
    .tab-content(v-if="activeTab === 'grant'")
      .grant-tab

        .event-info
          .info-row
            span.label Veranstaltung
            span.value {{ event?.title }}
          .info-row
            span.label Datum
            span.value {{ event?.date ? new Date(event.date).toLocaleDateString('de-DE') : '–' }}
          .info-row
            span.label Künstler
            span.value {{ event?.artists?.map(a => a.name).join(', ') || '–' }}

        //- ── Sub-Tab Navigation ──
        .grant-sub-tabs
          button.grant-sub-tab(
            :class="{ active: grantSubTab === 'antrag' }"
            @click="grantSubTab = 'antrag'"
          ) Antrag
          button.grant-sub-tab(
            :class="{ active: grantSubTab === 'nachweis' }"
            @click="grantSubTab = 'nachweis'"
          ) Verwendungsnachweis

        //- ════════════════════════════════════════════════════════
        //- ── Sub-Tab: Antrag ──
        //- ════════════════════════════════════════════════════════
        template(v-if="grantSubTab === 'antrag'")

          //- ── Budget Plan (Kostenplan) ──
          h3.section-title Kostenplan

          .grant-detail
            .detail-row.detail-cat-header
              span Künstlerhonorare / Anfahrt / Übernachtung
              button.btn-add-sm(@click="addBudgetItem('kuenstler')") +
            .detail-row.input-row(v-for="(item, idx) in budgetKuenstler" :key="'k' + idx")
              input.text-input(v-model="item.name" type="text" placeholder="z.B. Band XY Gage")
              .input-group
                input.amount-input(v-model="item.amount" type="number" step="0.01" min="0" placeholder="0.00")
                span.unit €
                button.btn-remove-sm(@click="removeBudgetItem('kuenstler', idx)") ×

            .detail-row.detail-cat-header
              span Projektspezifische Sachkosten (Werbung, Marketing)
              button.btn-add-sm(@click="addBudgetItem('sachkosten')") +
            .detail-row.input-row(v-for="(item, idx) in budgetSachkosten" :key="'s' + idx")
              input.text-input(v-model="item.name" type="text" placeholder="z.B. Band XY Gage")
              .input-group
                input.amount-input(v-model="item.amount" type="number" step="0.01" min="0" placeholder="0.00")
                span.unit €
                button.btn-remove-sm(@click="removeBudgetItem('sachkosten', idx)") ×

            .detail-row.detail-cat-header
              span Sonstiges (GEMA, KSK, etc.)
              button.btn-add-sm(@click="addBudgetItem('sonstiges')") +
            .detail-row.input-row(v-for="(item, idx) in budgetSonstiges" :key="'o' + idx")
              input.text-input(v-model="item.name" type="text" placeholder="z.B. Band XY Gage")
              .input-group
                input.amount-input(v-model="item.amount" type="number" step="0.01" min="0" placeholder="0.00")
                span.unit €
                button.btn-remove-sm(@click="removeBudgetItem('sonstiges', idx)") ×

            .detail-row.detail-cat-header
              span Personal- und Mietkosten
            .detail-row.input-row
              span Mietkosten (0,5% Jahresmiete)
              .input-group
                input.amount-input(
                  v-model.number="rentFlatAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="134.46"
                )
                span.unit €

            .detail-row.detail-total
              span Geplante Ausgaben gesamt
              strong {{ formatCurrency(budgetTotalExpenses) }}

          //- ── Expected Revenues ──
          h3.section-title Erwartete Einnahmen (für Antrag)
          .grant-detail
            .detail-row.input-row
              span Eintrittseinnahmen
              .input-group
                input.amount-input(v-model="budgetRevEintritt" type="number" step="0.01" min="0" placeholder="0")
                span.unit €
            .detail-row.input-row
              span 20% Getränkeeinnahmen
              .input-group
                input.amount-input(v-model="budgetRevGetraenke" type="number" step="0.01" min="0" placeholder="0")
                span.unit €
            .detail-row.input-row
              span Eigenmittel
              .input-group
                input.amount-input(v-model="budgetRevEigenmittel" type="number" step="0.01" min="0" placeholder="0")
                span.unit €
            .detail-row.input-row
              span Drittmittel
              .input-group
                input.amount-input(v-model="budgetRevDrittmittel" type="number" step="0.01" min="0" placeholder="0")
                span.unit €
            .detail-row.input-row
              span Sonstige Einnahmen
              .input-group
                input.amount-input(v-model="budgetRevSonstige" type="number" step="0.01" min="0" placeholder="0")
                span.unit €
            .detail-row.detail-total
              span Geplante Einnahmen gesamt
              strong {{ formatCurrency(budgetTotalRevenues) }}

          //- ── Calculation (from Kostenplan) ──
          h3.section-title Berechnung Förderbetrag
          .grant-summary
            .result-row
              span Geplante Ausgaben gesamt
              strong {{ formatCurrency(budgetTotalExpenses) }}
            .result-row
              span − Eigenanteil
              strong.negative {{ formatCurrency(budgetTotalRevenues) }}
            .result-row
              span Förderfähiger Betrag
              strong {{ formatCurrency(budgetEligibleAmount) }}
            .result-row.result-total
              span Beantragter Zuschuss
              strong {{ formatCurrency(budgetGrantAmount) }}
            .max-note Max. 1.000 € pro Veranstaltung / 3.000 € pro Jahr (6.000 € bei >24 Veranstaltungen/Jahr)

          //- ── Save & Download Antrag ──
          .grant-actions
            button.btn-save(@click="saveGrant" :disabled="grantSaving")
              | {{ grantSaving ? 'Speichern...' : 'Förderung speichern' }}
            button.btn-pdf(@click="downloadAntrag" :disabled="grantDownloading !== null || !grantRecord?.id")
              | {{ grantDownloading === 'antrag' ? 'Lade...' : 'Antrag PDF' }}

        //- ════════════════════════════════════════════════════════
        //- ── Sub-Tab: Verwendungsnachweis ──
        //- ════════════════════════════════════════════════════════
        template(v-if="grantSubTab === 'nachweis'")

          //- ── Bewilligungsbescheid ──
          h3.section-title Bewilligungsbescheid
          .grant-detail
            .detail-row.input-row
              span Bewilligter Höchstbetrag
              .input-group
                input.amount-input(
                  v-model.number="approvedAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="–"
                )
                span.unit €
            .detail-row.detail-total(v-if="approvedAmount != null && approvedAmount > 0")
              span Förderbetrag (nach Bescheid)
              strong {{ formatCurrency(grantAmount) }}
            .detail-row.input-row
              span Bescheiddatum
              .input-group
                input.date-input(v-model="zuwendungsbescheidDate" type="date")
            .detail-row.input-row
              span Ausgezahlter Betrag
              .input-group
                input.amount-input(
                  v-model.number="auszahlungAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="–"
                )
                span.unit €

          //- ── Actual Eligible Expenses ──
          h3.section-title Zuwendungsfähige Ausgaben
          .expenses-table.grant-expenses
            .expense-header
              .col-desc Beschreibung
              .col-amount Betrag
              .col-grant-cat Förder-Kat.
            template(v-for="(exp, index) in expenses" :key="index")
              .expense-row(v-if="parseFloat(exp.amount || '0') !== 0")
                .col-desc {{ exp.description || '–' }}
                .col-amount {{ formatCurrency(parseFloat(exp.amount || '0')) }}
                .col-grant-cat
                  select.select-input(v-model="exp.grant_category")
                    option(:value="null") –
                    option(value="kuenstlerhonorar") Künstler
                    option(value="sachkosten") Sachkosten
                    option(value="sonstiges") Sonstiges
            .expense-row(v-if="artistHospitality > 0")
              .col-desc Bewirtung Bands ({{ event?.artists?.length ?? 0 }} × 20 €)
              .col-amount {{ formatCurrency(artistHospitality) }}
              .col-grant-cat
            .expense-row(v-if="grantCostOfGoods > 0")
              .col-desc Wareneinsatz
              .col-amount {{ formatCurrency(grantCostOfGoods) }}
              .col-grant-cat
            .expense-row
              .col-desc Mietkosten (0,5% Jahresmiete)
              .col-amount {{ formatCurrency(rentFlatAmount) }}
              .col-grant-cat
            .expense-row.expense-total
              .col-desc Zuwendungsfähige Ausgaben gesamt
              .col-amount
                strong {{ formatCurrency(grantTotalEligible) }}
              .col-grant-cat

          //- ── Actual Own Revenue ──
          h3.section-title Eigenanteil (Einnahmen)
          .grant-detail
            .detail-row
              span Eintrittseinnahmen
              span.amount {{ formatCurrency(grantAdmissionRevenue) }}
            .detail-row
              span 20% Getränkeeinnahmen (Abendöffnung)
              span.amount {{ formatCurrency(grantBarContribution) }}
            .detail-row.detail-total
              span Eigenanteil gesamt
              strong {{ formatCurrency(grantTotalOwnRevenue) }}

          //- ── Actual Calculation ──
          h3.section-title Abrechnung Förderbetrag
          .grant-summary
            .result-row
              span Zuwendungsfähige Ausgaben gesamt
              strong {{ formatCurrency(grantTotalEligible) }}
            .result-row
              span − Eigenanteil
              strong.negative {{ formatCurrency(grantTotalOwnRevenue) }}
            .result-row
              span Förderfähiger Betrag
              strong {{ formatCurrency(grantEligibleAmount) }}
            .result-row.result-total
              span Beantragter Zuschuss
              strong {{ formatCurrency(grantAmount) }}

          //- ── Sachbericht (for Verwendungsnachweis) ──
          h3.section-title Sachbericht
          textarea.notes-input(
            v-model="sachbericht"
            placeholder="Kurze Beschreibung der Veranstaltung, Programm, Besucherzahl..."
            rows="6"
          )

          //- ── Notizen ──
          h3.section-title Notizen
          textarea.notes-input(
            v-model="grantNotes"
            placeholder="Interne Notizen zur Förderung..."
            rows="3"
          )

          //- ── Save & Download Verwendungsnachweis ──
          .grant-actions
            button.btn-save(@click="saveGrant" :disabled="grantSaving")
              | {{ grantSaving ? 'Speichern...' : 'Förderung speichern' }}
            button.btn-pdf(@click="downloadVerwendungsnachweis" :disabled="grantDownloading !== null || !grantRecord?.id")
              | {{ grantDownloading === 'verwendungsnachweis' ? 'Lade...' : 'Verwendungsnachweis PDF' }}

        //- ── Summary (visible in both sub-tabs) ──
        .summary-section(v-if="grantSummary")
          h3.section-title Förder-Übersicht ({{ event?.date ? new Date(event.date).getFullYear() : '' }})
          .grant-detail
            .detail-row
              span Beantragte Summe
              span.amount {{ formatCurrency(grantSummary.total_requested) }}
            .detail-row
              span Anzahl Förderanträge
              span.amount {{ grantSummary.grant_count }}

    //- ── Documents Tab ──
    .tab-content(v-if="activeTab === 'documents'")
      .documents-tab
        .section-header
          h3.section-title Belege
          .header-actions
            button.btn-upload(@click="triggerFileUpload") + Beleg hochladen
            router-link.btn-secondary(:to="`/admin/events/${eventId}/documents`") Alle Dokumente →

        input.file-input(
          ref="fileInputRef"
          type="file"
          multiple
          @change="handleFileUpload"
          style="display: none"
        )

        .drop-zone(
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="handleDrop"
          :class="{ 'drag-over': dragOver }"
        )
          p(v-if="!dragOver") Belege (Bons, Quittungen) hierher ziehen
          p(v-else) Loslassen zum Hochladen…

        .upload-progress(v-if="uploadingFiles.length")
          .upload-item(v-for="f in uploadingFiles" :key="f.name")
            span {{ f.name }}
            span.status ⏳ wird hochgeladen…

        .upload-error(v-if="uploadError")
          p ⚠️ {{ uploadError }}

        .documents-list(v-if="documents.length")
          table.documents-table
            thead
              tr
                th Datei
                th Hochgeladen
                th Von
                th
            tbody
              tr(v-for="doc in documents" :key="doc.id")
                td
                  a.doc-link(v-if="doc.drive_url" :href="doc.drive_url" target="_blank") {{ doc.file_name }}
                  span(v-else) {{ doc.file_name }}
                td {{ new Date(doc.uploaded_at).toLocaleString('de-DE') }}
                td {{ doc.uploaded_by_name }}
                td
                  button.btn-delete(@click="deleteDocument(doc)") ✕

        .empty-state(v-else-if="!isLoadingDocs")
          p Noch keine Belege hochgeladen.

        .loading(v-if="isLoadingDocs") Belege werden geladen…
</template>

<style scoped>
.accounting-view {
  background: white;
  padding: 2rem;
  border: 0.5rem solid black;
}

.loading {
  padding: 3rem;
  text-align: center;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-back {
  padding: 0.5rem 1rem;
  border: 0.25rem solid black;
  text-decoration: none;
  color: black;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-back:hover {
  background: black;
  color: white;
}

h2 {
  font-size: 1.75rem;
  color: black;
  margin: 0;
  font-weight: 900;
}

.save-success {
  color: black;
  font-weight: 900;
  padding: 0.5rem 1rem;
  border: 0.25rem solid black;
}

.btn-save {
  padding: 0.75rem 1.5rem;
  background: black;
  color: white;
  border: 0.25rem solid black;
  cursor: pointer;
  font-weight: 900;
  font-size: 1rem;
  letter-spacing: 0.1em;
  transition: filter 0.2s;
}

.btn-save:hover {
  filter: brightness(120%);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-grant {
  border-left: 0.15rem solid black;
  margin-left: auto;
}

.btn-finalize {
  padding: 0.5rem 1rem;
  border: 0.25rem solid black;
  background: black;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-finalize:hover {
  background: white;
  color: black;
}

.btn-reopen {
  padding: 0.5rem 1rem;
  border: 0.25rem solid black;
  background: white;
  color: black;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-reopen:hover {
  background: black;
  color: white;
}

.error {
  padding: 1rem;
  border: 0.25rem solid black;
  margin-bottom: 1rem;
  font-weight: 600;
}

/* ── Tabs ── */

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 0;
  border-bottom: 0.25rem solid black;
}

.tab {
  padding: 0.75rem 1.5rem;
  background: white;
  color: black;
  border: 0.25rem solid black;
  border-bottom: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.2s;
  margin-bottom: -0.25rem;
}

.tab:hover {
  background: #f5f5f5;
}

.tab.active {
  background: black;
  color: white;
}

.tab-content {
  padding: 1.5rem 0;
}

/* ── Section ── */

.section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 900;
  padding: 0.5rem 1rem;
  background: black;
  color: white;
  margin-bottom: 0;
}

.section-title-row {
  display: flex;
  align-items: stretch;
}

.section-title-row .section-title {
  flex: 1;
}

.pretix-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: black;
  padding: 0 1rem 0 0;
}

.btn-pretix {
  background: white;
  color: black;
  border: 2px solid white;
  padding: 0.25rem 0.75rem;
  font-weight: 700;
  font-size: 0.75rem;
  cursor: pointer;
}

.btn-pretix:hover {
  background: #e0e0e0;
}

.btn-pretix:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-apply {
  background: #00c853;
  color: white;
  border-color: #00c853;
}

.btn-apply:hover {
  background: #00a844;
}

.pretix-error {
  color: #ff5252;
  font-size: 0.75rem;
  font-weight: 600;
}

.pretix-warnings {
  margin-top: 0.25rem;
}
.pretix-warning {
  color: #f57c00;
  font-size: 0.75rem;
  font-weight: 600;
}

/* ── Revenue Table ── */

.revenue-table {
  border: 0.25rem solid black;
  border-top: none;
}

.revenue-header, .revenue-row {
  display: grid;
  grid-template-columns: 180px minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 120px;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  align-items: center;
}

.revenue-header {
  font-weight: 900;
  font-size: 0.8rem;
  border-bottom: 0.25rem solid black;
}

.revenue-row {
  border-bottom: 1px solid #ddd;
}

.revenue-row:nth-child(even) {
  background: #f5f5f5;
}

.revenue-row:last-child {
  border-bottom: none;
}

.revenue-row.sub-row {
  background: #f5f5f5;
  font-size: 0.75rem;
  color: #666;
  padding: 0.25rem 1rem;
  border-bottom: 1px dashed #ccc;
}

.revenue-row.sub-toggle {
  cursor: pointer;
  font-weight: 600;
  color: #333;
}
.revenue-row.sub-toggle:hover {
  background: #eaeaea;
}

.revenue-row.sub-detail {
  font-size: 0.7rem;
  color: #888;
  padding: 0.15rem 1rem;
  position: relative;
}

.sub-detail-source {
  padding-left: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.sub-detail-source span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}

.btn-remove-txn {
  position: absolute;
  right: 0.3rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: 1px solid #ccc;
  color: #999;
  font-size: 0.65rem;
  line-height: 1;
  padding: 0.1rem 0.3rem;
  cursor: pointer;
}
.btn-remove-txn:hover {
  background: black;
  color: white;
  border-color: black;
}

.btn-cat-toggle {
  background: none;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0 0.25rem;
  line-height: 1.4;
  flex-shrink: 0;
}
.btn-cat-toggle:hover {
  background: #f0f0f0;
}

.cat-entrance {
  background: rgba(76, 175, 80, 0.06);
}
.cat-bar {
  background: rgba(255, 152, 0, 0.06);
}

.btn-cat-all {
  background: none;
  border: 1px solid #ccc;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  margin-right: 0.3rem;
  color: #555;
}
.btn-cat-all:hover {
  background: #eee;
}

.entry-price-hint {
  font-size: 0.65rem;
  color: #888;
  margin-left: 0.3rem;
}

.paypal-cat-summary {
  font-size: 0.75rem;
  color: #555;
  margin-left: 0.5rem;
}

.paypal-cat-actions {
  border-bottom: 1px solid #eee;
}

.sub-source {
  padding-left: 1rem;
}

.sub-val {
  font-variant-numeric: tabular-nums;
}

/* ── Inventory Table ── */

.inventory-table {
  border: 0.25rem solid black;
  border-top: none;
}

.inventory-header, .inventory-row {
  display: grid;
  grid-template-columns: 1fr 50px 160px 160px 60px 60px 90px;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  align-items: center;
}

.col-inv-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.bev-info {
  font-size: 0.75rem;
  font-weight: 400;
  color: #555;
}

.stock-warning {
  font-size: 0.7rem;
  color: #c55;
  font-weight: 500;
}

.col-inv-info {
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
}

.col-inv-pair {
  display: flex;
  gap: 0.25rem;
}

.crate-input {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex: 1;
}

.crate-input .qty-input {
  width: 100%;
  min-width: 0;
}

.input-label {
  font-size: 0.7rem;
  font-weight: 900;
  color: black;
  min-width: 1rem;
}

.bottle-mode {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.bottle-mode .qty-input {
  flex: 1;
  min-width: 0;
}

.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.sortable:hover {
  text-decoration: underline;
}

.col-inv-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.85rem;
}

.col-inv-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.inventory-header {
  font-weight: 900;
  font-size: 0.8rem;
  border-bottom: 0.25rem solid black;
}

.inventory-row {
  border-bottom: 1px solid #ddd;
}

.inventory-row:nth-child(even) {
  background: #f5f5f5;
}

.inventory-row:last-child {
  border-bottom: none;
}

/* ── Expenses Table ── */

.expenses-table {
  border: 0.25rem solid black;
  border-top: none;
  margin-bottom: 1rem;
}

.expense-row input,
.expense-row select {
  height: 2rem;
  line-height: 1.2;
  box-sizing: border-box;
  min-width: 0;
}

.expense-header, .expense-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto 36px;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  align-items: center;
}

.expense-row > div {
  min-width: 0;
  overflow: hidden;
}

.grant-expenses .expense-header,
.grant-expenses .expense-row {
  grid-template-columns: 1fr 120px 140px;
}

.grant-expenses {
  margin-bottom: 0;
  border-top: 0.25rem solid black;
}

.grant-expenses .col-desc {
  text-align: left;
}

.grant-expenses .col-amount {
  text-align: right;
}

.expense-row.expense-total {
  border-top: 0.25rem solid black;
  font-weight: 700;
  background: #f5f5f5;
}

.expense-header {
  font-weight: 900;
  font-size: 0.8rem;
  border-bottom: 0.25rem solid black;
}

.expense-row {
  border-bottom: 1px solid #ddd;
}

.expense-row:nth-child(even) {
  background: #f5f5f5;
}

.expense-row:last-child {
  border-bottom: none;
}

/* ── Splits Table ── */

.splits-table {
  border: 0.25rem solid black;
  margin-bottom: 1rem;
}

.split-row {
  display: grid;
  grid-template-columns: 1fr 120px 120px 40px;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  align-items: center;
  border-bottom: 1px solid #ddd;
}

.split-row:nth-child(even) {
  background: #f5f5f5;
}

.split-row:last-child {
  border-bottom: none;
}

/* ── Inputs ── */

.col-source {
  font-weight: 600;
  font-size: 0.9rem;
}

.col-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.col-price, .col-qty, .col-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.col-computed {
  font-weight: 600;
}

.no-field {
  color: #999;
  text-align: center;
  display: block;
}

.col-desc, .col-from, .col-action, .col-pct, .col-sphere {
  font-size: 0.9rem;
}

.col-sphere .select-input {
  font-size: 0.9rem;
  padding: 0.375rem 0.5rem;
}

.col-pct {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.amount-input, .qty-input {
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 0.15rem solid black;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
  -moz-appearance: textfield;
}

.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.amount-wrap {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 2rem;
}

.amount-wrap input {
  padding-right: 1.5rem;
  height: 100%;
}

.amount-wrap::after {
  content: '€';
  position: absolute;
  right: 0.4rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.9rem;
  font-weight: 600;
  pointer-events: none;
  color: #666;
}

.text-input {
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 0.15rem solid black;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  box-sizing: border-box;
}

.select-input {
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 0.15rem solid black;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  background: white;
  box-sizing: border-box;
}

.amount-input:focus, .qty-input:focus, .text-input:focus, .select-input:focus {
  outline: none;
  background: black;
  color: white;
}

.notes-input {
  width: 100%;
  padding: 0.75rem;
  border: 0.25rem solid black;
  font-size: 0.95rem;
  font-family: inherit;
  resize: vertical;
}

.notes-input:focus {
  outline: none;
  background: black;
  color: white;
}

.input-inline {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.input-inline .amount-input {
  width: 120px;
}

.unit {
  font-weight: 900;
  font-size: 0.9rem;
}

/* ── Buttons ── */

.btn-add {
  padding: 0.625rem 1rem;
  background: white;
  color: black;
  border: 0.25rem solid black;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-add:hover {
  background: black;
  color: white;
}

.btn-remove {
  padding: 0.25rem 0.5rem;
  background: black;
  color: white;
  border: 0.15rem solid black;
  cursor: pointer;
  font-weight: 900;
  font-size: 1rem;
  line-height: 1;
}

.btn-remove:hover {
  filter: brightness(120%);
}

/* ── Totals ── */

.group-total {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #f5f5f5;
  color: black;
  font-weight: 700;
  font-size: 0.95rem;
}

.grand-total {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: #f5f5f5;
  color: black;
  font-weight: 700;
  font-size: 1.1rem;
  border: 0.25rem solid black;
  margin-top: 1.5rem;
}

.grand-total > div, .grand-total > span {
  display: flex;
  justify-content: space-between;
}

.footnote {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: #666;
  line-height: 1.4;
}

.footnote p {
  margin: 0.25rem 0;
}

.footnote ul {
  margin: 0.25rem 0;
  padding-left: 1.2rem;
}

.footnote li {
  margin: 0.1rem 0;
}

.select-input.missing {
  border-color: #c00;
  color: #999;
}

.grand-total .separator {
  border-top: 1px solid rgba(0,0,0,0.2);
  margin: 0.25rem 0;
}

/* ── Result ── */

.result-detail {
  border: 0.25rem solid black;
  margin-bottom: 1.5rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #ddd;
  font-size: 0.9rem;
}

.detail-row:nth-child(even):not(.detail-total) {
  background: #f5f5f5;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row .amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.detail-total {
  background: #f5f5f5;
  color: black;
  font-weight: 700;
  font-size: 0.95rem;
  border-bottom: none;
}

.result-summary {
  border: 0.25rem solid black;
  margin-bottom: 2rem;
  margin-top: 1.5rem;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid black;
  font-size: 1rem;
}

.result-row:last-child {
  border-bottom: none;
}

.result-total {
  background: black;
  color: white;
  font-size: 1.2rem;
  border-bottom: none;
}

.positive {
  font-weight: 900;
}

.negative {
  font-weight: 900;
}

.splits-summary {
  border: 0.25rem solid black;
  margin-top: 1.5rem;
}

.notes-section {
  margin-top: 2rem;
}

/* ── Responsive ── */

@media (max-width: 900px) {
  .revenue-header, .inventory-header {
    display: none;
  }

  .revenue-row, .inventory-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
  }

  .expense-header {
    display: none;
  }

  .expense-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }

  .tabs {
    flex-wrap: wrap;
  }

  .col-price, .col-qty, .col-amount {
    text-align: left;
  }
}

/* ── Grant Tab ── */
.grant-tab {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.grant-sub-tabs {
  display: flex;
  gap: 0;
  border: 0.25rem solid black;
}

.grant-sub-tab {
  flex: 1;
  padding: 0.6rem 1rem;
  background: white;
  color: black;
  border: none;
  border-right: 0.25rem solid black;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  transition: all 0.15s;
}

.grant-sub-tab:last-child {
  border-right: none;
}

.grant-sub-tab.active {
  background: black;
  color: white;
}

.grant-sub-tab:not(.active):hover {
  background: #f0f0f0;
}

.event-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 0.25rem solid black;
}

.info-row {
  display: flex;
  gap: 1rem;
}

.info-row .label {
  font-weight: 700;
  min-width: 120px;
}

.grant-detail {
  display: flex;
  flex-direction: column;
  border: 0.25rem solid black;
}

.grant-detail .detail-row .amount {
  text-align: right;
  min-width: 100px;
}

.grant-tab .detail-row.detail-total {
  background: #f5f5f5;
  color: black;
  font-weight: 700;
}

.detail-row.detail-cat-header {
  background: #f5f5f5;
  font-weight: 700;
  font-size: 0.9rem;
}

.detail-row.input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
}

.detail-row.input-row .text-input {
  flex: 1;
  min-width: 0;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}



.input-group .unit {
  font-size: 0.85rem;
  color: #666;
}

.input-group .computed {
  font-size: 0.85rem;
  color: #333;
  min-width: 120px;
  text-align: right;
}

.grant-summary {
  border: 0.25rem solid black;
  display: flex;
  flex-direction: column;
}

.result-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #ccc;
}

.result-row:last-child {
  border-bottom: none;
}

.result-row.result-total {
  background: black;
  color: white;
  font-weight: 700;
  font-size: 1.1rem;
}

.result-row .negative {
  color: #c00;
}

.result-row.result-total .negative {
  color: #faa;
}

.max-note {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
}

.grant-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-pdf {
  padding: 0.75rem 1.5rem;
  background: white;
  color: black;
  border: 0.25rem solid black;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-pdf:hover {
  background: black;
  color: white;
}

.btn-pdf:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.budget-section {
  border: 0.25rem solid black;
  margin-bottom: 1.5rem;
}

.budget-category {
  border-bottom: 1px solid #ddd;
}

.budget-category:last-child {
  border-bottom: none;
}

.budget-cat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  font-weight: 700;
  font-size: 0.9rem;
}

.budget-cat-total {
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  background: black;
  color: white;
  font-weight: 700;
  font-size: 0.95rem;
}

.budget-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.375rem 1rem;
  align-items: center;
  border-bottom: 1px solid #eee;
}

.budget-row .text-input {
  flex: 1;
}

.budget-row .amount-input {
  width: 100px;
}

.btn-add-sm {
  padding: 0.15rem 0.5rem;
  background: black;
  color: white;
  border: 0.15rem solid black;
  cursor: pointer;
  font-weight: 900;
  font-size: 0.85rem;
  line-height: 1;
}

.btn-add-sm:hover {
  filter: brightness(120%);
}

.btn-remove-sm {
  padding: 0.15rem 0.4rem;
  background: black;
  color: white;
  border: 0.15rem solid black;
  cursor: pointer;
  font-weight: 900;
  font-size: 0.85rem;
  line-height: 1;
}

.btn-remove-sm:hover {
  filter: brightness(120%);
}

.date-input {
  padding: 0.25rem 0.5rem;
  border: 0.15rem solid black;
  font-family: inherit;
  font-size: inherit;
  font-weight: 600;
}

.date-input:focus {
  outline: none;
  background: black;
  color: white;
}

.summary-section {
  margin-top: 1rem;
}

/* ── Documents Tab ─────────────────────────────── */
.documents-tab .section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.documents-tab .header-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-upload {
  background: var(--color-accent, #4f46e5);
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
}
.btn-secondary {
  background: transparent;
  border: 1px solid #666;
  color: inherit;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
}
.drop-zone {
  border: 2px dashed #444;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  margin-bottom: 1rem;
  transition: border-color 0.2s, background 0.2s;
}
.drop-zone.drag-over {
  border-color: var(--color-accent, #4f46e5);
  background: rgba(79, 70, 229, 0.05);
}
.upload-progress {
  margin-bottom: 1rem;
}
.upload-error {
  background: #fff3cd;
  border: 1px solid #856404;
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: #856404;
}
.upload-item {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0;
  font-size: 0.85rem;
  opacity: 0.7;
}
.documents-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.documents-table th,
.documents-table td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid #333;
}
.doc-link {
  color: var(--color-accent, #4f46e5);
  text-decoration: none;
}
.doc-link:hover {
  text-decoration: underline;
}
.btn-delete {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 1rem;
}
.empty-state {
  text-align: center;
  padding: 2rem;
  opacity: 0.6;
}
</style>
