/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import AtlasMap from '@/components/atlas/AtlasMap.vue';
import SystemHealthBoard from '@/components/atlas/SystemHealthBoard.vue';
import LiveExhibitorFeed from '@/components/atlas/LiveExhibitorFeed.vue';
import LiveActivityTicker from '@/components/atlas/LiveActivityTicker.vue';
import IndustryDonut from '@/components/atlas/IndustryDonut.vue';
import NowCrawling from '@/components/atlas/NowCrawling.vue';
import TimelineArea from '@/components/atlas/TimelineArea.vue';
import TopGrowingCountries from '@/components/atlas/TopGrowingCountries.vue';
import SystemOverview from '@/components/atlas/SystemOverview.vue';
import QuickActionsList from '@/components/atlas/QuickActionsList.vue';
/**
 * Atlas — Refined Cinematic register, map-dominant Z-axis Cascade.
 *
 * Layout intent: map fills the viewport canvas as the hero. Hero numeral
 * (vendors_total) overlays the map top-left in gold cinema-scale. A run
 * state card cascades top-right at a slight rotation; two more KPI chips
 * Z-stack lower-right at the opposite tilt. Bottom edge carries the CTA
 * rail. Below the fold, an editorial band reveals timeline + industries
 * + recent country roll.
 *
 * Every figure on screen is wired to a real backend endpoint. No
 * synthesized prose. Bahasa Indonesia copy throughout.
 */
