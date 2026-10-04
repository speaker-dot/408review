import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './assets/main.css'
import './assets/learning.css'
import './assets/premium.css'
import 'katex/dist/katex.min.css'

createApp(App).use(createPinia()).use(router).mount('#app')
