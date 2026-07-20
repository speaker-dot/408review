import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // Hash 路由无需服务器配置回退规则，适合 GitHub Pages 和离线静态托管。
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/node/:id',
      name: 'node',
      component: () => import('@/views/NodeView.vue'),
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