const router = useRouter();
const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.overview(),
    refetchInterval: 15_000,
});
const health = useQuery({
    queryKey: ['health-uptime'],
    queryFn: () => api.health(),
    refetchInterval: 30_000,
});
// Capture snapshot {uptime_seconds, fetchedAt} sehingga jam berdetik bisa
// di-compute client-side tanpa request per detik.
const uptimeAnchor = computed(() => {
    const u = health.data.value?.uptime_seconds;
    if (u === null || u === undefined || !Number.isFinite(u))
        return null;
    return { snapshotSec: u, anchorMs: Date.now() };
});
const nowTick = ref(Date.now());
let uptimeTimer = null;
const uptimeSeconds = computed(() => {
    const a = uptimeAnchor.value;
    if (!a)
        return null;
    const drift = (nowTick.value - a.anchorMs) / 1000;
    return Math.max(0, Math.floor(a.snapshotSec + drift));
});
function pad2(n) { return n < 10 ? `0${n}` : String(n); }
const uptimeParts = computed(() => {
    const s = uptimeSeconds.value;
    if (s === null)
        return null;
    const days = Math.floor(s / 86_400);
    const hours = Math.floor((s % 86_400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return { days, hours, minutes, seconds };
});
const serviceSinceLabel = computed(() => {
    const s = uptimeSeconds.value;
    if (s === null)
        return null;
    const since = new Date(Date.now() - s * 1000);
    // dd.MM.yyyy HH:mm WIB-equivalent (browser local).
    const dd = pad2(since.getDate());
    const mo = pad2(since.getMonth() + 1);
    const yr = since.getFullYear();
    const hh = pad2(since.getHours());
    const mi = pad2(since.getMinutes());
    return `${dd}.${mo}.${yr} ${hh}:${mi}`;
});
const activeRun = useQuery({
    queryKey: ['active-run'],
    queryFn: () => api.activeRun().then(r => r.active),
    refetchInterval: 5_000,
});
const timeline = useQuery({
    queryKey: ['stats-timeline-30'],
    queryFn: () => api.stats.timeline(30),
    staleTime: 60_000,
});
const countries = useQuery({
    queryKey: ['stats-countries-7'],
    queryFn: () => api.stats.countries(7),
    staleTime: 60_000,
});
const recentVendors = useQuery({
    queryKey: ['vendors-recent-6'],
    queryFn: () => api.vendors({ limit: 6, sort: '-created_at' }),
    staleTime: 30_000,
});
const vendorsTotal = computed(() => overview.data.value?.vendors_total ?? null);
const exposTotal = computed(() => overview.data.value?.expos_total ?? null);
const pdfsTotal = computed(() => overview.data.value?.pdfs_total ?? null);
const phase2Ratio = computed(() => overview.data.value?.phase_2_progress_ratio ?? 0);
const phase2Threshold = computed(() => overview.data.value?.phase_2_threshold ?? null);
const latestRun = computed(() => overview.data.value?.latest_run ?? null);
const industries = computed(() => overview.data.value?.industry_breakdown ?? []);
const phase2Percent = computed(() => {
    const r = phase2Ratio.value;
    if (!Number.isFinite(r))
        return 0;
    return Math.min(100, Math.max(0, r * 100));
});
const isRunLive = computed(() => Boolean(activeRun.data.value));
const liveRunMode = computed(() => {
    const r = activeRun.data.value;
    return r?.mode ?? latestRun.value?.mode ?? null;
});
const liveRunId = computed(() => {
    const r = activeRun.data.value;
    const id = r?.run_id ?? latestRun.value?.run_id ?? null;
    return id ? id.slice(0, 8) : null;
});
// Sparkline derived from /stats/timeline
const sparkline = computed(() => {
    const data = timeline.data.value ?? [];
    if (data.length < 2)
        return { path: '', area: '', max: 0, total: 0 };
    const values = data.map(d => d.vendors_added);
    const max = Math.max(...values, 1);
    const total = values.reduce((a, b) => a + b, 0);
    const w = 600;
    const h = 120;
    const stepX = w / (values.length - 1);
    const points = values.map((v, i) => [i * stepX, h - (v / max) * (h - 8) - 4]);
    const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
    const area = `${path} L ${w} ${h} L 0 ${h} Z`;
    return { path, area, max, total };
});
const topIndustries = computed(() => industries.value.slice(0, 4));
// Backend marks status='enriched' the moment we have a domain + scrape blob,
// even if no contacts/socials/address were actually extracted (description
// alone is a stub, not an enrichment). Mirror the gating here so the pill
// in "Vendor Terbaru" never claims 'enriched' on a thin record.
function deriveVendorStatus(v) {
    const raw = v.status ?? 'unresolved';
    if (raw !== 'enriched')
        return raw;
    const contacts = v.contacts ?? [];
    const hasContact = contacts.length > 0;
    const hasAddress = Boolean(v.address);
    const socials = v.socials ?? {};
    const hasSocial = Object.entries(socials).some(([k, val]) => k !== 'other' && Boolean(val));
    if (!hasContact && !hasAddress && !hasSocial)
        return 'thin';
    return 'enriched';
}
const recents = computed(() => {
    const items = recentVendors.data.value?.items ?? [];
    return items.map((v) => ({ ...v, _display_status: deriveVendorStatus(v) }));
});
// Prefetch top countries so /stats/countries is warm when the TopGrowingCountries
// component below mounts. We don't render the data here directly.
void countries.data.value;
const formatNum = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n))
        return ' ';
    return new Intl.NumberFormat('id-ID').format(n);
};
// Loading placeholder for cinema numerals — shows em-dash sentinel in gold-mute
// while query resolves, so the hero never collapses to empty space.
const cinemaVendors = computed(() => {
    const n = vendorsTotal.value;
    return (n === null || n === undefined) ? '—,———' : formatNum(n);
});
const cinemaExpos = computed(() => {
    const n = exposTotal.value;
    return (n === null || n === undefined) ? '——' : formatNum(n);
});
// Live ticker — rotates through recent vendor names every 4 seconds.
const tickerIndex = ref(0);
let tickerTimer = null;
const tickerText = computed(() => {
    const list = recents.value;
    if (!list.length)
        return 'MENUNGGU TELEMETRI · MENUNGGU VENDOR TERBARU';
    const v = list[tickerIndex.value % list.length];
    const base = `${v.company_name} · ${v.domain ?? 'tanpa domain'} · ${v.status}`;
    return base.toUpperCase();
});
onMounted(() => {
    tickerTimer = setInterval(() => { tickerIndex.value += 1; }, 4000);
    uptimeTimer = setInterval(() => { nowTick.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => {
    if (tickerTimer)
        clearInterval(tickerTimer);
    if (uptimeTimer)
        clearInterval(uptimeTimer);
});
function gotoVendors() { router.push('/vendors'); }
function gotoOrkestrator() { router.push('/orkestrator'); }
function gotoRuns() { router.push('/runs'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['atlas-hero__map']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__map']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__map']} */ ;
/** @type {__VLS_StyleScopedClasses['autocrawl-map']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__map']} */ ;
/** @type {__VLS_StyleScopedClasses['autocrawl-map']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema-num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__heartbeat-core']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__clock--empty']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg--days']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__cmark--blink']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__since']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__title']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--countries']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--feed']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__card-docs']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__chips']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__card-run']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cta']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-bento-i']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-bento-ii']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--industries']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--countries']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--feed']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--full']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--now']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--timeline-rich']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--system']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--quick']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--recent']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scroll-tick']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema-num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-msg']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-canvas" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atlas-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__map" },
});
/** @type {[typeof AtlasMap, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AtlasMap, new AtlasMap({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__scrim atlas-hero__scrim--top" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__scrim atlas-hero__scrim--bottom" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__ticker fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-mark" },
});
if (__VLS_ctx.isRunLive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "live-dot" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "dot dot-mute" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-tag" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-msg" },
    key: (__VLS_ctx.tickerIndex),
});
(__VLS_ctx.tickerText);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-stamp" },
});
(__VLS_ctx.liveRunMode ? __VLS_ctx.liveRunMode.toUpperCase() : 'IDLE');
(__VLS_ctx.liveRunId || '———');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__stencil fade-up" },
    ...{ style: {} },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__eyebrow fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow eyebrow-accent" },
});
if (__VLS_ctx.isRunLive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "live-dot" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "dot dot-mute" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__cinema fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__cinema-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__cinema-number num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__cinema-num" },
    'data-loading': (__VLS_ctx.vendorsTotal === null || __VLS_ctx.vendorsTotal === undefined),
});
(__VLS_ctx.cinemaVendors);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__cinema-suffix" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink num" },
});
(__VLS_ctx.cinemaExpos);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink num" },
});
(__VLS_ctx.formatNum(__VLS_ctx.pdfsTotal));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__rail" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__rail-track" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__rail-fill" },
    ...{ style: ({ width: __VLS_ctx.phase2Percent + '%' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__rail-meta" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
(__VLS_ctx.formatNum(__VLS_ctx.phase2Threshold));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num text-amber" },
    ...{ style: {} },
});
(__VLS_ctx.phase2Percent.toFixed(1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__card-run fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bezel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bezel-core p-5 atlas-uptime" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-uptime__head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-uptime__heartbeat" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "atlas-uptime__heartbeat-core" },
});
if (__VLS_ctx.uptimeParts) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atlas-uptime__clock" },
        'aria-live': "polite",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atlas-uptime__seg atlas-uptime__seg--days" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.uptimeParts.days);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atlas-uptime__seg-unit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atlas-uptime__cmark" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num atlas-uptime__seg-time" },
    });
    (__VLS_ctx.pad2(__VLS_ctx.uptimeParts.hours));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atlas-uptime__cmark" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num atlas-uptime__seg-time" },
    });
    (__VLS_ctx.pad2(__VLS_ctx.uptimeParts.minutes));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atlas-uptime__cmark atlas-uptime__cmark--blink" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num atlas-uptime__seg-time atlas-uptime__seg-time--sec" },
    });
    (__VLS_ctx.pad2(__VLS_ctx.uptimeParts.seconds));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atlas-uptime__clock atlas-uptime__clock--empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-uptime__caption" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
if (__VLS_ctx.serviceSinceLabel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atlas-uptime__since" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.serviceSinceLabel);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.gotoOrkestrator) },
    ...{ class: "btn btn-ghost btn-sm mt-4 w-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "btn-icon-nest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 7h8M7 3l4 4-4 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__card-docs fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card p-5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-2 num text-ink" },
    ...{ style: {} },
});
(__VLS_ctx.formatNum(__VLS_ctx.pdfsTotal));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute text-xs" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__chips fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute mb-2 block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-wrap gap-2 justify-end" },
});
for (const [it, i] of __VLS_getVForSourceType((__VLS_ctx.topIndustries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (it.tag + i),
        ...{ class: "pill" },
        ...{ class: (i === 0 ? 'pill-amber' : '') },
    });
    (it.tag);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num text-ink-mute ml-1" },
    });
    (__VLS_ctx.formatNum(it.count));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__cta fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.gotoVendors) },
    ...{ class: "btn btn-amber btn-lg" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "btn-icon-nest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 7h8M7 3l4 4-4 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.gotoRuns) },
    ...{ class: "btn" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-hero__scroll-cue" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "1",
    y: "1",
    width: "10",
    height: "18",
    rx: "5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M6 5v4",
    ...{ class: "atlas-hero__scroll-tick" },
});
/** @type {[typeof LiveActivityTicker, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(LiveActivityTicker, new LiveActivityTicker({
    ...{ class: "atlas-activity-ticker" },
}));
const __VLS_4 = __VLS_3({
    ...{ class: "atlas-activity-ticker" },
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atlas-section-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-section-mark__num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "atlas-section-mark__rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-section-mark__title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "display-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atlas-bento-i" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--timeline" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bezel bezel-lg h-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bezel-core h-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-end justify-between p-6 pb-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "display-hero mt-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num text-amber" },
});
(__VLS_ctx.formatNum(__VLS_ctx.sparkline.total));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num text-ink mt-1" },
    ...{ style: {} },
});
(__VLS_ctx.formatNum(__VLS_ctx.sparkline.max));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6 pb-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 600 120",
    preserveAspectRatio: "none",
    ...{ class: "w-full h-32" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.defs, __VLS_intrinsicElements.defs)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.linearGradient, __VLS_intrinsicElements.linearGradient)({
    id: "atlas-spark",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
    offset: "0%",
    'stop-color': "rgb(var(--accent))",
    'stop-opacity': "0.42",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
    offset: "100%",
    'stop-color': "rgb(var(--accent))",
    'stop-opacity': "0",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.sparkline.area),
    fill: "url(#atlas-spark)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.sparkline.path),
    fill: "none",
    stroke: "rgb(var(--accent))",
    'stroke-width': "2",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--industries" },
});
/** @type {[typeof IndustryDonut, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(IndustryDonut, new IndustryDonut({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--countries" },
});
/** @type {[typeof TopGrowingCountries, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(TopGrowingCountries, new TopGrowingCountries({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--feed" },
});
/** @type {[typeof LiveExhibitorFeed, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(LiveExhibitorFeed, new LiveExhibitorFeed({}));
const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atlas-section-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-section-mark__num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "atlas-section-mark__rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-section-mark__title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "display-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atlas-bento-ii" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--full" },
});
/** @type {[typeof SystemHealthBoard, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(SystemHealthBoard, new SystemHealthBoard({}));
const __VLS_16 = __VLS_15({}, ...__VLS_functionalComponentArgsRest(__VLS_15));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--now" },
});
/** @type {[typeof NowCrawling, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(NowCrawling, new NowCrawling({}));
const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--timeline-rich" },
});
/** @type {[typeof TimelineArea, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(TimelineArea, new TimelineArea({}));
const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--system" },
});
/** @type {[typeof SystemOverview, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(SystemOverview, new SystemOverview({}));
const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--quick" },
});
/** @type {[typeof QuickActionsList, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(QuickActionsList, new QuickActionsList({}));
const __VLS_28 = __VLS_27({}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-cell atlas-cell--recent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card p-5 h-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between mb-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.gotoVendors) },
    ...{ class: "btn btn-ghost btn-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "btn-icon-nest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "12",
    height: "12",
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 7h8M7 3l4 4-4 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "divide-y divide-[rgb(var(--rule)/var(--rule-alpha))]" },
});
for (const [v, i] of __VLS_getVForSourceType((__VLS_ctx.recents.slice(0, 5)))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.router.push(`/vendors/${encodeURIComponent(v.domain ?? v.vendor_id)}`);
            } },
        key: (v.vendor_id),
        ...{ class: "py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-2/50 px-2 -mx-2 rounded-lg transition-colors" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num text-ink-mute" },
        ...{ style: {} },
    });
    (String(i + 1).padStart(2, '0'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex-1 min-w-0" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-ink text-sm font-medium truncate" },
    });
    (v.company_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-ink-mute text-xs truncate font-mono" },
    });
    (v.domain || '—');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "pill" },
        ...{ class: (v._display_status === 'enriched' ? 'pill-ok'
                : (v._display_status === 'unresolved' || v._display_status === 'thin') ? 'pill-amber'
                    : (v._display_status === 'enrich_failed' || v._display_status === 'scope_rejected' || v._display_status === 'validation_rejected') ? 'pill-crit'
                        : '') },
        title: (v._display_status === 'thin' ? 'Backend tandain enriched tapi kontak/sosial/alamat kosong' : ''),
    });
    (v._display_status);
}
if (!__VLS_ctx.recents.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        ...{ class: "text-ink-mute text-sm py-4" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "atlas-foot" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
    ...{ style: {} },
});
(new Date().toISOString().slice(0, 16).replace('T', ' '));
/** @type {__VLS_StyleScopedClasses['atlas-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__map']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scrim']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scrim--top']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scrim']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scrim--bottom']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema-label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema-number']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema-num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cinema-suffix']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__rail']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__rail-track']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__rail-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__rail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__card-run']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-core']} */ ;
/** @type {__VLS_StyleScopedClasses['p-5']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__head']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__heartbeat']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__heartbeat-core']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__clock']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg--days']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg-unit']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__cmark']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg-time']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__cmark']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg-time']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__cmark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__cmark--blink']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg-time']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__seg-time--sec']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__clock']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__clock--empty']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__caption']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-uptime__since']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__card-docs']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['p-5']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__chips']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-1']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__cta']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scroll-cue']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__scroll-tick']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-activity-ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-bento-i']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-core']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-32']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--industries']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--countries']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--feed']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-bento-ii']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--full']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--now']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--timeline-rich']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--system']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--quick']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-cell--recent']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['p-5']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-y']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-[rgb(var(--rule)/var(--rule-alpha))]']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2/50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['-mx-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AtlasMap: AtlasMap,
            SystemHealthBoard: SystemHealthBoard,
            LiveExhibitorFeed: LiveExhibitorFeed,
            LiveActivityTicker: LiveActivityTicker,
            IndustryDonut: IndustryDonut,
            NowCrawling: NowCrawling,
            TimelineArea: TimelineArea,
            TopGrowingCountries: TopGrowingCountries,
            SystemOverview: SystemOverview,
            QuickActionsList: QuickActionsList,
            router: router,
            pad2: pad2,
            uptimeParts: uptimeParts,
            serviceSinceLabel: serviceSinceLabel,
            vendorsTotal: vendorsTotal,
            pdfsTotal: pdfsTotal,
            phase2Threshold: phase2Threshold,
            phase2Percent: phase2Percent,
            isRunLive: isRunLive,
            liveRunMode: liveRunMode,
            liveRunId: liveRunId,
            sparkline: sparkline,
            topIndustries: topIndustries,
            recents: recents,
            formatNum: formatNum,
            cinemaVendors: cinemaVendors,
            cinemaExpos: cinemaExpos,
            tickerIndex: tickerIndex,
            tickerText: tickerText,
            gotoVendors: gotoVendors,
            gotoOrkestrator: gotoOrkestrator,
            gotoRuns: gotoRuns,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
