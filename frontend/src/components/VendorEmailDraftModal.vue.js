/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { api } from '@/api/client';
const props = defineProps();
const emit = defineEmits();
const queryClient = useQueryClient();
const language = ref('en');
const subject = ref('');
const body = ref('');
const generating = ref(false);
const saving = ref(false);
const dirty = ref(false);
const ourContextOverride = ref('');
const showContextField = ref(false);
const vendorId = computed(() => props.vendor.vendor_id || props.vendor.domain || '');
const vendorName = computed(() => props.vendor.company_name || props.vendor.domain || 'Vendor');
const vendorDomain = computed(() => props.vendor.domain || 'tanpa-domain');
const initials = computed(() => {
    return vendorName.value
        .split(/[\s\-_·]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || '?';
});
const draftQ = useQuery({
    queryKey: computed(() => ['vendor', 'email-draft', vendorId.value, language.value]),
    queryFn: () => api.vendorEmailDraft.get(vendorId.value, language.value),
    enabled: computed(() => props.open && !!vendorId.value),
});
watch(() => draftQ.data.value, (d) => {
    if (!d)
        return;
    if (d.exists) {
        subject.value = d.subject || '';
        body.value = d.body || '';
    }
    else {
        subject.value = '';
        body.value = '';
    }
    dirty.value = false;
});
watch(() => props.open, (v) => {
    if (v) {
        if (typeof document !== 'undefined')
            document.body.style.overflow = 'hidden';
        language.value = 'en';
    }
    else {
        if (typeof document !== 'undefined')
            document.body.style.overflow = '';
    }
});
useEventListener('keydown', (e) => {
    if (!props.open)
        return;
    if (e.key === 'Escape') {
        emit('close');
        return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod)
        return;
    if (e.key === 'Enter') {
        e.preventDefault();
        void save();
    }
    if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        void generate();
    }
});
const existingMeta = computed(() => {
    const d = draftQ.data.value;
    if (!d || !d.exists)
        return null;
    return {
        updated_at: d.updated_at || null,
        edited_manually: d.edited_manually,
        model_used: d.model_used || null,
    };
});
const wordCount = computed(() => {
    if (!body.value)
        return 0;
    return body.value.split(/\s+/).filter(Boolean).length;
});
const charCount = computed(() => body.value.length);
async function generate() {
    if (!vendorId.value || generating.value)
        return;
    generating.value = true;
    try {
        const result = await api.vendorEmailDraft.generate(vendorId.value, {
            language: language.value,
            our_context: ourContextOverride.value.trim() || null,
        });
        subject.value = result.subject;
        body.value = result.body;
        dirty.value = false;
        queryClient.invalidateQueries({ queryKey: ['vendor', 'email-draft', vendorId.value, language.value] });
        toast.success('Draft email tergenerate', {
            description: `Bahasa ${language.value === 'en' ? 'Inggris' : 'Indonesia'}, tersimpan ke DB`,
        });
    }
    catch (e) {
        const err = e;
        toast.error('Gagal generate draft', {
            description: err.response?.data?.detail ?? 'Periksa Ollama atau log API.',
        });
    }
    finally {
        generating.value = false;
    }
}
async function save() {
    if (!vendorId.value || saving.value)
        return;
    if (!subject.value.trim() || !body.value.trim()) {
        toast.warning('Subject dan body tidak boleh kosong');
        return;
    }
    saving.value = true;
    try {
        await api.vendorEmailDraft.save(vendorId.value, { subject: subject.value, body: body.value }, language.value);
        dirty.value = false;
        queryClient.invalidateQueries({ queryKey: ['vendor', 'email-draft', vendorId.value, language.value] });
        toast.success('Edit tersimpan', { description: 'Ditandai sebagai manual edit.' });
    }
    catch (e) {
        const err = e;
        toast.error('Gagal simpan draft', {
            description: err.response?.data?.detail ?? 'Cek koneksi backend.',
        });
    }
    finally {
        saving.value = false;
    }
}
async function copyAll() {
    if (!subject.value && !body.value)
        return;
    const text = `Subject: ${subject.value}\n\n${body.value}`;
    try {
        await navigator.clipboard.writeText(text);
        toast.success('Tersalin ke clipboard');
    }
    catch {
        toast.error('Gagal menyalin');
    }
}
function onEdit() { dirty.value = true; }
function fmtTs(iso) {
    if (!iso)
        return '—';
    try {
        return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    }
    catch {
        return iso;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ed-lang__btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-lang__btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-close']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__logo']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__domain']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ctx__toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ctx__textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-modal-enter-active']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-modal-leave-active']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-modal-enter-from']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-modal-leave-to']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker__left']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker__msg']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-lang']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-close']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__skel-line']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    name: "ed-modal",
}));
const __VLS_6 = __VLS_5({
    name: "ed-modal",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.emit('close');
            } },
        ...{ class: "ed-modal" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "ed-modal__scrim" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ onClick: () => { } },
        ...{ class: "ed-sheet" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "ed-ticker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-ticker__left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "dot" },
        ...{ class: (__VLS_ctx.generating ? 'dot-amber dot-glow' : (__VLS_ctx.dirty ? 'dot-amber' : 'dot-mute')) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-ticker__tag num" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-ticker__msg" },
    });
    (__VLS_ctx.vendorName.toUpperCase());
    (__VLS_ctx.generating ? 'AI MENULIS' : (__VLS_ctx.dirty ? 'BELUM TERSIMPAN' : (__VLS_ctx.existingMeta ? 'TERSIMPAN' : 'BARU')));
    (__VLS_ctx.language === 'en' ? 'BAHASA INGGRIS' : 'BAHASA INDONESIA');
    if (__VLS_ctx.existingMeta?.model_used) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-ticker__stamp" },
        });
        (__VLS_ctx.existingMeta.model_used);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-lang" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.language = 'en';
            } },
        type: "button",
        ...{ class: "ed-lang__btn" },
        ...{ class: ({ 'is-active': __VLS_ctx.language === 'en' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.language = 'id';
            } },
        type: "button",
        ...{ class: "ed-lang__btn" },
        ...{ class: ({ 'is-active': __VLS_ctx.language === 'id' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.emit('close');
            } },
        ...{ class: "ed-close" },
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
        ...{ class: "ed-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "ed-rail" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-capsule" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-capsule__logo" },
    });
    if (__VLS_ctx.vendor.logo_url) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.vendor.logo_url),
            alt: (`Logo ${__VLS_ctx.vendorName}`),
            referrerpolicy: "no-referrer",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-capsule__initials" },
        });
        (__VLS_ctx.initials);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-capsule__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow eyebrow-accent" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "ed-capsule__name" },
    });
    (__VLS_ctx.vendorName);
    if (__VLS_ctx.vendor.canonical_url) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            href: (__VLS_ctx.vendor.canonical_url),
            target: "_blank",
            rel: "noopener noreferrer",
            ...{ class: "ed-capsule__domain" },
        });
        (__VLS_ctx.vendorDomain);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-capsule__domain ed-capsule__domain--mute" },
        });
        (__VLS_ctx.vendorDomain);
    }
    if (__VLS_ctx.vendor.domain_of_interest?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ed-capsule__chips" },
        });
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.vendor.domain_of_interest.slice(0, 4)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (t),
                ...{ class: "ed-chip" },
            });
            (t);
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-meta" },
    });
    if (__VLS_ctx.draftQ.isPending.value) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ed-meta__row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "14",
            height: "14",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
            cx: "7",
            cy: "7",
            r: "5",
            'stroke-dasharray': "4 4",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.animateTransform)({
            attributeName: "transform",
            type: "rotate",
            from: "0 7 7",
            to: "360 7 7",
            dur: "1s",
            repeatCount: "indefinite",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__sub" },
        });
    }
    else if (__VLS_ctx.existingMeta) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ed-meta__row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__icon" },
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ellipse)({
            cx: "7",
            cy: "3.5",
            rx: "5",
            ry: "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M2 3.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M2 7c0 1.1 2.2 2 5 2s5-.9 5-2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__sub" },
        });
        (__VLS_ctx.fmtTs(__VLS_ctx.existingMeta.updated_at));
        if (__VLS_ctx.existingMeta.edited_manually) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ed-meta__row ed-meta__row--amber" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ed-meta__icon" },
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
                d: "m9 2 3 3-7 7-3 .5L2.5 9z",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ed-meta__label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ed-meta__sub" },
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ed-meta__row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__icon" },
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "7",
            cy: "7",
            r: "5.5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M7 4.5v3M7 9.5v.01",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-meta__sub" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-ctx" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.showContextField = !__VLS_ctx.showContextField;
            } },
        type: "button",
        ...{ class: "ed-ctx__toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "12",
        height: "12",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.6",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
        ...{ style: ({ transform: __VLS_ctx.showContextField ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 240ms cubic-bezier(0.32,0.72,0,1)' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m5 3 4 4-4 4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
        ...{ style: {} },
    });
    const __VLS_8 = {}.Transition;
    /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        name: "ed-ctx-expand",
    }));
    const __VLS_10 = __VLS_9({
        name: "ed-ctx-expand",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    if (__VLS_ctx.showContextField) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
            value: (__VLS_ctx.ourContextOverride),
            rows: "4",
            ...{ class: "ed-ctx__textarea" },
            placeholder: "Default: 'We're a technology consortium mapping the industrial ecosystem'. Tulis di sini untuk override apa yang AI gunakan sebagai 'kita'.",
        });
    }
    var __VLS_11;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.generate) },
        type: "button",
        ...{ class: "ed-generate" },
        disabled: (__VLS_ctx.generating),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-generate__icon" },
    });
    if (!__VLS_ctx.generating) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8 2v3M8 11v3M2 8h3M11 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
            'stroke-linecap': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
            cx: "8",
            cy: "8",
            r: "6",
            'stroke-dasharray': "9 12",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.animateTransform)({
            attributeName: "transform",
            type: "rotate",
            from: "0 8 8",
            to: "360 8 8",
            dur: "1s",
            repeatCount: "indefinite",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-generate__copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-generate__title" },
    });
    (__VLS_ctx.generating ? 'Sedang Generate…' : (__VLS_ctx.existingMeta ? 'Regenerate' : 'Generate Draft'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-generate__sub" },
    });
    (__VLS_ctx.generating ? 'Ollama bekerja, tunggu sebentar' : 'AI tulis subject + body baru');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "12",
        height: "12",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M3 7h8M7 3l4 4-4 4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-kbd" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-kbd__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
        ...{ class: "ed-kbd__key" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
        ...{ class: "ed-kbd__key" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-kbd__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
        ...{ class: "ed-kbd__key" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
        ...{ class: "ed-kbd__key" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-kbd__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
        ...{ class: "ed-kbd__key" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "ed-canvas" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-canvas__paper" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-envelope" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-envelope__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-envelope__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-envelope__val" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-envelope__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-envelope__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-envelope__val" },
    });
    (__VLS_ctx.vendorName);
    (__VLS_ctx.vendorDomain);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-subject" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "ed-subject__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (__VLS_ctx.onEdit) },
        value: (__VLS_ctx.subject),
        type: "text",
        ...{ class: "ed-subject__input" },
        disabled: (__VLS_ctx.generating),
        placeholder: "Subject email akan muncul di sini…",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-body-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        ...{ onInput: (__VLS_ctx.onEdit) },
        value: (__VLS_ctx.body),
        ...{ class: "ed-body-field__textarea" },
        disabled: (__VLS_ctx.generating),
        placeholder: "Tekan Generate untuk membuat email outreach. AI akan menyusun pengantar industrial yang memperkenalkan inisiatif kita dan mengajak vendor berkolaborasi.",
    });
    if (__VLS_ctx.generating && !__VLS_ctx.body) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ed-body-field__skel" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-body-field__skel-line" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-body-field__skel-line" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-body-field__skel-line" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-body-field__skel-line" },
            ...{ style: {} },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-counter" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.wordCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-counter__sep" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.charCount);
    if (__VLS_ctx.dirty) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ed-counter__dirty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "live-dot" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "ed-foot" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ed-foot__meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.existingMeta ? `Last save · ${__VLS_ctx.fmtTs(__VLS_ctx.existingMeta.updated_at)}` : 'Belum pernah disimpan');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ed-foot__btns" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.copyAll) },
        type: "button",
        ...{ class: "btn btn-ghost btn-sm" },
        disabled: (!__VLS_ctx.subject && !__VLS_ctx.body),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "11",
        height: "11",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "3",
        y: "3",
        width: "8",
        height: "8",
        rx: "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.save) },
        type: "button",
        ...{ class: "btn btn-amber" },
        disabled: (__VLS_ctx.saving || !__VLS_ctx.dirty),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.saving ? 'Menyimpan…' : 'Simpan');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    if (!__VLS_ctx.saving) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "12",
            height: "12",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.8",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 12h8M7 2v8m0 0-3-3m3 3 3-3",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "12",
            height: "12",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
            cx: "7",
            cy: "7",
            r: "5",
            'stroke-dasharray': "8 12",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.animateTransform)({
            attributeName: "transform",
            type: "rotate",
            from: "0 7 7",
            to: "360 7 7",
            dur: "1s",
            repeatCount: "indefinite",
        });
    }
}
var __VLS_7;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['ed-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-modal__scrim']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker__left']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker__tag']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker__msg']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ticker__stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-lang']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-lang__btn']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-lang__btn']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-close']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__logo']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__initials']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__body']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__name']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__domain']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__domain']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__domain--mute']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-capsule__chips']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row--amber']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-meta__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ctx']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ctx__toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-ctx__textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate__title']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-generate__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__key']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__key']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__key']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__key']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-kbd__key']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-canvas__paper']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__val']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-envelope__val']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject__label']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-subject__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__skel']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__skel-line']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__skel-line']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__skel-line']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-body-field__skel-line']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-counter']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-counter__sep']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-counter__dirty']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-foot__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['ed-foot__btns']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            language: language,
            subject: subject,
            body: body,
            generating: generating,
            saving: saving,
            dirty: dirty,
            ourContextOverride: ourContextOverride,
            showContextField: showContextField,
            vendorName: vendorName,
            vendorDomain: vendorDomain,
            initials: initials,
            draftQ: draftQ,
            existingMeta: existingMeta,
            wordCount: wordCount,
            charCount: charCount,
            generate: generate,
            save: save,
            copyAll: copyAll,
            onEdit: onEdit,
            fmtTs: fmtTs,
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
