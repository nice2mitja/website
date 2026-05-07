<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { purchaseService, beverageService } from '@/services'
import type { Purchase, PurchaseItem, BeverageItem } from '@/types/accounting'

const props = defineProps<{
  id?: string
}>()

const router = useRouter()
const isEditing = !!props.id

const form = ref<Partial<Purchase>>({
  date: new Date().toISOString().slice(0, 10),
  supplier: '',
  invoice_number: '',
  invoice_total: '0.00',
  notes: '',
  items: [],
})

const beverages = ref<BeverageItem[]>([])
const isLoading = ref(false)
const error = ref('')

const activeBeverages = computed(() => beverages.value.filter(b => b.is_active))

function beverageLabel(bev: BeverageItem): string {
  const upc = bev.units_per_crate
  return upc > 1 ? `${bev.name} (${upc}er Kiste)` : bev.name
}

// Inline new-beverage creation
const showNewBeverage = ref(false)
const newBevIdx = ref(-1) // which item row triggered it
const newBev = ref({ name: '', units_per_crate: 6, purchase_price: '0.00' })

function openNewBeverage(idx: number) {
  newBevIdx.value = idx
  newBev.value = { name: '', units_per_crate: 6, purchase_price: '0.00' }
  showNewBeverage.value = true
}

async function saveNewBeverage() {
  if (!newBev.value.name.trim()) return
  try {
    const created = await beverageService.create({
      name: newBev.value.name.trim(),
      units_per_crate: newBev.value.units_per_crate,
      purchase_price: newBev.value.purchase_price,
      is_active: true,
      deposit: '0.00',
      sort_order: 0,
      supplier_group: '',
    })
    beverages.value.push(created)
    // Assign to the row that triggered it
    const idx = newBevIdx.value
    if (idx >= 0 && form.value.items && form.value.items[idx]) {
      form.value.items[idx].beverage_item = created.id!
      form.value.items[idx].unit_price = created.purchase_price ?? '0.00'
      recalcItem(form.value.items[idx], idx)
    }
    showNewBeverage.value = false
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Getränk konnte nicht angelegt werden'
  }
}

const isScanning = ref(false)
const scanError = ref('')

async function scanReceipt(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  isScanning.value = true
  scanError.value = ''
  error.value = ''

  try {
    const result = await purchaseService.scanReceipt(file)
    // Clear existing items
    form.value.items = []
    itemCrates.value = []
    itemLoose.value = []

    for (const scanned of (result.items ?? [])) {
      const matchedBev = scanned.drink_id
        ? beverages.value.find(b => b.id === scanned.drink_id)
        : null
      const bev = matchedBev || activeBeverages.value[0]
      const upc = bev?.units_per_crate || 1
      const crates = scanned.quantity_crates || 0
      const unitPrice = scanned.unit_price?.toString() || bev?.purchase_price || '0.00'
      const totalPrice = (parseFloat(unitPrice) * crates).toFixed(2)

      form.value.items!.push({
        beverage_item: bev?.id ?? 0,
        quantity: crates * upc,
        unit_price: unitPrice,
        total_price: totalPrice,
      })
      itemCrates.value.push(crates)
      itemLoose.value.push(0)
    }
  } catch (e: any) {
    scanError.value = e.response?.data?.error || e.message || 'Scan fehlgeschlagen'
  } finally {
    isScanning.value = false
    input.value = ''  // Reset file input
  }
}

