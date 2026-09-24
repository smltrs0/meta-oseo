import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import App from './App.vue';
import { iniciarTema } from './lib/tema';
import { router, vigilarSesion } from './router';
import './style.css';

const app = createApp(App);

// Pinia debe instalarse antes que el router: el guard de la primera navegación usa stores.
app.use(createPinia());
// Habilita la directiva v-motion de @vueuse/motion para los componentes de UI.
app.use(MotionPlugin);
app.use(router);

iniciarTema();
vigilarSesion(router);

app.mount('#app');
