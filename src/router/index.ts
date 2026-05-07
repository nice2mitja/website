import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/event/:id',
      name: 'event',
      props: true,
      component: () => import('../views/Event.vue')
    },
    {
      path: '/past-events/',
      name: 'pastEvents',
      props: true,
      component: () => import('../views/PastEvents.vue')
    },
    {
      path: '/anfragen/',
      name: 'requests',
      props: true,
      component: () => import('../views/Anfragen.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue')
    },

    // Authentication routes
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/auth/LoginView.vue'),
      meta: { requiresGuest: true }
    },

    // Admin routes
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresWebsiteGroup: false },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('../views/admin/DashboardView.vue')
        },
        {
          path: 'events',
          name: 'admin-events',
          component: () => import('../views/admin/events/EventListView.vue')
        },
        {
          path: 'events/create',
          name: 'admin-event-create',
          component: () => import('../views/admin/events/EventFormView.vue')
        },
        {
          path: 'events/:id',
          name: 'admin-event-edit',
          component: () => import('../views/admin/events/EventFormView.vue'),
          props: true
        },
        {
          path: 'artists',
          name: 'admin-artists',
          component: () => import('../views/admin/artists/ArtistListView.vue')
        },
        {
          path: 'artists/create',
          name: 'admin-artist-create',
          component: () => import('../views/admin/artists/ArtistFormView.vue')
        },
        {
          path: 'artists/:id',
          name: 'admin-artist-edit',
          component: () => import('../views/admin/artists/ArtistFormView.vue'),
          props: true
        },
        {
          path: 'sync',
          name: 'admin-sync',
          component: () => import('../views/admin/EventSyncView.vue')
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('../views/admin/settings/SettingsView.vue')
        },
        {
          path: 'checklist-templates',
          name: 'admin-checklist-templates',
          component: () => import('../views/admin/checklist-templates/ChecklistTemplateListView.vue')
        },
        {
          path: 'checklist-templates/create',
          name: 'admin-checklist-template-create',
          component: () => import('../views/admin/checklist-templates/ChecklistTemplateFormView.vue')
        },
        {
          path: 'checklist-templates/:id',
          name: 'admin-checklist-template-edit',
          component: () => import('../views/admin/checklist-templates/ChecklistTemplateFormView.vue'),
          props: true
        },
        // Accounting routes
        {
          path: 'beverages',
          name: 'admin-beverages',
          component: () => import('../views/admin/accounting/BeverageListView.vue')
        },
        {
          path: 'beverages/create',
          name: 'admin-beverage-create',
          component: () => import('../views/admin/accounting/BeverageFormView.vue')
        },
        {
          path: 'beverages/:id',
          name: 'admin-beverage-edit',
          component: () => import('../views/admin/accounting/BeverageFormView.vue'),
          props: true
        },
        {
          path: 'accounting',
          name: 'admin-accounting',
          component: () => import('../views/admin/accounting/AccountingListView.vue')
        },
        {
          path: 'accounting/tax-export',
          name: 'admin-tax-export',
          component: () => import('../views/admin/accounting/TaxExportView.vue')
        },
        {
          path: 'accounting/:eventId',
          name: 'admin-accounting-detail',
          component: () => import('../views/admin/accounting/AccountingView.vue'),
          props: true
        },
        // Purchase routes
        {
          path: 'purchases',
          name: 'admin-purchases',
          component: () => import('../views/admin/accounting/PurchaseListView.vue')
        },
        {
          path: 'purchases/create',
          name: 'admin-purchase-create',
          component: () => import('../views/admin/accounting/PurchaseFormView.vue')
        },
        {
          path: 'purchases/:id',
          name: 'admin-purchase-edit',
          component: () => import('../views/admin/accounting/PurchaseFormView.vue'),
          props: true
        },

      ]
    }
  ]
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Initialize auth store on first navigation
  if (!authStore.user && authStore.accessToken) {
    await authStore.initialize()
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest)
  const requiresWebsiteGroup = to.matched.some(record => record.meta.requiresWebsiteGroup)

  if (requiresAuth && !authStore.isAuthenticated) {
    // Redirect to login if not authenticated
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else if (requiresWebsiteGroup && !authStore.hasWebsiteGroup) {
    // Redirect to home if user doesn't have website group
    next({ name: 'home' })
  } else if (requiresGuest && authStore.isAuthenticated) {
    // Redirect to admin if already authenticated
    next({ name: 'admin-dashboard' })
  } else {
    next()
  }
})

export default router