function formatCurrency(val: number): string {
  return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

const computedTotal = computed(() => {
  const total = (form.value.items ?? [])
    .reduce((sum, item) => sum + parseFloat(item.total_price || '0'), 0)
  return formatCurrency(total)
})

// Per-row crate/loose state (not sent to API, only for UI)
const itemCrates = ref<number[]>([])
const itemLoose = ref<number[]>([])

function addItem() {
  const items = form.value.items ?? []
  const bev = activeBeverages.value[0]
  items.push({
    beverage_item: bev?.id ?? 0,
    quantity: 0,
    unit_price: bev?.purchase_price ?? '0.00',
    total_price: '0.00',
  })
  form.value.items = items
  itemCrates.value.push(0)
  itemLoose.value.push(0)
}

function removeItem(idx: number) {
  form.value.items = (form.value.items ?? []).filter((_, i) => i !== idx)
  itemCrates.value.splice(idx, 1)
  itemLoose.value.splice(idx, 1)
}

function onBeverageChange(item: PurchaseItem, idx: number) {
  const bev = beverages.value.find(b => b.id === item.beverage_item)
  if (bev) {
    item.unit_price = bev.purchase_price ?? '0.00'
  }
  recalcItem(item, idx)
}

function recalcItem(item: PurchaseItem, idx: number) {
  const bev = beverages.value.find(b => b.id === item.beverage_item)
  const upc = bev?.units_per_crate || 1
  const crates = itemCrates.value[idx] || 0
  const loose = itemLoose.value[idx] || 0
  item.quantity = crates * upc + loose
  item.total_price = (
    parseFloat(item.unit_price || '0') * crates
  ).toFixed(2)
}

function beverageName(id: number): string {
  return beverages.value.find(b => b.id === id)?.name ?? `#${id}`
}

function formatItemTotal(item: PurchaseItem): string {
  return formatCurrency(parseFloat(item.total_price || '0'))
}

async function loadData() {
  isLoading.value = true
  try {
    const bevData = await beverageService.getAll()
    beverages.value = bevData.results

    if (props.id) {
      const purchase = await purchaseService.getById(Number(props.id))
      form.value = { ...purchase }
      // Reconstruct crates/loose from stored quantity
      itemCrates.value = []
      itemLoose.value = []
      for (const item of (purchase.items ?? [])) {
        const bev = beverages.value.find(b => b.id === item.beverage_item)
        const upc = bev?.units_per_crate || 1
        itemCrates.value.push(Math.floor(item.quantity / upc))
        itemLoose.value.push(item.quantity % upc)
      }
    }
  } catch (e: any) {
    error.value = e.message || 'Daten konnten nicht geladen werden'
  } finally {
    isLoading.value = false
  }
}

async function handleSubmit() {
  if (!form.value.date) {
    error.value = 'Bitte ein Datum eingeben'
    return
  }
  isLoading.value = true
  error.value = ''

  try {
    if (isEditing) {
      await purchaseService.update(Number(props.id), form.value)
    } else {
      await purchaseService.create(form.value)
    }
    router.push('/admin/purchases')
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Fehler beim Speichern'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template lang="pug">
.purchase-form-view
  .form-header
    h2 {{ isEditing ? 'Einkauf bearbeiten' : '+ Neuer Einkauf' }}
    router-link.btn-cancel(to="/admin/purchases") ← Zurück

  .error-msg(v-if="error") {{ error }}

  form.purchase-form(@submit.prevent="handleSubmit")
    .form-row
      .form-group
        label(for="date") Datum
        input#date(v-model="form.date" type="date" required)
      .form-group
        label(for="supplier") Lieferant
        input#supplier(v-model="form.supplier" type="text" placeholder="z.B. Getränkestation")
      .form-group
        label(for="invoice_number") Rechnungsnr.
        input#invoice_number(v-model="form.invoice_number" type="text")

    .form-row
      .form-group
        label(for="invoice_total") Rechnungsbetrag (€)
        input#invoice_total(v-model="form.invoice_total" type="number" step="0.01" min="0")
      .form-group
        label(for="net_amount") Netto (€)
        input#net_amount(v-model="form.net_amount" type="number" step="0.01" min="0" placeholder="optional")
      .form-group
        label(for="vat_amount") USt-Betrag (€)
        input#vat_amount(v-model="form.vat_amount" type="number" step="0.01" min="0" placeholder="optional")

    .form-row
      .form-group
        label Berechnete Summe
        .computed-total {{ computedTotal }}
      .form-group
        label(for="notes") Notizen
        textarea#notes(v-model="form.notes" rows="2")

    h3.section-title Positionen
    .scan-area
      label.btn-scan(:class="{ scanning: isScanning }")
        input(type="file" accept="image/*" capture="environment" @change="scanReceipt" hidden)
        | {{ isScanning ? '⏳ Wird analysiert...' : '📷 Bon scannen' }}
      span.scan-hint Foto vom Bon → KI füllt die Positionen aus
    .error-msg(v-if="scanError") {{ scanError }}
    .items-header
      span.col-bev Getränk
      span.col-crates Kisten
      span.col-loose Einzelfl.
      span.col-qty Einheiten
      span.col-price Preis / Kiste (€)
      span.col-total Gesamt (€)
      span.col-action &nbsp;

    .item-row(v-for="(item, idx) in form.items" :key="idx")
      select.col-bev(v-model.number="item.beverage_item" @change="item.beverage_item === -1 ? openNewBeverage(idx) : onBeverageChange(item, idx)")
        option(v-for="bev in activeBeverages" :key="bev.id" :value="bev.id")
          | {{ beverageLabel(bev) }}
        option(:value="-1") + Neues Getränk…
      input.col-crates(
        v-model.number="itemCrates[idx]"
        type="number"
        min="0"
        @input="recalcItem(item, idx)"
      )
      input.col-loose(
        v-model.number="itemLoose[idx]"
        type="number"
        min="0"
        @input="recalcItem(item, idx)"
      )
      span.col-qty {{ item.quantity }}
      input.col-price(
        v-model="item.unit_price"
        type="number"
        step="0.01"
        min="0"
        @input="recalcItem(item, idx)"
      )
      span.col-total {{ formatItemTotal(item) }}
      button.col-action.btn-remove(type="button" @click="removeItem(idx)") ×

    button.btn-add(type="button" @click="addItem") + Position hinzufügen

    .new-bev-overlay(v-if="showNewBeverage")
      .new-bev-dialog
        h3 Neues Getränk anlegen
        .form-row
          .form-group
            label Name
            input(v-model="newBev.name" type="text" placeholder="z.B. Sekt" autofocus)
          .form-group
            label Flaschen / Kiste
            input(v-model.number="newBev.units_per_crate" type="number" min="1")
          .form-group
            label EK-Preis / Kiste (€)
            input(v-model="newBev.purchase_price" type="number" step="0.01" min="0")
        .dialog-actions
          button.btn-save(type="button" @click="saveNewBeverage") Anlegen
          button.btn-cancel-dialog(type="button" @click="showNewBeverage = false") Abbrechen

    .form-actions
      button.btn-save(type="submit" :disabled="isLoading")
        | {{ isLoading ? 'Speichern...' : 'Speichern' }}
</template>

<style scoped>
.purchase-form-view {
  background: white;
  padding: 2rem;
  border: 0.5rem solid black;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

h2 {
  font-size: 1.75rem;
  color: black;
  margin: 0;
  font-weight: 900;
}

.btn-cancel {
  padding: 0.625rem 1rem;
  border: 0.25rem solid black;
  background: white;
  color: black;
  text-decoration: none;
  font-weight: 600;
}

.error-msg {
  padding: 1rem;
  border: 0.25rem solid black;
  background: black;
  color: white;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: 900;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.375rem;
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: 0.625rem;
  border: 0.25rem solid black;
  font-size: 0.95rem;
  font-weight: 600;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  background: black;
  color: white;
}

.computed-total {
  padding: 0.625rem;
  border: 0.25rem solid black;
  font-weight: 900;
  font-size: 0.95rem;
  background: #f5f5f5;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 900;
  margin: 2rem 0 1rem;
  border-bottom: 0.25rem solid black;
  padding-bottom: 0.5rem;
}

.scan-area {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.btn-scan {
  display: inline-block;
  padding: 0.625rem 1.25rem;
  background: black;
  color: white;
  font-weight: 700;
  font-size: 0.9rem;
  border: 0.25rem solid black;
  cursor: pointer;
  transition: filter 0.2s;
}

.btn-scan:hover {
  filter: brightness(130%);
}

.btn-scan.scanning {
  opacity: 0.6;
  cursor: wait;
}

.scan-hint {
  font-size: 0.8rem;
  color: #666;
}

.items-header,
.item-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 40px;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.items-header span {
  font-weight: 900;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.item-row select,
.item-row input {
  padding: 0.5rem;
  border: 0.25rem solid black;
  font-size: 0.875rem;
  font-weight: 600;
}

.item-row select:focus,
.item-row input:focus {
  outline: none;
  background: black;
  color: white;
}

.item-row .col-total {
  font-weight: 900;
  text-align: right;
}

.btn-remove {
  background: black;
  color: white;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  font-weight: 900;
  padding: 0.25rem;
}

.btn-add {
  margin-top: 0.75rem;
  padding: 0.5rem 1rem;
  border: 0.25rem solid black;
  background: white;
  color: black;
  font-weight: 900;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-add:hover {
  background: black;
  color: white;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 0.25rem solid black;
}

.btn-save {
  padding: 0.75rem 2rem;
  background: black;
  color: white;
  border: none;
  font-weight: 900;
  font-size: 1rem;
  cursor: pointer;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.new-bev-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.new-bev-dialog {
  background: white;
  border: 0.5rem solid black;
  padding: 2rem;
  width: min(90vw, 500px);
  box-sizing: border-box;
}

.new-bev-dialog .form-row {
  grid-template-columns: 1fr;
}

.new-bev-dialog h3 {
  margin: 0 0 1.5rem;
  font-weight: 900;
  font-size: 1.25rem;
}

.new-bev-dialog input {
  padding: 0.625rem;
  border: 0.25rem solid black;
  font-size: 0.95rem;
  font-weight: 600;
  width: 100%;
  box-sizing: border-box;
}

.new-bev-dialog input:focus {
  outline: none;
  background: black;
  color: white;
}

.dialog-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.btn-cancel-dialog {
  padding: 0.75rem 2rem;
  background: white;
  color: black;
  border: 0.25rem solid black;
  font-weight: 900;
  font-size: 1rem;
  cursor: pointer;
}

.btn-cancel-dialog:hover {
  background: black;
  color: white;
}
</style>
