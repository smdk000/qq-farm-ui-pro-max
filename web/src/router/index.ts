import NProgress from 'nprogress'
import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import api from '@/api'
import { adminToken, clearLocalAuthState } from '@/utils/auth'
import { attemptRouteRecovery, clearRouteRecoveryState, isRecoverableRouteError } from '@/utils/route-recovery'
import { menuRoutes } from './menu'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

type CurrentUser = {
  username?: string
  role?: string
  card?: unknown
} | null

interface SessionValidation {
  valid: boolean
  user: CurrentUser
}

interface BootstrapStatus {
  required: boolean
  initialized: boolean
  username?: string
}

let validatedUser = ''
let validatedCurrentUser: CurrentUser = null
let validatingPromise: Promise<SessionValidation> | null = null
let validatingMarker = ''
let bootstrapStatusPromise: Promise<BootstrapStatus> | null = null

function readStoredCurrentUser(): CurrentUser {
  try {
    const raw = localStorage.getItem('current_user')
    if (!raw)
      return null
    const user = JSON.parse(raw)
    return user && typeof user === 'object' ? user : null
  }
  catch {
    localStorage.removeItem('current_user')
    return null
  }
}

function persistCurrentUser(user: CurrentUser) {
  if (user)
    localStorage.setItem('current_user', JSON.stringify(user))
  else
    localStorage.removeItem('current_user')
}

watch(adminToken, (nextMarker, prevMarker) => {
  const next = String(nextMarker || '').trim()
  const prev = String(prevMarker || '').trim()
  if (next !== prev) {
    validatedUser = ''
    validatedCurrentUser = null
  }
  if (!next)
    validatingMarker = ''
})

async function ensureTokenValid() {
  const loginMarker = String(adminToken.value || '').trim()
  if (!loginMarker)
    return { valid: false, user: null } satisfies SessionValidation

  if (validatedUser && validatedUser === loginMarker)
    return { valid: true, user: validatedCurrentUser || readStoredCurrentUser() } satisfies SessionValidation

  if (validatingPromise && validatingMarker === loginMarker)
    return validatingPromise

  const requestMarker = loginMarker
  validatingMarker = requestMarker
  const promise = api.get('/api/auth/validate', {
    timeout: 6000,
  }).then((res) => {
    const ok = !!(res.data && res.data.ok)
    const user = ok ? (res.data?.data?.user || null) : null
    if (ok && String(adminToken.value || '').trim() === requestMarker) {
      validatedUser = requestMarker
      validatedCurrentUser = user
      persistCurrentUser(user)
    }
    return { valid: ok, user } satisfies SessionValidation
  }).catch(() => ({ valid: false, user: null } satisfies SessionValidation)).finally(() => {
    if (validatingMarker === requestMarker) {
      validatingPromise = null
      validatingMarker = ''
    }
  })

  validatingPromise = promise
  return promise
}

function normalizeBootstrapStatus(data: any): BootstrapStatus {
  const next = (data && typeof data === 'object') ? data : {}
  return {
    required: !!next.required,
    initialized: next.initialized !== false,
    username: String(next.username || next.seededUsername || 'admin').trim() || 'admin',
  }
}

async function ensureBootstrapStatus() {
  if (bootstrapStatusPromise)
    return bootstrapStatusPromise

  bootstrapStatusPromise = api.get('/api/auth/bootstrap-status', {
    timeout: 6000,
  }).then((res) => {
    return normalizeBootstrapStatus(res.data?.data)
  }).catch(() => ({
    required: false,
    initialized: true,
    username: 'admin',
  } satisfies BootstrapStatus)).finally(() => {
    bootstrapStatusPromise = null
  })

  return bootstrapStatusPromise
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: [
        ...menuRoutes.map(route => ({
          path: route.path,
          name: route.name,
          component: route.component,
          meta: {
            adminOnly: !!route.adminOnly,
            layoutMode: route.layoutMode ?? 'fluid',
          },
        })),
        {
          path: 'help',
          name: 'help',
          component: () => import('@/views/HelpCenter.vue'),
          meta: {
            layoutMode: 'fluid',
          },
        },
        {
          path: 'farm-tools',
          name: 'farm-tools',
          component: () => import('@/views/FarmTools.vue'),
          meta: {
            layoutMode: 'fluid',
          },
        },
      ],
    },
    {
      path: '/pastoral-view',
      name: 'pastoral-view',
      component: () => import('@/views/PastoralFullscreenPage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
    },
    {
      path: '/init-password',
      name: 'init-password',
      component: () => import('@/views/InitPassword.vue'),
    },
  ],
})

router.beforeEach(async (to, _from) => {
  NProgress.start()
  const bootstrapStatus = await ensureBootstrapStatus()

  if (bootstrapStatus.required) {
    if (to.name !== 'init-password')
      return { name: 'init-password' }
    return true
  }

  if (to.name === 'init-password') {
    if (!adminToken.value) {
      validatedUser = ''
      validatedCurrentUser = null
      return { name: 'login' }
    }
    const session = await ensureTokenValid()
    if (session.valid)
      return { name: 'dashboard' }
    validatedUser = ''
    validatedCurrentUser = null
    clearLocalAuthState()
    return { name: 'login' }
  }

  if (to.name === 'login') {
    if (!adminToken.value) {
      validatedUser = ''
      validatedCurrentUser = null
      return true
    }
    const session = await ensureTokenValid()
    if (session.valid)
      return { name: 'dashboard' }
    validatedUser = ''
    validatedCurrentUser = null
    clearLocalAuthState()
    return true
  }

  if (!adminToken.value) {
    validatedUser = ''
    validatedCurrentUser = null
    return { name: 'login' }
  }

  const session = await ensureTokenValid()
  if (!session.valid) {
    validatedUser = ''
    validatedCurrentUser = null
    clearLocalAuthState()
    return { name: 'login' }
  }

  const needsAdmin = to.matched.some(record => !!record.meta?.adminOnly)
  if (needsAdmin && session.user?.role !== 'admin')
    return { name: 'dashboard' }

  return true
})

router.afterEach(() => {
  NProgress.done()
  clearRouteRecoveryState()
})

router.onError((error, to) => {
  if (isRecoverableRouteError(error)) {
    console.warn('捕获到动态模块加载异常，准备重新加载目标路由:', to.fullPath)
    if (attemptRouteRecovery(to.fullPath))
      return
  }

  NProgress.done()
})

export default router
