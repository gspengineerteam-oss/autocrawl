/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
/**
 * SystemHealthBoard — editorial briefing on the live machine.
 *
 *   Mesin · Sistem Hidup
 *   ─────────────────────
 *   [ Ollama / GPU      ] [ Antrian LLM        ] [ Sesi Agentic       ]
 *     host + total VRAM    4 tiers per row        per-container card
 *     loaded models list   cap vs inflight bar    started + TTL
 *
 * Surfaces three backend endpoints under /api/system/. No mock data, no
 * synthesized prose — each panel renders empty-state when its source is
 * unreachable, never invents content. The Geist italic eyebrow is the
 * Dossier Console signature.
 */
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
const llmQueue = useQuery({
    queryKey: ['system', 'llm-queue'],
    queryFn: api.system.llmQueue,
    refetchInterval: 4000,
    staleTime: 2000,
});
const ollamaPs = useQuery({
    queryKey: ['system', 'ollama-ps'],
    queryFn: api.system.ollamaPs,
    refetchInterval: 8000,
    staleTime: 4000,
});
const agentic = useQuery({
    queryKey: ['system', 'agentic-sessions'],
    queryFn: api.system.agenticSessions,
    refetchInterval: 4000,
    staleTime: 2000,
});
const tiers = computed(() => {
    const t = llmQueue.data.value?.tiers;
    if (!t)
        return [];
    return ['vision', 'heavy', 'light', 'tiny'].map((k) => ({
        key: k,
        cap: t[k]?.cap ?? 0,
        inflight: t[k]?.inflight ?? 0,
    }));
});
const ollamaHost = computed(() => {
    const h = ollamaPs.data.value?.host ?? '';
    return h.replace(/^https?:\/\//, '') || '—';
});
const totalVramGb = computed(() => {
    const b = ollamaPs.data.value?.total_vram_bytes ?? 0;
    return b > 0 ? (b / 1024 ** 3).toFixed(1) : null;
});
const loadedModels = computed(() => ollamaPs.data.value?.models ?? []);
function modelVramGb(size_vram) {
    if (!size_vram)
        return null;
    return (size_vram / 1024 ** 3).toFixed(1);
}
function shortName(name) {
    return name.length > 28 ? name.slice(0, 26) + '…' : name;
}
function fmtTtl(seconds) {
    if (seconds == null || seconds < 0)
        return '—';
    if (seconds < 60)
        return `${seconds}d`;
    const m = Math.floor(seconds / 60);
    if (m < 60)
        return `${m}m ${seconds % 60}d`;
    const h = Math.floor(m / 60);
    return `${h}j ${m % 60}m`;
}
function elapsed(iso) {
    if (!iso)
        return '—';
    try {
        const start = new Date(iso).getTime();
        if (Number.isNaN(start))
            return '—';
        const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
        return fmtTtl(sec);
    }
    catch {
        return '—';
    }
}
function tierLabel(k) {
    return { vision: 'VISI', heavy: 'BERAT', light: 'RINGAN', tiny: 'MIKRO' }[k] ?? k.toUpperCase();
}
const ollamaUnreachable = computed(() => {
    const s = ollamaPs.data.value?.status;
    return s && s !== 'ok';
});
const agenticEmpty = computed(() => (agentic.data.value?.sessions?.length ?? 0) === 0);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['board-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['model-item']} */ ;
/** @type {__VLS_StyleScopedClasses['session-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "health-board" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "board-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "head-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "head-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "head-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "title-sep" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "head-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber pulse-amber" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "board-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "panel-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "host-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
    ...{ class: "host-val" },
});
(__VLS_ctx.ollamaHost);
if (__VLS_ctx.ollamaUnreachable) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    (__VLS_ctx.ollamaPs.data.value?.status === 'timeout' ? 'Daemon tidak menjawab dalam 3 detik' :
        __VLS_ctx.ollamaPs.data.value?.status === 'unavailable' ? 'Provider bukan Ollama' :
            'Daemon tidak terjangkau');
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vram-headline" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vram-num" },
    });
    (__VLS_ctx.totalVramGb ?? '0.0');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vram-unit" },
    });
    if (__VLS_ctx.loadedModels.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ class: "model-list" },
        });
        for (const [m] of __VLS_getVForSourceType((__VLS_ctx.loadedModels))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (m.name),
                ...{ class: "model-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "model-name" },
                title: (m.name),
            });
            (__VLS_ctx.shortName(m.name));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "model-vram" },
            });
            (__VLS_ctx.modelVramGb(m.size_vram) ?? '—');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "model-vram-u" },
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "panel-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "queue-meta" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
(__VLS_ctx.llmQueue.data.value?.enabled ? 'AKTIF' : 'BYPASS');
if (__VLS_ctx.llmQueue.data.value?.source === 'no_redis') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "tier-list" },
});
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tiers))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        key: (t.key),
        ...{ class: "tier-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tier-label" },
    });
    (__VLS_ctx.tierLabel(t.key));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tier-bar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tier-bar-fill" },
        ...{ style: ({ width: t.cap > 0 ? `${Math.min(100, (t.inflight / t.cap) * 100)}%` : '0%' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tier-count" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tier-now" },
    });
    (t.inflight);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tier-cap" },
    });
    (t.cap);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "panel-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "queue-meta" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
    ...{ class: (__VLS_ctx.agenticEmpty ? 'label-mute' : 'label-amber') },
});
(__VLS_ctx.agenticEmpty ? 'IDLE' : `${__VLS_ctx.agentic.data.value?.sessions.length} BERJALAN`);
if (__VLS_ctx.agentic.data.value?.stop_requested) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-crit" },
    });
}
if (__VLS_ctx.agenticEmpty) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "session-list" },
    });
    for (const [s] of __VLS_getVForSourceType((__VLS_ctx.agentic.data.value?.sessions ?? []))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (s.host),
            ...{ class: "session-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "session-host" },
        });
        (s.host);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "session-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "session-elapsed" },
        });
        (__VLS_ctx.elapsed(s.started_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "session-ttl" },
        });
        (__VLS_ctx.fmtTtl(s.lock_ttl_seconds));
    }
}
/** @type {__VLS_StyleScopedClasses['health-board']} */ ;
/** @type {__VLS_StyleScopedClasses['board-head']} */ ;
/** @type {__VLS_StyleScopedClasses['head-left']} */ ;
/** @type {__VLS_StyleScopedClasses['head-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['head-title']} */ ;
/** @type {__VLS_StyleScopedClasses['title-sep']} */ ;
/** @type {__VLS_StyleScopedClasses['head-right']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['pulse-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['board-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-body']} */ ;
/** @type {__VLS_StyleScopedClasses['host-row']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['host-val']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-line']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['vram-headline']} */ ;
/** @type {__VLS_StyleScopedClasses['vram-num']} */ ;
/** @type {__VLS_StyleScopedClasses['vram-unit']} */ ;
/** @type {__VLS_StyleScopedClasses['model-list']} */ ;
/** @type {__VLS_StyleScopedClasses['model-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-name']} */ ;
/** @type {__VLS_StyleScopedClasses['model-vram']} */ ;
/** @type {__VLS_StyleScopedClasses['model-vram-u']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-line']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-body']} */ ;
/** @type {__VLS_StyleScopedClasses['queue-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-list']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-row']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-count']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-now']} */ ;
/** @type {__VLS_StyleScopedClasses['tier-cap']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-body']} */ ;
/** @type {__VLS_StyleScopedClasses['queue-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-line']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['session-list']} */ ;
/** @type {__VLS_StyleScopedClasses['session-row']} */ ;
/** @type {__VLS_StyleScopedClasses['session-host']} */ ;
/** @type {__VLS_StyleScopedClasses['session-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['session-elapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['session-ttl']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            llmQueue: llmQueue,
            ollamaPs: ollamaPs,
            agentic: agentic,
            tiers: tiers,
            ollamaHost: ollamaHost,
            totalVramGb: totalVramGb,
            loadedModels: loadedModels,
            modelVramGb: modelVramGb,
            shortName: shortName,
            fmtTtl: fmtTtl,
            elapsed: elapsed,
            tierLabel: tierLabel,
            ollamaUnreachable: ollamaUnreachable,
            agenticEmpty: agenticEmpty,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
