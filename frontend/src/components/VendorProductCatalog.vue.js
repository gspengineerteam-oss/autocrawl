import { computed, onMounted, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import TagBadge from './TagBadge.vue';
const props = defineProps();
const emit = defineEmits();
const detailed = computed(() => props.vendor.products_detailed ?? []);
const legacy = computed(() => props.vendor.products ?? []);
const hasDetailed = computed(() => detailed.value.length > 0);
const overallScore = computed(() => props.vendor.overall_scope_score ?? 0);
const overallPct = computed(() => Math.round(overallScore.value * 100));
const focusSummary = computed(() => props.vendor.focus_summary || null);
const doiTags = computed(() => props.vendor.domain_of_interest ?? []);
const vendorName = computed(() => props.vendor.company_name || props.vendor.domain || 'Vendor');
function pct(score) { return Math.round(score * 100); }
function scoreTone(score) {
    if (score >= 0.7)
        return 'ok';
    if (score >= 0.3)
        return 'amber';
    return 'crit';
}
function toneLabel(score) {
    const t = scoreTone(score);
    return t === 'ok' ? '' : t === 'amber' ? 'Sebagian' : 'Rendah';
}
function initials(name) {
    return name
        .split(/[\s\-_·]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || '?';
}
const productImgFailed = ref(new Set());
function onProductImgErr(idx) {
    const next = new Set(productImgFailed.value);
    next.add(idx);
    productImgFailed.value = next;
}
/* Modal state */
const activeIdx = ref(null);
const activeProduct = computed(() => activeIdx.value !== null ? detailed.value[activeIdx.value] ?? null : null);
function openProduct(idx) {
    activeIdx.value = idx;
    if (typeof document !== 'undefined')
        document.body.style.overflow = 'hidden';
}
function closeProduct() {
    activeIdx.value = null;
    if (typeof document !== 'undefined')
        document.body.style.overflow = '';
}
function navProduct(delta) {
    if (activeIdx.value === null)
        return;
    const n = detailed.value.length;
    if (n === 0)
        return;
    activeIdx.value = (activeIdx.value + delta + n) % n;
}
useEventListener('keydown', (e) => {
    if (activeIdx.value === null)
        return;
    if (e.key === 'Escape')
        closeProduct();
    if (e.key === 'ArrowRight')
        navProduct(1);
    if (e.key === 'ArrowLeft')
        navProduct(-1);
});
const mounted = ref(false);
onMounted(() => { requestAnimationFrame(() => { mounted.value = true; }); });
function deepen() { emit('deepen'); }
/* Ring meter circumference for SVG dasharray-driven progress arc */
const RING_RADIUS = 28;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
/* 3D tilt math driven by pointer position relative to card center.
 * Returns transform string that's applied via inline style. Reset on leave. */
const tilt = ref(new Map());
function onCardMove(idx, e) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = e.clientY - r.top - r.height / 2;
    const rx = (cy / r.height) * -6; // tilt-up when cursor below center
    const ry = (cx / r.width) * 8;
    const next = new Map(tilt.value);
    next.set(idx, { x: rx, y: ry });
    tilt.value = next;
}
function onCardLeave(idx) {
    const next = new Map(tilt.value);
    next.delete(idx);
    tilt.value = next;
}
function tiltStyle(idx) {
    const t = tilt.value.get(idx);
    if (!t)
        return {};
    return {
        transform: `perspective(1100px) rotateX(${t.x.toFixed(2)}deg) rotateY(${t.y.toFixed(2)}deg) translateY(-3px)`,
    };
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['cat-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['is-mounted']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__img']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__img']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip--label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip--label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__open']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__navbtn']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__close']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__close']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__img--empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring-num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-head--pro']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-head--con']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li-bullet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li-bullet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal-enter-active']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal-leave-active']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal-enter-from']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal-leave-to']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cover__layout']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__body']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__left']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__img-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring-num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__right']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ledger']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__img']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cat-root" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "cat-cover" },
    ...{ class: ({ 'is-mounted': __VLS_ctx.mounted }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cat-cover__layout" },
});
if (__VLS_ctx.hasDetailed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-fit" },
        'data-tone': (__VLS_ctx.scoreTone(__VLS_ctx.overallScore)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-fit__num" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.overallPct);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-fit__unit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-fit__label" },
    });
    if (__VLS_ctx.toneLabel(__VLS_ctx.overallScore)) {
        (__VLS_ctx.toneLabel(__VLS_ctx.overallScore));
    }
    (__VLS_ctx.detailed.length);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-fit cat-fit--empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-fit__num cat-fit__num--empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-fit__label" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cat-prose" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow eyebrow-accent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "cat-name" },
});
(__VLS_ctx.vendorName);
if (__VLS_ctx.focusSummary) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "cat-summary" },
    });
    (__VLS_ctx.focusSummary);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "cat-summary cat-summary--mute" },
    });
}
if (__VLS_ctx.doiTags.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-tags" },
    });
    for (const [tag] of __VLS_getVForSourceType((__VLS_ctx.doiTags))) {
        /** @type {[typeof TagBadge, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
            key: (tag),
            raw: (tag),
            size: "sm",
            variant: "outline",
        }));
        const __VLS_1 = __VLS_0({
            key: (tag),
            raw: (tag),
            size: "sm",
            variant: "outline",
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    }
}
if (__VLS_ctx.hasDetailed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "cat-grid" },
    });
    for (const [p, idx] of __VLS_getVForSourceType((__VLS_ctx.detailed))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hasDetailed))
                        return;
                    __VLS_ctx.openProduct(idx);
                } },
            ...{ onMousemove: (...[$event]) => {
                    if (!(__VLS_ctx.hasDetailed))
                        return;
                    __VLS_ctx.onCardMove(idx, $event);
                } },
            ...{ onMouseleave: (...[$event]) => {
                    if (!(__VLS_ctx.hasDetailed))
                        return;
                    __VLS_ctx.onCardLeave(idx);
                } },
            key: (`${p.name}-${idx}`),
            ...{ class: "cat-card" },
            ...{ class: ({ 'is-mounted': __VLS_ctx.mounted }) },
            ...{ style: ({ ...__VLS_ctx.tiltStyle(idx), animationDelay: (80 + idx * 50) + 'ms' }) },
            'data-tone': (__VLS_ctx.scoreTone(p.scope_match_score)),
            'data-elite': (p.scope_match_score >= 0.9 ? 'true' : 'false'),
            'data-elite-style': "inset",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.figure, __VLS_intrinsicElements.figure)({
            ...{ class: "cat-card__img" },
        });
        if (p.image_url && !__VLS_ctx.productImgFailed.has(idx)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                ...{ onError: (...[$event]) => {
                        if (!(__VLS_ctx.hasDetailed))
                            return;
                        if (!(p.image_url && !__VLS_ctx.productImgFailed.has(idx)))
                            return;
                        __VLS_ctx.onProductImgErr(idx);
                    } },
                src: (p.image_url),
                alt: (p.name),
                loading: "lazy",
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cat-card__img-empty" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cat-card__img-mark" },
            });
            (__VLS_ctx.initials(p.name));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-ring" },
            'data-tone': (__VLS_ctx.scoreTone(p.scope_match_score)),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 72 72",
            width: "72",
            height: "72",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "36",
            cy: "36",
            r: "28",
            ...{ class: "cat-ring__bg" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "36",
            cy: "36",
            r: "28",
            ...{ class: "cat-ring__bar" },
            ...{ style: ({
                    strokeDasharray: `${(p.scope_match_score * __VLS_ctx.RING_CIRC).toFixed(2)} ${__VLS_ctx.RING_CIRC}`,
                }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-ring__num" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num" },
        });
        (__VLS_ctx.pct(p.scope_match_score));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "cat-ring__pct" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-card__body" },
        });
        if (p.category) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cat-card__cat" },
            });
            (p.category);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "cat-card__name" },
        });
        (p.name);
        if (p.summary) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "cat-card__summary" },
            });
            (p.summary);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
            ...{ class: "cat-card__foot" },
        });
        if (__VLS_ctx.toneLabel(p.scope_match_score)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cat-foot__chip cat-foot__chip--label" },
            });
            (__VLS_ctx.toneLabel(p.scope_match_score));
        }
        if (p.pros.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cat-foot__chip cat-foot__chip--pro" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "10",
                height: "10",
                viewBox: "0 0 12 12",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "2",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M6 1v10M1 6h10",
            });
            (p.pros.length);
        }
        if (p.cons.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cat-foot__chip cat-foot__chip--con" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "10",
                height: "10",
                viewBox: "0 0 12 12",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "2",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M1 6h10",
            });
            (p.cons.length);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "cat-foot__open" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "11",
            height: "11",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.8",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 7h8M7 3l4 4-4 4",
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "cat-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-empty__glyph" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "36",
        height: "36",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.4",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7l9-5 9 5M3 7l9 5 9-5M12 12v9",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "display-sans cat-empty__title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "cat-empty__body" },
    });
    if (__VLS_ctx.legacy.length) {
        (__VLS_ctx.legacy.length);
    }
    else {
    }
    if (__VLS_ctx.legacy.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-empty__chips" },
        });
        for (const [item, i] of __VLS_getVForSourceType((__VLS_ctx.legacy))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (i),
                ...{ class: "cat-tag" },
            });
            (item);
        }
    }
    if (__VLS_ctx.legacy.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.deepen) },
            type: "button",
            ...{ class: "btn btn-amber mt-6" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "btn-icon-nest" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "13",
            height: "13",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.8",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 7h8M7 3l4 4-4 4",
        });
    }
}
const __VLS_3 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
    to: "body",
}));
const __VLS_5 = __VLS_4({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_6.slots.default;
const __VLS_7 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
    name: "cat-modal",
}));
const __VLS_9 = __VLS_8({
    name: "cat-modal",
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
__VLS_10.slots.default;
if (__VLS_ctx.activeProduct && __VLS_ctx.activeIdx !== null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeProduct) },
        ...{ class: "cat-modal" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "cat-modal__scrim" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "cat-sheet" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "cat-sheet__head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (String(__VLS_ctx.activeIdx + 1).padStart(2, '0'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-sheet__page-sep" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (String(__VLS_ctx.detailed.length).padStart(2, '0'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__nav" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeProduct && __VLS_ctx.activeIdx !== null))
                    return;
                __VLS_ctx.navProduct(-1);
            } },
        ...{ class: "cat-sheet__navbtn" },
        'aria-label': "Sebelumnya",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.6",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M9 3 5 7l4 4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeProduct && __VLS_ctx.activeIdx !== null))
                    return;
                __VLS_ctx.navProduct(1);
            } },
        ...{ class: "cat-sheet__navbtn" },
        'aria-label': "Berikutnya",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.6",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m5 3 4 4-4 4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeProduct) },
        ...{ class: "cat-sheet__close" },
        'aria-label': "Tutup",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.8",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m3 3 8 8M11 3l-8 8",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "cat-sheet__left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__img-wrap" },
    });
    if (__VLS_ctx.activeProduct.image_url && !__VLS_ctx.productImgFailed.has(__VLS_ctx.activeIdx)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            ...{ onError: (...[$event]) => {
                    if (!(__VLS_ctx.activeProduct && __VLS_ctx.activeIdx !== null))
                        return;
                    if (!(__VLS_ctx.activeProduct.image_url && !__VLS_ctx.productImgFailed.has(__VLS_ctx.activeIdx)))
                        return;
                    __VLS_ctx.onProductImgErr(__VLS_ctx.activeIdx);
                } },
            src: (__VLS_ctx.activeProduct.image_url),
            alt: (__VLS_ctx.activeProduct.name),
            ...{ class: "cat-sheet__img" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-sheet__img cat-sheet__img--empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.initials(__VLS_ctx.activeProduct.name));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__ring" },
        'data-tone': (__VLS_ctx.scoreTone(__VLS_ctx.activeProduct.scope_match_score)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 120 120",
        width: "120",
        height: "120",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "60",
        cy: "60",
        r: "48",
        ...{ class: "cat-ring__bg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "60",
        cy: "60",
        r: "48",
        ...{ class: "cat-ring__bar cat-ring__bar--lg" },
        ...{ style: ({
                strokeDasharray: `${(__VLS_ctx.activeProduct.scope_match_score * 2 * Math.PI * 48).toFixed(2)} ${(2 * Math.PI * 48).toFixed(2)}`,
            }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__ring-num" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.pct(__VLS_ctx.activeProduct.scope_match_score));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-sheet__ring-unit" },
    });
    if (__VLS_ctx.toneLabel(__VLS_ctx.activeProduct.scope_match_score)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "cat-sheet__ring-label" },
        });
        (__VLS_ctx.toneLabel(__VLS_ctx.activeProduct.scope_match_score));
    }
    if (__VLS_ctx.activeProduct.category) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "cat-sheet__cat" },
        });
        (__VLS_ctx.activeProduct.category);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "cat-sheet__right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "cat-sheet__title" },
    });
    (__VLS_ctx.activeProduct.name);
    if (__VLS_ctx.activeProduct.summary) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "cat-sheet__summary" },
        });
        (__VLS_ctx.activeProduct.summary);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "cat-sheet__summary cat-sheet__summary--mute" },
        });
    }
    if (__VLS_ctx.activeProduct.scope_match_reason) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.blockquote, __VLS_intrinsicElements.blockquote)({
            ...{ class: "cat-sheet__reason" },
        });
        (__VLS_ctx.activeProduct.scope_match_reason);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__ledger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__col" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__col-head cat-sheet__col-head--pro" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-sheet__col-glyph" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "12",
        height: "12",
        viewBox: "0 0 12 12",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m2 6 3 3 5-7",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num cat-sheet__col-count" },
    });
    (__VLS_ctx.activeProduct.pros.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "cat-sheet__list" },
    });
    for (const [pro, i] of __VLS_getVForSourceType((__VLS_ctx.activeProduct.pros))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (`pro-${i}`),
            ...{ class: "cat-sheet__li cat-sheet__li--pro" },
            ...{ style: ({ animationDelay: (i * 60) + 'ms' }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "cat-sheet__li-bullet" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (pro);
    }
    if (!__VLS_ctx.activeProduct.pros.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            ...{ class: "cat-sheet__li-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__col" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-sheet__col-head cat-sheet__col-head--con" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-sheet__col-glyph" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "12",
        height: "12",
        viewBox: "0 0 12 12",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M1 6h10",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num cat-sheet__col-count" },
    });
    (__VLS_ctx.activeProduct.cons.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "cat-sheet__list" },
    });
    for (const [con, i] of __VLS_getVForSourceType((__VLS_ctx.activeProduct.cons))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (`con-${i}`),
            ...{ class: "cat-sheet__li cat-sheet__li--con" },
            ...{ style: ({ animationDelay: (i * 60) + 'ms' }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "cat-sheet__li-bullet" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (con);
    }
    if (!__VLS_ctx.activeProduct.cons.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            ...{ class: "cat-sheet__li-empty" },
        });
    }
    if (__VLS_ctx.activeProduct.matched_topics.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-sheet__topics" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cat-sheet__topic-chips" },
        });
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.activeProduct.matched_topics))) {
            /** @type {[typeof TagBadge, ]} */ ;
            // @ts-ignore
            const __VLS_11 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
                key: (t),
                raw: (t),
                size: "sm",
            }));
            const __VLS_12 = __VLS_11({
                key: (t),
                raw: (t),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "cat-sheet__foot" },
    });
    if (__VLS_ctx.activeProduct.source_url) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            href: (__VLS_ctx.activeProduct.source_url),
            target: "_blank",
            rel: "noopener",
            ...{ class: "btn btn-amber" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "btn-icon-nest" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "13",
            height: "13",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.8",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 9 9 5M5 5h4v4",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cat-sheet__hint" },
    });
}
var __VLS_10;
var __VLS_6;
/** @type {__VLS_StyleScopedClasses['cat-root']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['is-mounted']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cover__layout']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__unit']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit--empty']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__num--empty']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-fit__label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-prose']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-name']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-summary--mute']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['is-mounted']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__img']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__img-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__img-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bg']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__pct']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__body']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__cat']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__name']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__summary']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-card__foot']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip--label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip--pro']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__chip--con']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-foot__open']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-empty__glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-empty__title']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-empty__body']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-empty__chips']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-modal__scrim']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__head']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__page']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__page-sep']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__nav']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__navbtn']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__navbtn']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__close']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__body']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__left']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__img-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__img']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__img']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__img--empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bg']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-ring__bar--lg']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring-num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring-unit']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ring-label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__cat']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__right']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__title']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__summary']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__summary']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__summary--mute']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__reason']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__ledger']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-head']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-head--pro']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-count']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__list']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li--pro']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li-bullet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-head']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-head--con']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__col-count']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__list']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li--con']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li-bullet']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__li-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__topics']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__topic-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__foot']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-sheet__hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            TagBadge: TagBadge,
            detailed: detailed,
            legacy: legacy,
            hasDetailed: hasDetailed,
            overallScore: overallScore,
            overallPct: overallPct,
            focusSummary: focusSummary,
            doiTags: doiTags,
            vendorName: vendorName,
            pct: pct,
            scoreTone: scoreTone,
            toneLabel: toneLabel,
            initials: initials,
            productImgFailed: productImgFailed,
            onProductImgErr: onProductImgErr,
            activeIdx: activeIdx,
            activeProduct: activeProduct,
            openProduct: openProduct,
            closeProduct: closeProduct,
            navProduct: navProduct,
            mounted: mounted,
            deepen: deepen,
            RING_CIRC: RING_CIRC,
            onCardMove: onCardMove,
            onCardLeave: onCardLeave,
            tiltStyle: tiltStyle,
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
