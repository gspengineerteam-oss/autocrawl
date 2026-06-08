import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import router from '@/router';
import App from '@/App.vue';
import Icon from '@/components/icons/Icon.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import 'vue-sonner/style.css';
import '@/styles/main.css';
/* ------------------------------------------------------------------ */
/* FontAwesome shim — kept temporarily so un-ported HUD pages compile. */
/* All new code uses <Icon name="…" /> (lucide). FA goes away in       */
/* Phase D when the last `<FaIcon>` is removed.                        */
/* ------------------------------------------------------------------ */
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faGaugeHigh, faBuilding, faFlagCheckered, faFilePdf, faClockRotateLeft, faHeartPulse, faGear, faPlay, faPause, faStop, faCircleNotch, faSun, faMoon, faChevronLeft, faChevronRight, faChevronDown, faAnglesLeft, faAnglesRight, faMagnifyingGlass, faFilter, faGlobe, faChartLine, faChartColumn, faServer, faDatabase, faBolt, faTriangleExclamation, faCheck, faXmark, faLanguage, faCode, faArrowUpRightFromSquare, faSpider, faArrowsRotate, faTowerBroadcast, faSignal, faShieldHalved, faMicrochip, faCircleInfo, faSatelliteDish, faCirclePlay, faCircleCheck, faCircleXmark, faCircleExclamation, faRotate, faCopy, faLink, faPlus, faMinus, faEnvelope, faPhone, faLocationDot, faIndustry, faFlask, faCircleNodes, faTags, faClock, faCalendarDay, faPaperPlane, faUserShield, faCrosshairs, faTerminal, faBars, faRightFromBracket, faSliders, faTrash, faPenToSquare, faWandMagicSparkles, faToggleOn, faToggleOff, faRobot, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter, faGavel, faPassport, faPlane, faAnchor, faBomb, } from '@fortawesome/free-solid-svg-icons';
import { faSun as farSun, faMoon as farMoon, faFile as farFile, } from '@fortawesome/free-regular-svg-icons';
import { faGithub, faLinkedin, faXTwitter, faFacebook, faYoutube, faInstagram, } from '@fortawesome/free-brands-svg-icons';
library.add(faGaugeHigh, faBuilding, faFlagCheckered, faFilePdf, faClockRotateLeft, faHeartPulse, faGear, faPlay, faPause, faStop, faCircleNotch, faSun, faMoon, faChevronLeft, faChevronRight, faChevronDown, faAnglesLeft, faAnglesRight, faMagnifyingGlass, faFilter, faGlobe, faChartLine, faChartColumn, faServer, faDatabase, faBolt, faTriangleExclamation, faCheck, faXmark, faLanguage, faCode, faArrowUpRightFromSquare, faSpider, faArrowsRotate, faTowerBroadcast, faSignal, faShieldHalved, faMicrochip, faCircleInfo, faSatelliteDish, faCirclePlay, faCircleCheck, faCircleXmark, faCircleExclamation, faRotate, faCopy, faLink, faPlus, faMinus, faEnvelope, faPhone, faLocationDot, faIndustry, faFlask, faCircleNodes, faTags, faClock, faCalendarDay, faPaperPlane, faUserShield, faCrosshairs, faTerminal, faBars, faRightFromBracket, faSliders, faTrash, faPenToSquare, faWandMagicSparkles, faToggleOn, faToggleOff, faRobot, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter, faGavel, faPassport, faPlane, faAnchor, faBomb, farSun, farMoon, farFile, faGithub, faLinkedin, faXTwitter, faFacebook, faYoutube, faInstagram);
async function bootstrap() {
    if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[autocrawl] live mode — backend at', import.meta.env.VITE_API_BASE ?? '/api');
    }
    const app = createApp(App);
    app.use(createPinia());
    app.use(router);
    app.use(VueQueryPlugin);
    app.component('FaIcon', FontAwesomeIcon);
    app.component('Icon', Icon);
    app.mount('#app');
}
bootstrap();
