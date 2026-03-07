export interface MenuItem {
  path: string
  name: string
  label: string
  icon: string
  component: () => Promise<any>
  adminOnly?: boolean
}

export const menuRoutes: MenuItem[] = [
  {
    path: '',
    name: 'dashboard',
    label: '概览',
    icon: 'i-carbon-chart-pie',
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: 'overview',
    name: 'overview',
    label: '总览',
    icon: 'i-carbon-chart-multitype',
    component: () => import('@/views/AnalyticsEcharts.vue'),
  },
  {
    path: 'personal',
    name: 'personal',
    label: '农场预览',
    icon: 'i-carbon-sprout',
    component: () => import('@/views/Personal.vue'),
  },
  {
    path: 'friends',
    name: 'friends',
    label: '好友',
    icon: 'i-carbon-user-multiple',
    component: () => import('@/views/Friends.vue'),
  },
  {
    path: 'steal-settings',
    name: 'steal-settings',
    label: '偷菜设置',
    icon: 'i-carbon-sprout',
    component: () => import('@/views/StealSettings.vue'),
  },
  {
    path: 'workflow',
    name: 'workflow',
    label: '策略流程',
    icon: 'i-carbon-flow',
    component: () => import('@/views/Workflow.vue'),
  },
  {
    path: 'analytics',
    name: 'analytics',
    label: '作物图鉴',
    icon: 'i-carbon-catalog',
    component: () => import('@/views/Analytics.vue'),
  },
  {
    path: 'accounts',
    name: 'accounts',
    label: '账号',
    icon: 'i-carbon-user-settings',
    component: () => import('@/views/Accounts.vue'),
  },
  {
    path: 'settings',
    name: 'Settings',
    label: '设置',
    icon: 'i-carbon-settings',
    component: () => import('@/views/Settings.vue'),
  },
  {
    path: 'announcements',
    name: 'announcements',
    label: '公告管理',
    icon: 'i-carbon-notification',
    component: () => import('@/views/AnnouncementManager.vue'),
    adminOnly: true,
  },
  {
    path: 'system-logs',
    name: 'system-logs',
    label: '系统日志',
    icon: 'i-carbon-catalog',
    component: () => import('@/views/SystemLogs.vue'),
    adminOnly: true,
  },
  {
    path: 'users',
    name: 'users',
    label: '用户',
    icon: 'i-carbon-user-multiple',
    component: () => import('@/views/Users.vue'),
    adminOnly: true,
  },
  {
    path: 'cards',
    name: 'cards',
    label: '卡密',
    icon: 'i-carbon-id-management',
    component: () => import('@/views/Cards.vue'),
    adminOnly: true,
  },
]
