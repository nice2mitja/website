<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { taxExportService, type TaxSummaryResponse } from '@/services/accounting'

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const summary = ref<TaxSummaryResponse | null>(null)
const isLoading = ref(false)
const error = ref('')

const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

async function loadSummary() {
  isLoading.value = true
  error.value = ''
  try {
    summary.value = await taxExportService.getSummary(selectedYear.value)
  } catch (e: any) {
    error.value = e.message || 'Daten konnten nicht geladen werden'
  } finally {
    isLoading.value = false
  }
}

async function downloadExcel() {
  try {
    await taxExportService.downloadExcel(selectedYear.value)
  } catch (e: any) {
    alert('Export fehlgeschlagen: ' + e.message)
  }
}

async function downloadCsv() {
  try {
    await taxExportService.downloadCsv(selectedYear.value)
  } catch (e: any) {
    alert('Export fehlgeschlagen: ' + e.message)
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

onMounted(() => {
  loadSummary()
})
</script>

<template lang="pug">
.tax-export-view
  .header
    h2 EÜR / Steuer-Export
    .header-actions
      select.year-select(v-model="selectedYear" @change="loadSummary")
        option(v-for="y in years" :key="y" :value="y") {{ y }}
      button.btn-primary(@click="downloadExcel")
        | 📊 Excel
      button.btn-secondary(@click="downloadCsv")
        | 📄 CSV

  .loading(v-if="isLoading") Laden...
  .error(v-else-if="error") {{ error }}

  template(v-else-if="summary")
    .summary-section
      h3 Übersicht {{ selectedYear }}
      .sphere-cards
        .sphere-card(
          v-for="(data, key) in summary.spheres"
          :key="key"
          v-show="data.income || data.expense"
          :class="'sphere-' + key"
        )
          .sphere-label {{ data.label }}
          .sphere-row
            span.label Einnahmen
            span.value.income {{ formatCurrency(data.income) }}
          .sphere-row
            span.label Ausgaben
            span.value.expense {{ formatCurrency(data.expense) }}
          .sphere-row.result
            span.label Ergebnis
            span.value(:class="data.result >= 0 ? 'positive' : 'negative'")
              | {{ formatCurrency(data.result) }}

    .vat-section
      h3 Umsatzsteuer
      .vat-table
        .vat-row
          span.label USt 7% (Eintritt)
          span.value {{ formatCurrency(summary.vat.ust_7) }}
        .vat-row
          span.label USt 19% (Bar)
          span.value {{ formatCurrency(summary.vat.ust_19) }}
        .vat-row.subtotal
          span.label USt gesamt
          span.value {{ formatCurrency(summary.vat.ust_total) }}
        .vat-row
          span.label Vorsteuer
          span.value -{{ formatCurrency(summary.vat.vorsteuer) }}
        .vat-row.total
          span.label Zahllast
          span.value {{ formatCurrency(summary.vat.zahllast) }}

  .empty(v-else) Keine Daten für {{ selectedYear }}
</template>

<style scoped>
.tax-export-view {
  background: white;
  padding: 2rem;
  border: 0.5rem solid black;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

h2 {
  font-size: 1.75rem;
  color: black;
  margin: 0;
  font-weight: 900;
}

h3 {
  font-size: 1.25rem;
  margin: 0 0 1rem;
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.year-select {
  padding: 0.5rem 1rem;
  border: 0.25rem solid black;
  font-size: 1rem;
  font-weight: 700;
}

.btn-primary, .btn-secondary {
  padding: 0.625rem 1.25rem;
  border: 0.25rem solid black;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-primary {
  background: black;
  color: white;
}

.btn-secondary {
  background: white;
  color: black;
}

.btn-primary:hover { opacity: 0.85; }
.btn-secondary:hover { background: #f0f0f0; }

.summary-section, .vat-section {
  margin-bottom: 2rem;
}

.sphere-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.sphere-card {
  border: 0.2rem solid black;
  padding: 1.25rem;
}

.sphere-label {
  font-weight: 800;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.sphere-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  font-size: 0.95rem;
}

.sphere-row.result {
  border-top: 2px solid black;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  font-weight: 700;
}

.value.income { color: #16a34a; }
.value.expense { color: #dc2626; }
.value.positive { color: #16a34a; }
.value.negative { color: #dc2626; }

.vat-table {
  max-width: 400px;
  border: 0.2rem solid black;
  padding: 1rem 1.25rem;
}

.vat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0;
}

.vat-row.subtotal {
  border-top: 1px solid #ccc;
  padding-top: 0.6rem;
  margin-top: 0.25rem;
}

.vat-row.total {
  border-top: 2px solid black;
  padding-top: 0.6rem;
  margin-top: 0.25rem;
  font-weight: 800;
  font-size: 1.05rem;
}

.loading, .error, .empty {
  padding: 2rem;
  text-align: center;
  color: #666;
}
.error { color: #dc2626; }
</style>
