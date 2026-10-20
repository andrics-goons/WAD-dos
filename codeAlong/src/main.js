import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Self-hosted fonts + icons (no CDN: the COOP/COEP headers WebContainer needs
// would block cross-origin font files). Credits: design-docs/02 third-party table.
import '@fontsource-variable/inter' // Source: https://fontsource.org (OFL-1.1)
import '@fontsource-variable/jetbrains-mono' // Source: https://fontsource.org (OFL-1.1)
// Bootstrap's pre-built CSS only (no Sass, no Bootstrap JS — Vue handles interactivity):
// we use it for the responsive grid, breakpoints and layout utilities.
import 'bootstrap/dist/css/bootstrap.min.css' // Source: https://getbootstrap.com (MIT)
import 'bootstrap-icons/font/bootstrap-icons.css' // Source: https://icons.getbootstrap.com (MIT)
import './styles/main.css' // our plain-CSS theme — must come AFTER Bootstrap so it wins

import App from './App.vue'
import router from './router'

import 'bootstrap/dist/css/bootstrap.min.css'        
import 'bootstrap/dist/js/bootstrap.bundle.min.js' 

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
