/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useRoute, RouterLink } from 'vue-router';
import { computed, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import HudThemeToggle from './HudThemeToggle.vue';
import HudHeartbeat from './HudHeartbeat.vue';
import HudUptime from './HudUptime.vue';
import HudStatusPill from './HudStatusPill.vue';
import { api } from '@/api/client';
const route = useRoute();
const queryClient = useQueryClient();
const titleMap = {
    '/': [{ label: 'Pusat Komando' }],
    '/vendors': [{ label: 'Vendor' }],
    '/expos': [{ label: 'Ekspo' }],
    '/pdfs': [{ label: 'Brosur PDF' }],
    '/runs': [{ label: 'Riwayat Operasi' }],
    '/diagnostik': [{ label: 'Diagnostik' }],
};
const breadcrumbs = computed(() => {
    const path = route.path;
    if (titleMap[path])
        return titleMap[path];
    if (path.startsWith('/vendors/')) {
        return [{ label: 'Vendor', to: '/vendors' }, { label: 'Detail' }];
    }
    if (path.startsWith('/expos/')) {
        return [{ label: 'Ekspo', to: '/expos' }, { label: 'Detail' }];
    }
    return [{ label: 'Autocrawl' }];
});
const activeQuery = useQuery({
    queryKey: ['runs', 'active'],
    queryFn: api.activeRun,
    refetchInterval: 5000,
});
const isRunning = computed(() => Boolean(activeQuery.data.value?.active));
const stopRequested = computed(() => {
    const a = activeQuery.data.value?.active;
    return Boolean(a?.stop_requested);
});
const submitting = ref(false);
const stopping = ref(false);
const showModeMenu = ref(false);
const showForceModal = ref(false);
const __VLS_props = defineProps();
async function triggerRun(mode = 'normal') {
    showModeMenu.value = false;
    if (isRunning.value || submitting.value)
        return;
    submitting.value = true;
    try {
        await api.triggerRun(mode);
        toast.success('Operasi diluncurkan', {
            description: `Mode ${mode.toUpperCase()} berjalan di background. Dashboard auto refresh saat selesai.`,
        });
        queryClient.invalidateQueries({ queryKey: ['runs', 'active'] });
        queryClient.invalidateQueries({ queryKey: ['vendors'] });
        queryClient.invalidateQueries({ queryKey: ['expos'] });
        queryClient.invalidateQueries({ queryKey: ['pdfs'] });
        queryClient.invalidateQueries({ queryKey: ['runs'] });
        queryClient.invalidateQueries({ queryKey: ['overview'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        queryClient.invalidateQueries({ queryKey: ['exhibitor-refs'] });
    }
    catch (err) {
        const e = err;
        if (e.response?.status === 409) {
            toast.warning('Operasi masih aktif', {
                description: e.response.data?.detail?.message ?? 'Tunggu operasi sekarang selesai.',
            });
        }
        else {
            toast.error('Gagal meluncurkan operasi', {
                description: 'Cek log API container untuk detail.',
            });
        }
    }
    finally {
        submitting.value = false;
    }
}
async function stopRun(force) {
    if (stopping.value)
        return;
    stopping.value = true;
    try {
        const res = await api.stopRun(force);
        if (res.mode === 'force') {
            toast.success('Operasi dihentikan paksa', {
                description: 'Subprocess di-kill, lock dilepas. Trigger run baru sudah bisa.',
            });
        }
        else {
            toast.info('Permintaan stop diterima', {
                description: 'Worker drain berlanjut. Operasi akan selesai dalam beberapa puluh detik.',
            });
        }
        queryClient.invalidateQueries({ queryKey: ['runs', 'active'] });
        queryClient.invalidateQueries({ queryKey: ['runs'] });
        queryClient.invalidateQueries({ queryKey: ['exhibitor-refs'] });
    }
    catch (err) {
        const e = err;
        if (e.response?.status === 404) {
            toast.warning('Tidak ada operasi aktif untuk dihentikan');
        }
        else {
            toast.error('Gagal menghentikan operasi', {
                description: e.response?.data?.detail ?? 'Cek log API container.',
            });
        }
    }
    finally {
        stopping.value = false;
        showForceModal.value = false;
    }
}
function onStopClick(e) {
    // Default = open force-confirm modal. Graceful stop is currently a no-op
    // (workers don't check the cooperative flag in graph.py), so the only
    // path that actually halts a run is force. Modal warns about implications.
    // Shift+click skips the modal and fires graceful for users who explicitly
    // want to drain naturally and don't mind that it might not stop.
    if (e.shiftKey) {
        void stopRun(false);
        return;
    }
    showForceModal.value = true;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: ([
            'relative z-50 flex h-12 shrink-0 items-center justify-between px-4',
            __VLS_ctx.transparent
                ? 'border-b border-accent-500/15 bg-base-950/30 backdrop-blur-2xl'
                : 'border-b border-base-200 bg-white dark:border-base-700 dark:bg-base-900',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "flex items-center gap-1.5 font-mono text-xs uppercase tracking-ops" },
});
for (const [crumb, i] of __VLS_getVForSourceType((__VLS_ctx.breadcrumbs))) {
    (i);
    if (crumb.to) {
        const __VLS_0 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            to: (crumb.to),
            ...{ class: "text-base-500 hover:text-accent-600 dark:text-base-400 dark:hover:text-accent-300" },
        }));
        const __VLS_2 = __VLS_1({
            to: (crumb.to),
            ...{ class: "text-base-500 hover:text-accent-600 dark:text-base-400 dark:hover:text-accent-300" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_3.slots.default;
        (crumb.label);
        var __VLS_3;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-medium text-base-800 dark:text-base-100" },
        });
        (crumb.label);
    }
    if (i < __VLS_ctx.breadcrumbs.length - 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-base-300 dark:text-base-600" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
/** @type {[typeof HudHeartbeat, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(HudHeartbeat, new HudHeartbeat({}));
const __VLS_5 = __VLS_4({}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "hidden h-4 w-px bg-base-200 dark:bg-base-700 sm:inline-block" },
});
/** @type {[typeof HudUptime, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(HudUptime, new HudUptime({
    label: "UPTIME",
}));
const __VLS_8 = __VLS_7({
    label: "UPTIME",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
if (__VLS_ctx.transparent) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "hidden h-4 w-px bg-accent-500/20 sm:inline-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hidden font-mono text-2xs uppercase tracking-ops text-base-500 sm:inline" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
if (__VLS_ctx.isRunning && !__VLS_ctx.stopRequested) {
    /** @type {[typeof HudStatusPill, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
        tone: "warn",
        label: "OPS RUNNING",
        pulse: (true),
    }));
    const __VLS_11 = __VLS_10({
        tone: "warn",
        label: "OPS RUNNING",
        pulse: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
}
else if (__VLS_ctx.stopRequested) {
    /** @type {[typeof HudStatusPill, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
        tone: "crit",
        label: "STOPPING",
        pulse: (true),
    }));
    const __VLS_14 = __VLS_13({
        tone: "crit",
        label: "STOPPING",
        pulse: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
if (__VLS_ctx.isRunning) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.onStopClick) },
        ...{ class: "hud-btn-danger h-8 px-3" },
        disabled: (__VLS_ctx.stopping || __VLS_ctx.stopRequested),
        title: "Klik = graceful drain · Shift+klik = stop paksa",
    });
    const __VLS_16 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        icon: (['fas', __VLS_ctx.stopping ? 'circle-notch' : 'stop']),
        ...{ class: (__VLS_ctx.stopping ? 'animate-spin text-2xs' : 'text-2xs') },
    }));
    const __VLS_18 = __VLS_17({
        icon: (['fas', __VLS_ctx.stopping ? 'circle-notch' : 'stop']),
        ...{ class: (__VLS_ctx.stopping ? 'animate-spin text-2xs' : 'text-2xs') },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.stopRequested ? 'STOPPING…' : 'STOP');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "relative" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.triggerRun('normal');
        } },
    ...{ class: "hud-btn-primary h-8 px-3" },
    disabled: (__VLS_ctx.isRunning || __VLS_ctx.submitting),
});
const __VLS_20 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    icon: (['fas', __VLS_ctx.submitting ? 'circle-notch' : 'play']),
    ...{ class: (__VLS_ctx.submitting ? 'animate-spin text-2xs' : 'text-2xs') },
}));
const __VLS_22 = __VLS_21({
    icon: (['fas', __VLS_ctx.submitting ? 'circle-notch' : 'play']),
    ...{ class: (__VLS_ctx.submitting ? 'animate-spin text-2xs' : 'text-2xs') },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.isRunning ? 'BERJALAN' : 'ENGAGE');
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showModeMenu = !__VLS_ctx.showModeMenu;
        } },
    ...{ class: "hud-btn-primary h-8 border-l border-accent-700 px-1.5" },
    disabled: (__VLS_ctx.isRunning || __VLS_ctx.submitting),
    'aria-label': "Pilih mode operasi",
});
const __VLS_24 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    icon: (['fas', 'chevron-down']),
    ...{ class: "text-2xs" },
}));
const __VLS_26 = __VLS_25({
    icon: (['fas', 'chevron-down']),
    ...{ class: "text-2xs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    enterActiveClass: "transition duration-100",
    enterFromClass: "opacity-0 -translate-y-1",
    enterToClass: "opacity-100 translate-y-0",
    leaveActiveClass: "transition duration-75",
    leaveFromClass: "opacity-100",
    leaveToClass: "opacity-0",
}));
const __VLS_30 = __VLS_29({
    enterActiveClass: "transition duration-100",
    enterFromClass: "opacity-0 -translate-y-1",
    enterToClass: "opacity-100 translate-y-0",
    leaveActiveClass: "transition duration-75",
    leaveFromClass: "opacity-100",
    leaveToClass: "opacity-0",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
if (__VLS_ctx.showModeMenu) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute right-0 top-10 z-[55] w-48 overflow-hidden rounded-lg border border-base-200 bg-white shadow-xl dark:border-base-700 dark:bg-base-900" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showModeMenu))
                    return;
                __VLS_ctx.triggerRun('dev');
            } },
        ...{ class: "flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent-500/10" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono uppercase tracking-ops" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs text-base-400 dark:text-base-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showModeMenu))
                    return;
                __VLS_ctx.triggerRun('normal');
            } },
        ...{ class: "flex w-full items-center justify-between border-t border-base-200 px-3 py-2 text-left text-xs hover:bg-accent-500/10 dark:border-base-700" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono uppercase tracking-ops" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs text-base-400 dark:text-base-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showModeMenu))
                    return;
                __VLS_ctx.triggerRun('aggressive');
            } },
        ...{ class: "flex w-full items-center justify-between border-t border-base-200 px-3 py-2 text-left text-xs hover:bg-accent-500/10 dark:border-base-700" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono uppercase tracking-ops" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs text-base-400 dark:text-base-500" },
    });
}
var __VLS_31;
/** @type {[typeof HudThemeToggle, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(HudThemeToggle, new HudThemeToggle({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
if (__VLS_ctx.showForceModal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showForceModal))
                    return;
                __VLS_ctx.showForceModal = false;
            } },
        ...{ class: "fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hud-panel w-full max-w-md border-crit-500/50" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hud-panel-head border-crit-500/40 bg-crit-500/10" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    const __VLS_35 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        icon: (['fas', 'triangle-exclamation']),
        ...{ class: "text-crit-400" },
    }));
    const __VLS_37 = __VLS_36({
        icon: (['fas', 'triangle-exclamation']),
        ...{ class: "text-crit-400" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "hud-panel-title text-crit-300" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hud-panel-body flex flex-col gap-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "font-mono text-xs leading-relaxed text-base-300" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "flex flex-col gap-1 font-mono text-2xs text-base-300" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "font-mono text-2xs leading-relaxed text-warn-400" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-end gap-2 pt-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showForceModal))
                    return;
                __VLS_ctx.showForceModal = false;
            } },
        ...{ class: "hud-btn-ghost" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showForceModal))
                    return;
                __VLS_ctx.stopRun(true);
            } },
        ...{ class: "hud-btn-danger" },
        type: "button",
        disabled: (__VLS_ctx.stopping),
    });
    const __VLS_39 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        icon: (['fas', __VLS_ctx.stopping ? 'circle-notch' : 'stop']),
        ...{ class: (__VLS_ctx.stopping ? 'animate-spin text-2xs' : 'text-2xs') },
    }));
    const __VLS_41 = __VLS_40({
        icon: (['fas', __VLS_ctx.stopping ? 'circle-notch' : 'stop']),
        ...{ class: (__VLS_ctx.stopping ? 'animate-spin text-2xs' : 'text-2xs') },
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
}
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-12']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:hover:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['h-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-px']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:inline-block']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['h-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-px']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-accent-500/20']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:inline-block']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:inline']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l']} */ ;
/** @type {__VLS_StyleScopedClasses['border-accent-700']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['right-0']} */ ;
/** @type {__VLS_StyleScopedClasses['top-10']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[55]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-48']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-accent-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-accent-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-accent-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[60]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-black/60']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border-crit-500/50']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['border-crit-500/40']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-crit-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-300']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel-body']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warn-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-danger']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            HudThemeToggle: HudThemeToggle,
            HudHeartbeat: HudHeartbeat,
            HudUptime: HudUptime,
            HudStatusPill: HudStatusPill,
            breadcrumbs: breadcrumbs,
            isRunning: isRunning,
            stopRequested: stopRequested,
            submitting: submitting,
            stopping: stopping,
            showModeMenu: showModeMenu,
            showForceModal: showForceModal,
            triggerRun: triggerRun,
            stopRun: stopRun,
            onStopClick: onStopClick,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
