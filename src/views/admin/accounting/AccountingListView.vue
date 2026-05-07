<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { eventService, accountingService } from '@/services'
import type { Event } from '@/services'
import type { EventAccounting } from '@/types/accounting'
import type { PaginatedResponse } from '@/types/api'


const eventsData = ref<PaginatedResponse<Event> | null>(null)
const accountings = ref<EventAccounting[]>([])
const isLoading = ref(false)
const error = ref('')
const searchQuery = ref('')

const events = computed(() => eventsData.value?.results || [])

const eventsWithAccounting = computed(() => {
  return events.value.map(event => {
    const accounting = accountings.value.find(a => a.event === event.id)
    return { ...event, accounting }
  })
})

const filteredEvents = computed(() => {
  if (!searchQuery.value) return eventsWithAccounting.value
  const query = searchQuery.value.toLowerCase()
  return eventsWithAccounting.value.filter(e =>
    e.title.toLowerCase().includes(query) ||
    e.id.toLowerCase().includes(query)
  )
})

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function statusLabel(status?: string): string {
  if (!status) return 'Nicht erstellt'
  return status === 'final' ? 'Abgeschlossen' : 'Entwurf'
}

function statusClass(status?: string): string {
  if (!status) return 'status-none'
  return status === 'final' ? 'status-final' : 'status-draft'
}

async function createAccounting(eventId: string) {
  try {
    const accounting = await accountingService.create({
      event: eventId,
      status: 'draft',
      notes: '',
      deposit_return: '0.00',
    })
    accountings.value.push(accounting)
  } catch (e: any) {
    alert('Fehler beim Erstellen: ' + e.message)
  }
}

async function loadData() {
  isLoading.value = true
  error.value = ''
  try {
    const [evData, accData] = await Promise.all([
      eventService.getAll(),
      accountingService.getAll(),
    ])
    eventsData.value = evData
    accountings.value = accData.results
  } catch (e: any) {
    error.value = e.message || 'Daten konnten nicht geladen werden'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template lang="pug">
.accounting-list-view
  .header
    h2 Abrechnung
    .header-actions
      router-link.btn-export(:to="{ name: 'admin-tax-export' }") EÜR Export
      input.search-input(
        v-model="searchQuery"
        type="text"
        placeholder="Veranstaltung suchen..."
      )

  .loading(v-if="isLoading") Laden...
  .error(v-else-if="error") {{ error }}

  .events-container(v-else-if="filteredEvents.length")
    .event-card(v-for="event in filteredEvents" :key="event.id")
      .event-header
        .event-date {{ formatDate(event.date) }}
        span.status-badge(:class="statusClass(event.accounting?.status)")
          | {{ statusLabel(event.accounting?.status) }}

      h3.event-title {{ event.title }}

      .event-footer
        .event-meta
          span.artists(v-if="event.artists.length")
            | {{ event.artists.map(a => a.name).join(', ') }}

        .event-actions
          router-link.btn-edit(
            v-if="event.accounting"
            :to="`/admin/accounting/${event.id}`"
          ) Abrechnung öffnen
          button.btn-primary(
            v-else
            @click="createAccounting(event.id)"
          ) Abrechnung starten

  .empty(v-else) Keine Veranstaltungen gefunden
</template>

<style scoped>
.accounting-list-view {
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

.header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-input {
  padding: 0.625rem 1rem;
  border: 0.25rem solid black;
  font-size: 0.95rem;
  min-width: 250px;
  font-weight: 600;
}

.btn-export {
  padding: 0.625rem 1.25rem;
  border: 0.25rem solid black;
  background: black;
  color: white;
  font-weight: 700;
  text-decoration: none;
  font-size: 0.9rem;
}

.btn-export:hover {
  opacity: 0.85;
}

.search-input:focus {
  outline: none;
  background: black;
  color: white;
}

.loading, .error, .empty {
  padding: 3rem;
  text-align: center;
  color: black;
}

.error {
  background: white;
  border: 0.5rem solid black;
}

.events-container {
  display: grid;
  gap: 1.5rem;
}

.event-card {
  padding: 1.5rem;
  border: 0.25rem solid black;
  transition: all 0.2s;
}

.event-card:hover {
  transform: rotate(-0.3deg);
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.event-date {
  font-size: 0.875rem;
  color: black;
  font-weight: 600;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.status-none {
  background: white;
  color: black;
  border: 0.15rem solid black;
}

.status-draft {
  background: black;
  color: white;
}

.status-final {
  background: black;
  color: white;
  text-decoration: underline;
}

.event-title {
  font-size: 1.25rem;
  margin-bottom: 0.75rem;
  color: black;
  font-weight: 900;
}

.event-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 0.25rem solid black;
}

.artists {
  font-size: 0.875rem;
  color: black;
}

.event-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-edit {
  padding: 0.625rem 1rem;
  border: 0.25rem solid black;
  background: white;
  color: black;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.btn-edit:hover {
  background: black;
  color: white;
}

.btn-primary {
  padding: 0.625rem 1rem;
  background: black;
  color: white;
  border: 0.25rem solid black;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.1em;
  transition: filter 0.2s;
}

.btn-primary:hover {
  filter: brightness(120%);
}
</style>
