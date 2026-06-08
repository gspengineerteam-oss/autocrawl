/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';
import { api } from '@/api/client';
import GeoAvatar from '@/components/GeoAvatar.vue';
import TagBadge from '@/components/TagBadge.vue';
const props = defineProps();
// Legacy fusions saved /static/fusions/<id>.svg (composer output). New ones
// use DiceBear directly. Detect legacy and rewrite client-side so we don't
// need to backfill the database.
const displayImageUrl = computed(() => {
    const raw = props.fusion.image_url;
    if (!raw)
        return null;
    if (raw.startsWith('/static/') || raw.startsWith('static/')) {
        const seed = encodeURIComponent(props.fusion.fusion_id || 'autocrawl-fusion');
        return (`https://api.dicebear.com/9.x/shapes/svg?seed=${seed}` +
            `&backgroundType=gradientLinear` +
            `&backgroundColor=b8893a,9a6f26,d4a250` +
            `&shape1Color=ffffff,faf6ee,ebe4d7` +
            `&shape2Color=09090b,3f3f46,c81212` +
            `&shape3Color=f25f4c,38bdf8,9a6f26` +
            `&radius=22`);
    }
    return raw;
});
const emit = defineEmits();
const expanded = ref(new Set());
function toggleExpand(id) {
    if (expanded.value.has(id))
        expanded.value.delete(id);
    else
        expanded.value.add(id);
    expanded.value = new Set(expanded.value);
}
async function copyDraft(draft) {
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    try {
        await navigator.clipboard.writeText(text);
        toast.success('Draft tersalin');
        try {
            await api.labs.markCopied(props.fusion.fusion_id, draft.id);
        }
        catch { /* analytics non-fatal */ }
    }
    catch {
        toast.error('Gagal salin ke clipboard');
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['fusion-card-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['fusion-card-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['fusion-card-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['fusion-card-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['fusion-card-glow']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.compact) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.compact))
                    return;
                __VLS_ctx.emit('open-detail', __VLS_ctx.fusion.fusion_id);
            } },
        ...{ class: "fusion-card-glow card overflow-hidden cursor-pointer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-body flex gap-3 relative" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "h-20 w-32 shrink-0 overflow-hidden rounded-[4px] border border-rule-strong bg-surface-2 flex items-center justify-center" },
    });
    if (__VLS_ctx.displayImageUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img, __VLS_intrinsicElements.img)({
            src: (__VLS_ctx.displayImageUrl),
            alt: "",
            ...{ class: "h-full w-full object-cover" },
            referrerpolicy: "no-referrer",
        });
    }
    else {
        /** @type {[typeof GeoAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(GeoAvatar, new GeoAvatar({
            seed: (__VLS_ctx.fusion.fusion_id),
            fallback: (__VLS_ctx.fusion.name),
            size: (76),
        }));
        const __VLS_1 = __VLS_0({
            seed: (__VLS_ctx.fusion.fusion_id),
            fallback: (__VLS_ctx.fusion.name),
            size: (76),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "min-w-0 flex-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "truncate text-[13px] font-semibold text-ink" },
    });
    (__VLS_ctx.fusion.name);
    if (__VLS_ctx.fusion.tagline) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "truncate text-[11.5px] text-ink-2 italic mt-0.5" },
        });
        (__VLS_ctx.fusion.tagline);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "mt-1.5 num-display text-[10.5px] text-ink-mute" },
    });
    (('source_vendor_count' in __VLS_ctx.fusion ? __VLS_ctx.fusion.source_vendor_count : __VLS_ctx.fusion.source_vendor_ids?.length) ?? 0);
    if (__VLS_ctx.fusion.industries?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mt-1.5 flex flex-wrap gap-1" },
        });
        for (const [ind] of __VLS_getVForSourceType((__VLS_ctx.fusion.industries.slice(0, 3)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (ind),
                ...{ class: "fusion-card-glow__chip num-display" },
            });
            (ind);
        }
    }
}
else if ('description' in __VLS_ctx.fusion) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-2 rounded-[6px] p-4 space-y-3" },
    });
    if (__VLS_ctx.displayImageUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "overflow-hidden rounded-[4px] border border-rule-strong" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img, __VLS_intrinsicElements.img)({
            src: (__VLS_ctx.displayImageUrl),
            alt: "",
            ...{ class: "w-full" },
            referrerpolicy: "no-referrer",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "text-[24px] font-bold text-ink tracking-[-0.02em]" },
    });
    (__VLS_ctx.fusion.name);
    if (__VLS_ctx.fusion.tagline) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-[15px] text-amber italic leading-snug" },
        });
        (__VLS_ctx.fusion.tagline);
    }
    if (__VLS_ctx.fusion.description) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-[13.5px] text-ink-2 leading-relaxed" },
            ...{ style: {} },
        });
        (__VLS_ctx.fusion.description);
    }
    if (__VLS_ctx.fusion.industries.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-wrap items-center gap-1.5" },
        });
        for (const [ind] of __VLS_getVForSourceType((__VLS_ctx.fusion.industries))) {
            /** @type {[typeof TagBadge, ]} */ ;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
                key: (ind),
                raw: (ind),
                size: "sm",
            }));
            const __VLS_4 = __VLS_3({
                key: (ind),
                raw: (ind),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
        }
    }
    if (__VLS_ctx.fusion.rationale) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "px-3 py-2 bg-amber/5 border border-amber/25 rounded-[4px]" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-[12px] italic text-ink-2 leading-relaxed" },
            ...{ style: {} },
        });
        (__VLS_ctx.fusion.rationale);
    }
    if (__VLS_ctx.fusion.source_vendors?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "space-y-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between mb-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (__VLS_ctx.fusion.source_vendors.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 gap-2 sm:grid-cols-2" },
        });
        for (const [v] of __VLS_getVForSourceType((__VLS_ctx.fusion.source_vendors))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (v.vendor_id),
                ...{ class: "flex items-center gap-3 p-2.5 rounded-[6px] border border-rule bg-surface-2/50" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "h-8 w-8 shrink-0 rounded-[3px] border border-rule-strong bg-surface flex items-center justify-center" },
            });
            if (v.logo_url) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.img, __VLS_intrinsicElements.img)({
                    src: (v.logo_url),
                    alt: (v.company_name),
                    ...{ class: "h-6 w-6 object-contain" },
                    referrerpolicy: "no-referrer",
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "text-[12px] font-bold text-amber" },
                });
                (v.company_name.charAt(0).toUpperCase());
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "min-w-0" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "truncate text-[13px] text-ink" },
            });
            (v.company_name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "truncate num-display text-[10.5px] text-ink-mute" },
            });
            (v.domain);
        }
    }
    if (__VLS_ctx.fusion.drafts?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "space-y-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between mb-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (__VLS_ctx.fusion.drafts.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "space-y-2" },
        });
        for (const [d] of __VLS_getVForSourceType((__VLS_ctx.fusion.drafts))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (d.id),
                ...{ class: "rounded-[6px] border border-rule overflow-hidden" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.compact))
                            return;
                        if (!('description' in __VLS_ctx.fusion))
                            return;
                        if (!(__VLS_ctx.fusion.drafts?.length))
                            return;
                        __VLS_ctx.toggleExpand(d.id);
                    } },
                ...{ class: "flex w-full items-center justify-between gap-3 bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3" },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "min-w-0" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "truncate text-[13px] text-ink" },
            });
            (d.vendor_name || d.vendor_id);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "truncate num-display text-[11px] text-ink-mute" },
            });
            (d.to_email);
            (d.subject);
            const __VLS_6 = {}.FaIcon;
            /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent(__VLS_6, new __VLS_6({
                icon: (['fas', __VLS_ctx.expanded.has(d.id) ? 'minus' : 'plus']),
                ...{ class: "text-[10px] text-ink-mute shrink-0" },
            }));
            const __VLS_8 = __VLS_7({
                icon: (['fas', __VLS_ctx.expanded.has(d.id) ? 'minus' : 'plus']),
                ...{ class: "text-[10px] text-ink-mute shrink-0" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            if (__VLS_ctx.expanded.has(d.id)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "border-t border-rule p-3.5 space-y-3 bg-surface" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "text-[14px] text-ink mt-1" },
                });
                (d.subject);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                    ...{ class: "mt-1 whitespace-pre-wrap break-words text-[13px] text-ink-2 leading-relaxed" },
                });
                (d.body);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "flex justify-between items-center pt-2 rule-t" },
                });
                if (d.copied_at) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "num-display text-[10.5px] text-ink-mute" },
                    });
                    const __VLS_10 = {}.FaIcon;
                    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
                        icon: (['fas', 'check']),
                        ...{ class: "text-ok mr-1 text-[9px]" },
                    }));
                    const __VLS_12 = __VLS_11({
                        icon: (['fas', 'check']),
                        ...{ class: "text-ok mr-1 text-[9px]" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
                    (d.copied_at);
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.compact))
                                return;
                            if (!('description' in __VLS_ctx.fusion))
                                return;
                            if (!(__VLS_ctx.fusion.drafts?.length))
                                return;
                            if (!(__VLS_ctx.expanded.has(d.id)))
                                return;
                            __VLS_ctx.copyDraft(d);
                        } },
                    ...{ class: "btn btn-amber h-8" },
                    type: "button",
                });
                const __VLS_14 = {}.FaIcon;
                /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
                // @ts-ignore
                const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
                    icon: (['fas', 'copy']),
                    ...{ class: "text-[10px]" },
                }));
                const __VLS_16 = __VLS_15({
                    icon: (['fas', 'copy']),
                    ...{ class: "text-[10px]" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_15));
            }
        }
    }
}
/** @type {__VLS_StyleScopedClasses['fusion-card-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['h-20']} */ ;
/** @type {__VLS_StyleScopedClasses['w-32']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[4px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule-strong']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['object-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['fusion-card-glow__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['card-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[4px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule-strong']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[24px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[-0.02em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[15px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-snug']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber/5']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-amber/25']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[4px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['p-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-2/50']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['w-8']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[3px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule-strong']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['object-contain']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-3']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3.5']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[14px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['break-words']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            GeoAvatar: GeoAvatar,
            TagBadge: TagBadge,
            displayImageUrl: displayImageUrl,
            emit: emit,
            expanded: expanded,
            toggleExpand: toggleExpand,
            copyDraft: copyDraft,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
