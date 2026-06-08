/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { api } from '@/api/client';
const router = useRouter();
const queryClient = useQueryClient();
const activeQuery = useQuery({
    queryKey: ['runs', 'active'],
    queryFn: api.activeRun,
    refetchInterval: 5000,
});
const isRunning = computed(() => Boolean(activeQuery.data.value?.active));
const actions = computed(() => [
    {
        label: isRunning.value ? 'Operasi Berjalan' : 'Luncurkan Normal',
        hint: isRunning.value ? 'Lihat orkestrator' : 'Run mode normal',
        icon: isRunning.value ? 'tower-broadcast' : 'play',
        run: async () => {
            if (isRunning.value) {
                router.push('/orkestrator');
                return;
            }
            try {
                await api.triggerRun('normal');
                toast.success('Operasi diluncurkan');
                queryClient.invalidateQueries({ queryKey: ['runs', 'active'] });
            }
            catch {
                toast.error('Gagal meluncurkan operasi');
            }
        },
    },
    { label: 'Daftar Vendor', hint: 'Telusuri indeks', icon: 'building', run: () => router.push('/vendors') },
    { label: 'Daftar Ekspo', hint: 'Per negara/tema', icon: 'flag-checkered', run: () => router.push('/expos') },
    { label: 'Brosur PDF', hint: 'Arsip cetak', icon: 'file-pdf', run: () => router.push('/pdfs') },
    { label: 'Riwayat Operasi', hint: 'Jejak run', icon: 'clock-rotate-left', run: () => router.push('/runs') },
    { label: 'Konfigurasi', hint: 'Aturan & prompt', icon: 'sliders', run: () => router.push('/konfigurasi') },
]);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "card overflow-hidden" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
    ...{ class: "text-[10px] tracking-widest border border-rule-strong px-1.5 py-0.5 text-ink-mute" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-2 py-1.5" },
});
for (const [a] of __VLS_getVForSourceType((__VLS_ctx.actions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                a.run();
            } },
        key: (a.label),
        ...{ class: "group w-full flex items-center gap-3 px-3 py-2 rounded-[6px] hover:bg-surface-2/60 text-left transition-colors" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "flex h-7 w-7 items-center justify-center bg-surface-2 group-hover:bg-amber group-hover:text-bg transition-colors shrink-0" },
        ...{ style: {} },
    });
    const __VLS_0 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        icon: (['fas', a.icon]),
        ...{ class: "text-[12px] text-amber group-hover:text-bg transition-colors" },
    }));
    const __VLS_2 = __VLS_1({
        icon: (['fas', a.icon]),
        ...{ class: "text-[12px] text-amber group-hover:text-bg transition-colors" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "min-w-0 flex-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-[12.5px] text-ink truncate group-hover:text-amber transition-colors" },
    });
    (a.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-[10.5px] text-ink-mute truncate" },
    });
    (a.hint);
    const __VLS_4 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        icon: (['fas', 'chevron-right']),
        ...{ class: "text-[10px] text-ink-mute opacity-0 group-hover:opacity-100 transition-opacity" },
    }));
    const __VLS_6 = __VLS_5({
        icon: (['fas', 'chevron-right']),
        ...{ class: "text-[10px] text-ink-mute opacity-0 group-hover:opacity-100 transition-opacity" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule-strong']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2/60']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-7']} */ ;
/** @type {__VLS_StyleScopedClasses['w-7']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:bg-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:text-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:text-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['opacity-0']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:opacity-100']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-opacity']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            actions: actions,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
