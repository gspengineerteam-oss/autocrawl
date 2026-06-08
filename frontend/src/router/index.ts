import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginPage.vue'),
      meta: { bare: true, public: true },
    },
    {
      path: '/',
      name: 'atlas',
      component: () => import('@/views/AtlasPage.vue'),
    },
    {
      path: '/cari',
      name: 'cari',
      component: () => import('@/views/VendorSearchPage.vue'),
    },
    {
      path: '/vendors',
      name: 'vendors',
      component: () => import('@/views/VendorsListPage.vue'),
    },
    {
      path: '/vendors/:domain',
      name: 'vendor-detail',
      component: () => import('@/views/VendorDetailPage.vue'),
      props: true,
    },
    {
      path: '/expos',
      name: 'expos',
      component: () => import('@/views/ExposListPage.vue'),
    },
    {
      path: '/expos/:expoId',
      name: 'expo-detail',
      component: () => import('@/views/ExpoDetailPage.vue'),
      props: true,
    },
    {
      path: '/pdfs',
      name: 'pdfs',
      component: () => import('@/views/PdfsListPage.vue'),
    },
    {
      path: '/runs',
      name: 'runs',
      component: () => import('@/views/RunsListPage.vue'),
    },
    {
      path: '/diagnostik',
      name: 'diagnostik',
      component: () => import('@/views/DiagnosticsPage.vue'),
    },
    {
      path: '/orkestrator',
      name: 'orkestrator',
      component: () => import('@/views/OrchestratorProgressPage.vue'),
    },
    {
      path: '/konfigurasi',
      name: 'konfigurasi',
      component: () => import('@/views/ConfigurationPage.vue'),
    },
    {
      path: '/labs',
      name: 'labs',
      component: () => import('@/views/LabsPage.vue'),
    },
    {
      path: '/pemantauan',
      name: 'pemantauan',
      component: () => import('@/views/LiveMonitorPage.vue'),
    },
    {
      path: '/pemantauan/single/:port',
      name: 'pemantauan-single',
      component: () => import('@/views/LiveMonitorSinglePage.vue'),
      props: true,
      meta: { bare: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundPage.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  const isPublic = Boolean(to.meta?.public)

  if (!auth.isAuthenticated && !isPublic) {
    return {
      path: '/login',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined,
    }
  }

  if (auth.isAuthenticated && to.name === 'login') {
    return { path: '/' }
  }

  return true
})

export default router
