import { createRouter, createWebHistory } from 'vue-router'
import DatexRuntime from "@/views/DatexRuntime.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'runtime',
      component: DatexRuntime,
    },
  ],
})

export default router
