import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./styles/tokens.css";
import "./styles/main.css";
import "./styles/dashboard.css";
import "./styles/templates.css";
import "./styles/workspace.css";

createApp(App).use(router).mount("#app");
