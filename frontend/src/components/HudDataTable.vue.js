/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
export default ((__VLS_props, __VLS_ctx, __VLS_expose, __VLS_setup = (async () => {
    const props = withDefaults(defineProps(), { emptyMessage: 'Tidak ada data.', dense: true });
    const cellPadding = computed(() => (props.dense ? 'px-3 py-1.5' : 'px-3 py-2.5'));
    function alignClass(col) {
        if (col.align === 'right')
            return 'text-right';
        if (col.align === 'center')
            return 'text-center';
        return 'text-left';
    }
    debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
    const __VLS_withDefaultsArg = (function (t) { return t; })({ emptyMessage: 'Tidak ada data.', dense: true });
    const __VLS_fnComponent = (await import('vue')).defineComponent({});
    const __VLS_ctx = {};
    let __VLS_components;
    let __VLS_directives;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "overflow-x-auto" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "hud-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    for (const [col] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            key: (col.key),
            ...{ style: (col.width ? { width: col.width } : {}) },
            ...{ class: ([__VLS_ctx.alignClass(col)]) },
        });
        (col.label);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [row] of __VLS_getVForSourceType((__VLS_ctx.rows))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.onRowClick?.(row);
                } },
            key: (__VLS_ctx.rowKey(row)),
            ...{ class: ([__VLS_ctx.onRowClick ? 'cursor-pointer' : '']) },
        });
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                key: (col.key),
                ...{ class: ([__VLS_ctx.alignClass(col), __VLS_ctx.cellPadding]) },
            });
            var __VLS_0 = {
                row: (row),
                value: (row[col.key]),
            };
            var __VLS_1 = __VLS_tryAsConstant(`cell-${col.key}`);
            (col.render ? col.render(row) : row[col.key]);
        }
    }
    if (__VLS_ctx.rows.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            colspan: (__VLS_ctx.columns.length),
            ...{ class: "px-3 py-8 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
        });
        (__VLS_ctx.emptyMessage);
    }
    /** @type {__VLS_StyleScopedClasses['overflow-x-auto']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-3']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
    /** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
    /** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
    /** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
    // @ts-ignore
    var __VLS_2 = __VLS_1, __VLS_3 = __VLS_0;
    var __VLS_dollars;
    const __VLS_self = (await import('vue')).defineComponent({
        setup() {
            return {
                cellPadding: cellPadding,
                alignClass: alignClass,
            };
        },
        __typeProps: {},
        props: {},
    });
    return {};
})()) => ({})); /* PartiallyEnd: #4569/main.vue */
