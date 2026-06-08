/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, reactive, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import HudPanel from '@/components/HudPanel.vue';
import HudStatusPill from '@/components/HudStatusPill.vue';
import HudFlowNode from '@/components/HudFlowNode.vue';
import HudFlowSubNode from '@/components/HudFlowSubNode.vue';
import { api } from '@/api/client';
const stateQ = useQuery({
    queryKey: ['orchestrator', 'state'],
    queryFn: api.orchestrator.state,
    refetchInterval: 2000,
});
const since = ref('0');
const events = ref([]);
const MAX_EVENTS = 200;
const SUBTASK_TTL_MS = 45_000;
const COMPLETED_TTL_MS = 12_000;
const MAX_SUBTASKS_PER_PARENT = 10;
const SUB_W = 150;
const SUB_H = 70;
const SUB_X_OFFSET = 36;
const MASTER_ROW_Y = 60;
const SUB_LANE_Y_OFFSET = 220;
const eventsQ = useQuery({
    queryKey: ['orchestrator', 'events', since],
    queryFn: () => api.orchestrator.events(since.value, 50),
    refetchInterval: 1500,
});
const subtasks = reactive(new Map());
const orderCounters = reactive(new Map());
const customPositions = reactive(new Map());
// Master columns in pipeline order. The backend ships variable y values, but
// for visual clarity we render every master in a single row at y = MASTER_ROW_Y
// and let each master's sub-tasks fill the lane directly below it.
const MASTER_COLUMNS = [
    'discover',
    'worker_extract',
    'worker_pdf_extract',
    'worker_resolve',
    'worker_enrich',
    'finalize',
];
const MASTER_X_GAP = 280;
const stageMeta = {
    discover: { code: 'DSC', abbr: 'DISC' },
    worker_extract: { code: 'XTR', abbr: 'XTR' },
    worker_pdf_extract: { code: 'PDF', abbr: 'PDF' },
    worker_resolve: { code: 'RSV', abbr: 'RSV' },
    worker_enrich: { code: 'ENR', abbr: 'ENR' },
    finalize: { code: 'FIN', abbr: 'FIN' },
};
function deriveSubId(ev) {
    const p = ev.payload || {};
    if (ev.node === 'discover' || ev.node === 'finalize')
        return null;
    if (ev.node === 'worker_extract' || ev.node === 'worker_pdf_extract') {
        return p.expo_id || null;
    }
    if (ev.node === 'worker_resolve') {
        return p.name || p.domain || null;
    }
    if (ev.node === 'worker_enrich') {
        return p.domain || null;
    }
    return null;
}
function deriveLabel(_ev, subId) {
    return subId.length > 22 ? subId.slice(0, 20) + '..' : subId;
}
function deriveSubLabel(ev) {
    const p = ev.payload || {};
    const parts = [];
    if (typeof p.refs === 'number')
        parts.push(`refs=${p.refs}`);
    if (typeof p.pdfs === 'number')
        parts.push(`pdfs=${p.pdfs}`);
    if (typeof p.outcome === 'string')
        parts.push(String(p.outcome));
    if (typeof p.reason === 'string')
        parts.push(String(p.reason).slice(0, 16));
    if (typeof p.domain === 'string' && ev.node === 'worker_resolve')
        parts.push(String(p.domain));
    return parts.slice(0, 2).join(' | ');
}
function statusFromEvent(kind) {
    if (kind === 'completed')
        return 'ok';
    if (kind === 'failed')
        return 'crit';
    if (kind === 'started')
        return 'active';
    return 'idle';
}
function masterColumnIndex(parent) {
    const idx = MASTER_COLUMNS.indexOf(parent);
    return idx === -1 ? 0 : idx;
}
function gridPositionFor(parent, orderIndex) {
    // Flowy serpentine: stack vertically under the master, with a small sine
    // x-offset so consecutive subs alternate. Master node is 240px wide, so
    // master_center_x = col * MASTER_X_GAP + 120. Sub width is 155, so sub
    // top-left = master_center_x - SUB_W/2 + offset.
    const colIdx = masterColumnIndex(parent);
    const masterCenterX = colIdx * MASTER_X_GAP + 120;
    const wave = Math.sin(orderIndex * 0.9) * SUB_X_OFFSET;
    return {
        x: masterCenterX - SUB_W / 2 + wave,
        y: MASTER_ROW_Y + SUB_LANE_Y_OFFSET + orderIndex * SUB_H,
    };
}
function ingestEvents(batch) {
    const now = Date.now();
    for (const ev of batch) {
        const subId = deriveSubId(ev);
        if (!subId)
            continue;
        const id = `${ev.node}:${subId}`;
        const existing = subtasks.get(id);
        const evMs = ev.ts > 1e12 ? ev.ts : ev.ts * 1000;
        const status = statusFromEvent(ev.event);
        const meta = stageMeta[ev.node] || { code: 'NODE', abbr: ev.node.toUpperCase().slice(0, 4) };
        const payloadExcerpt = JSON.stringify(ev.payload || {}).slice(0, 120);
        if (existing) {
            existing.status = status;
            existing.last_at = evMs || now;
            const merged = deriveSubLabel(ev);
            if (merged)
                existing.sub_label = merged;
            existing.payload_excerpt = payloadExcerpt;
            existing.history.unshift({ event: ev.event, ts: evMs || now, payload_excerpt: payloadExcerpt });
            if (existing.history.length > 12)
                existing.history.length = 12;
        }
        else {
            const orderIndex = orderCounters.get(ev.node) ?? 0;
            orderCounters.set(ev.node, orderIndex + 1);
            subtasks.set(id, {
                id,
                parent: ev.node,
                label: deriveLabel(ev, subId),
                sub_label: deriveSubLabel(ev),
                status,
                code: `${meta.code}-${String(orderIndex + 1).padStart(3, '0')}`,
                created_at: evMs || now,
                last_at: evMs || now,
                order_index: orderIndex,
                payload_excerpt: payloadExcerpt,
                history: [{ event: ev.event, ts: evMs || now, payload_excerpt: payloadExcerpt }],
            });
        }
    }
    // Rolling window: keep at most MAX_SUBTASKS_PER_PARENT visible per master.
    // Eviction priority: ok > idle > crit > active (drop completed first).
    const perParent = {};
    for (const s of subtasks.values()) {
        if (!perParent[s.parent])
            perParent[s.parent] = [];
        perParent[s.parent].push(s);
    }
    const evictWeight = { ok: 0, idle: 1, crit: 2, active: 3 };
    for (const parent of Object.keys(perParent)) {
        const list = perParent[parent];
        if (list.length <= MAX_SUBTASKS_PER_PARENT)
            continue;
        list.sort((a, b) => {
            const w = evictWeight[a.status] - evictWeight[b.status];
            return w !== 0 ? w : a.last_at - b.last_at;
        });
        const toRemove = list.length - MAX_SUBTASKS_PER_PARENT;
        for (let i = 0; i < toRemove; i++) {
            subtasks.delete(list[i].id);
            customPositions.delete(list[i].id);
        }
    }
}
function pruneStale() {
    const now = Date.now();
    for (const [id, s] of subtasks) {
        const age = now - s.last_at;
        if (s.status === 'ok' && age > COMPLETED_TTL_MS) {
            subtasks.delete(id);
            customPositions.delete(id);
        }
        else if (age > SUBTASK_TTL_MS) {
            subtasks.delete(id);
            customPositions.delete(id);
        }
    }
}
setInterval(pruneStale, 5000);
watch(() => eventsQ.data.value, (resp) => {
    if (!resp)
        return;
    if (resp.events.length > 0) {
        events.value = [...resp.events.slice().reverse(), ...events.value].slice(0, MAX_EVENTS);
        since.value = resp.next_since;
        ingestEvents(resp.events);
    }
});
const masterNodes = computed(() => {
    const data = stateQ.data.value;
    if (!data)
        return [];
    return data.nodes.map((n) => {
        const colIdx = MASTER_COLUMNS.indexOf(n.id);
        const x = colIdx === -1 ? n.x : colIdx * MASTER_X_GAP;
        const y = colIdx === -1 ? n.y : MASTER_ROW_Y;
        const custom = customPositions.get(n.id);
        return {
            id: n.id,
            type: 'hud',
            position: custom || { x, y },
            draggable: true,
            data: {
                code: n.code,
                label: n.label,
                description: n.description,
                active: n.active,
                completed: n.completed,
                failed: n.failed,
                lastEventAt: n.last_event_at,
                kind: 'master',
            },
        };
    });
});
const subtaskNodes = computed(() => {
    const list = Array.from(subtasks.values());
    return list.map((s) => {
        const custom = customPositions.get(s.id);
        const grid = gridPositionFor(s.parent, s.order_index);
        return {
            id: s.id,
            type: 'sub',
            position: custom || grid,
            draggable: true,
            data: {
                label: s.label,
                sub_label: s.sub_label,
                status: s.status,
                code: s.code,
                payload_excerpt: s.payload_excerpt,
            },
        };
    });
});
const allNodes = computed(() => [...masterNodes.value, ...subtaskNodes.value]);
const masterEdges = computed(() => {
    const data = stateQ.data.value;
    if (!data)
        return [];
    const activeNodes = new Set(data.nodes.filter((n) => n.active > 0).map((n) => n.id));
    return data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: activeNodes.has(e.source) || activeNodes.has(e.target),
        type: 'smoothstep',
        style: {
            stroke: activeNodes.has(e.source) ? '#FFB800' : '#5C6878',
            strokeWidth: activeNodes.has(e.source) ? 2.5 : 1.4,
        },
    }));
});
const subtaskEdges = computed(() => {
    // Chain edges: master → sub0 → sub1 → sub2 → ... so the lane reads like a flowing
    // pipeline of work units rather than a starburst from the master node.
    const grouped = new Map();
    for (const s of subtasks.values()) {
        if (!grouped.has(s.parent))
            grouped.set(s.parent, []);
        grouped.get(s.parent).push(s);
    }
    const edges = [];
    for (const [parent, list] of grouped) {
        list.sort((a, b) => a.order_index - b.order_index);
        let prev = parent;
        for (const s of list) {
            edges.push({
                id: `e-${s.id}`,
                source: prev,
                target: s.id,
                animated: s.status === 'active',
                type: 'smoothstep',
                style: {
                    stroke: s.status === 'crit' ? '#EF4444' : s.status === 'active' ? '#FFB800' : s.status === 'ok' ? '#22C55E' : '#3a4453',
                    strokeWidth: s.status === 'active' ? 1.6 : 0.9,
                    opacity: s.status === 'ok' ? 0.5 : 0.85,
                },
            });
            prev = s.id;
        }
    }
    return edges;
});
const allEdges = computed(() => [...masterEdges.value, ...subtaskEdges.value]);
const totalActive = computed(() => {
    const data = stateQ.data.value;
    if (!data)
        return 0;
    return data.nodes.reduce((sum, n) => sum + (n.active ?? 0), 0);
});
const totalCompleted = computed(() => {
    const data = stateQ.data.value;
    if (!data)
        return 0;
    return data.nodes.reduce((sum, n) => sum + (n.completed ?? 0), 0);
});
const totalFailed = computed(() => {
    const data = stateQ.data.value;
    if (!data)
        return 0;
    return data.nodes.reduce((sum, n) => sum + (n.failed ?? 0), 0);
});
const subtaskCount = computed(() => subtasks.size);
const { fitView, onNodeDragStop } = useVueFlow();
onNodeDragStop((event) => {
    const node = event.node;
    if (!node)
        return;
    customPositions.set(node.id, { x: node.position.x, y: node.position.y });
});
const selectedId = ref(null);
const selectedNode = computed(() => {
    if (!selectedId.value)
        return null;
    if (subtasks.has(selectedId.value)) {
        const s = subtasks.get(selectedId.value);
        return {
            kind: 'sub',
            id: s.id,
            parent: s.parent,
            label: s.label,
            sub_label: s.sub_label,
            status: s.status,
            code: s.code,
            created_at: s.created_at,
            last_at: s.last_at,
            payload_excerpt: s.payload_excerpt,
            history: s.history,
        };
    }
    const data = stateQ.data.value;
    if (data) {
        const m = data.nodes.find((n) => n.id === selectedId.value);
        if (m) {
            const subList = Array.from(subtasks.values()).filter((s) => s.parent === m.id);
            const breakdown = {
                active: subList.filter((s) => s.status === 'active').length,
                ok: subList.filter((s) => s.status === 'ok').length,
                crit: subList.filter((s) => s.status === 'crit').length,
                total: subList.length,
            };
            return {
                kind: 'master',
                id: m.id,
                label: m.label,
                code: m.code,
                description: m.description,
                active: m.active,
                completed: m.completed,
                failed: m.failed,
                breakdown,
                recent_subs: subList
                    .slice()
                    .sort((a, b) => b.last_at - a.last_at)
                    .slice(0, 8)
                    .map((s) => ({
                    id: s.id,
                    label: s.label,
                    sub_label: s.sub_label,
                    status: s.status,
                    last_at: s.last_at,
                })),
            };
        }
    }
    return null;
});
function onNodeClick({ node }) {
    selectedId.value = node.id;
}
function clearSelection() {
    selectedId.value = null;
}
function resetLayout() {
    customPositions.clear();
    setTimeout(() => fitView({ padding: 0.18 }), 80);
}
function onCanvasReady() {
    setTimeout(() => fitView({ padding: 0.2 }), 50);
}
watch(() => masterNodes.value.length, (n) => {
    if (n > 0) {
        setTimeout(() => fitView({ padding: 0.18 }), 100);
    }
});
function eventTone(kind) {
    if (kind === 'completed')
        return 'ok';
    if (kind === 'failed')
        return 'crit';
    if (kind === 'started')
        return 'warn';
    return 'info';
}
function statusTone(status) {
    if (status === 'ok')
        return 'ok';
    if (status === 'active')
        return 'warn';
    if (status === 'crit')
        return 'crit';
    return 'muted';
}
function statusLabel(status) {
    if (status === 'ok')
        return 'SELESAI';
    if (status === 'active')
        return 'AKTIF';
    if (status === 'crit')
        return 'GAGAL';
    return 'IDLE';
}
function formatRelTime(ts) {
    const tsMs = ts > 1e12 ? ts : ts * 1000;
    const diff = (Date.now() - tsMs) / 1000;
    if (diff < 1)
        return 'baru saja';
    if (diff < 60)
        return `${Math.floor(diff)}s lalu`;
    if (diff < 3600)
        return `${Math.floor(diff / 60)}m lalu`;
    return `${Math.floor(diff / 3600)}j lalu`;
}
function payloadSummary(ev) {
    const p = ev.payload || {};
    const keys = Object.keys(p);
    if (keys.length === 0)
        return '';
    return keys
        .slice(0, 3)
        .map((k) => `${k}=${String(p[k]).slice(0, 40)}`)
        .join(' ');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-full flex-col gap-3 p-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.totalActive > 0 ? 'warn' : 'muted'),
    label: (`${__VLS_ctx.totalActive} AKTIF`),
    pulse: (__VLS_ctx.totalActive > 0),
}));
const __VLS_1 = __VLS_0({
    tone: (__VLS_ctx.totalActive > 0 ? 'warn' : 'muted'),
    label: (`${__VLS_ctx.totalActive} AKTIF`),
    pulse: (__VLS_ctx.totalActive > 0),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: "ok",
    label: (`${__VLS_ctx.totalCompleted} OK`),
}));
const __VLS_4 = __VLS_3({
    tone: "ok",
    label: (`${__VLS_ctx.totalCompleted} OK`),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.totalFailed > 0 ? 'crit' : 'muted'),
    label: (`${__VLS_ctx.totalFailed} GAGAL`),
}));
const __VLS_7 = __VLS_6({
    tone: (__VLS_ctx.totalFailed > 0 ? 'crit' : 'muted'),
    label: (`${__VLS_ctx.totalFailed} GAGAL`),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.subtaskCount > 0 ? 'accent' : 'muted'),
    label: (`${__VLS_ctx.subtaskCount} TASK`),
}));
const __VLS_10 = __VLS_9({
    tone: (__VLS_ctx.subtaskCount > 0 ? 'accent' : 'muted'),
    label: (`${__VLS_ctx.subtaskCount} TASK`),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.resetLayout) },
    ...{ class: "hud-btn-ghost h-7" },
});
const __VLS_12 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    icon: (['fas', 'arrows-rotate']),
    ...{ class: "text-2xs" },
}));
const __VLS_14 = __VLS_13({
    icon: (['fas', 'arrows-rotate']),
    ...{ class: "text-2xs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12" },
});
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Peta Workflow",
    code: "GRAPH",
    ...{ class: "lg:col-span-9" },
}));
const __VLS_17 = __VLS_16({
    title: "Peta Workflow",
    code: "GRAPH",
    ...{ class: "lg:col-span-9" },
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_18.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_18.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops text-accent-600 dark:text-accent-300" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orchestrator-canvas relative h-[900px] w-full border border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-950" },
});
const __VLS_19 = {}.VueFlow;
/** @type {[typeof __VLS_components.VueFlow, typeof __VLS_components.VueFlow, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    ...{ 'onNodeClick': {} },
    ...{ 'onPaneClick': {} },
    ...{ 'onNodesInitialized': {} },
    nodes: (__VLS_ctx.allNodes),
    edges: (__VLS_ctx.allEdges),
    minZoom: (0.1),
    maxZoom: (4),
    fitViewOnInit: (true),
    nodesDraggable: (true),
    nodesConnectable: (false),
    elementsSelectable: (true),
    onlyRenderVisibleElements: (false),
    panOnDrag: (true),
    zoomOnScroll: (true),
    defaultEdgeOptions: ({ type: 'smoothstep' }),
}));
const __VLS_21 = __VLS_20({
    ...{ 'onNodeClick': {} },
    ...{ 'onPaneClick': {} },
    ...{ 'onNodesInitialized': {} },
    nodes: (__VLS_ctx.allNodes),
    edges: (__VLS_ctx.allEdges),
    minZoom: (0.1),
    maxZoom: (4),
    fitViewOnInit: (true),
    nodesDraggable: (true),
    nodesConnectable: (false),
    elementsSelectable: (true),
    onlyRenderVisibleElements: (false),
    panOnDrag: (true),
    zoomOnScroll: (true),
    defaultEdgeOptions: ({ type: 'smoothstep' }),
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
let __VLS_23;
let __VLS_24;
let __VLS_25;
const __VLS_26 = {
    onNodeClick: (__VLS_ctx.onNodeClick)
};
const __VLS_27 = {
    onPaneClick: (__VLS_ctx.clearSelection)
};
const __VLS_28 = {
    onNodesInitialized: (__VLS_ctx.onCanvasReady)
};
__VLS_22.slots.default;
{
    const { 'node-hud': __VLS_thisSlot } = __VLS_22.slots;
    const [props] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof HudFlowNode, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(HudFlowNode, new HudFlowNode({
        ...(props),
    }));
    const __VLS_30 = __VLS_29({
        ...(props),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
{
    const { 'node-sub': __VLS_thisSlot } = __VLS_22.slots;
    const [props] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof HudFlowSubNode, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(HudFlowSubNode, new HudFlowSubNode({
        ...(props),
    }));
    const __VLS_33 = __VLS_32({
        ...(props),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
}
const __VLS_35 = {}.Background;
/** @type {[typeof __VLS_components.Background, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    patternColor: "#5C6878",
    gap: (24),
    size: (1),
}));
const __VLS_37 = __VLS_36({
    patternColor: "#5C6878",
    gap: (24),
    size: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
const __VLS_39 = {}.Controls;
/** @type {[typeof __VLS_components.Controls, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    position: "top-left",
    showZoom: (true),
    showFitView: (true),
    showInteractive: (false),
}));
const __VLS_41 = __VLS_40({
    position: "top-left",
    showZoom: (true),
    showFitView: (true),
    showInteractive: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
const __VLS_43 = {}.MiniMap;
/** @type {[typeof __VLS_components.MiniMap, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    pannable: true,
    zoomable: true,
    position: "bottom-right",
}));
const __VLS_45 = __VLS_44({
    pannable: true,
    zoomable: true,
    position: "bottom-right",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
var __VLS_22;
var __VLS_18;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-3 lg:col-span-3" },
});
if (__VLS_ctx.selectedNode) {
    /** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
        title: (__VLS_ctx.selectedNode.kind === 'master' ? `Stage ${__VLS_ctx.selectedNode.code}` : 'Sub-Task'),
        code: (__VLS_ctx.selectedNode.kind === 'master' ? 'DETAIL' : 'TASK'),
    }));
    const __VLS_48 = __VLS_47({
        title: (__VLS_ctx.selectedNode.kind === 'master' ? `Stage ${__VLS_ctx.selectedNode.code}` : 'Sub-Task'),
        code: (__VLS_ctx.selectedNode.kind === 'master' ? 'DETAIL' : 'TASK'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_47));
    __VLS_49.slots.default;
    {
        const { actions: __VLS_thisSlot } = __VLS_49.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clearSelection) },
            ...{ class: "hud-btn-ghost h-6 px-1.5" },
        });
        const __VLS_50 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
            icon: (['fas', 'xmark']),
            ...{ class: "text-2xs" },
        }));
        const __VLS_52 = __VLS_51({
            icon: (['fas', 'xmark']),
            ...{ class: "text-2xs" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    }
    if (__VLS_ctx.selectedNode.kind === 'master') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "font-mono text-xs uppercase tracking-ops text-base-700 dark:text-base-200" },
        });
        (__VLS_ctx.selectedNode.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-2xs leading-relaxed text-base-500 dark:text-base-400" },
        });
        (__VLS_ctx.selectedNode.description);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-3 gap-1 border-t border-base-200 pt-2 dark:border-base-700" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col items-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-base font-semibold text-warn-600 dark:text-warn-400" },
        });
        (__VLS_ctx.selectedNode.active);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col items-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-base font-semibold text-ok-600 dark:text-ok-400" },
        });
        (__VLS_ctx.selectedNode.completed);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col items-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-base font-semibold text-crit-600 dark:text-crit-400" },
        });
        (__VLS_ctx.selectedNode.failed);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "border-t border-base-200 pt-2 dark:border-base-700" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mb-1 font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500" },
        });
        (__VLS_ctx.selectedNode.breakdown.total);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col gap-1" },
        });
        for (const [s] of __VLS_getVForSourceType((__VLS_ctx.selectedNode.recent_subs))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (s.id),
                ...{ class: "flex items-center justify-between gap-1 border border-base-100 bg-base-50 px-1.5 py-1 dark:border-base-800 dark:bg-base-900" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "hud-mono-num truncate text-2xs text-base-700 dark:text-base-200" },
                title: (s.label),
            });
            (s.label);
            /** @type {[typeof HudStatusPill, ]} */ ;
            // @ts-ignore
            const __VLS_54 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
                tone: (__VLS_ctx.statusTone(s.status)),
                label: (__VLS_ctx.statusLabel(s.status)),
            }));
            const __VLS_55 = __VLS_54({
                tone: (__VLS_ctx.statusTone(s.status)),
                label: (__VLS_ctx.statusLabel(s.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_54));
        }
        if (__VLS_ctx.selectedNode.recent_subs.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "border border-base-100 px-2 py-2 text-center text-2xs text-base-400 dark:border-base-800 dark:text-base-500" },
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-2xs text-base-400 dark:text-base-500" },
        });
        (__VLS_ctx.selectedNode.code);
        /** @type {[typeof HudStatusPill, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
            tone: (__VLS_ctx.statusTone(__VLS_ctx.selectedNode.status)),
            label: (__VLS_ctx.statusLabel(__VLS_ctx.selectedNode.status)),
        }));
        const __VLS_58 = __VLS_57({
            tone: (__VLS_ctx.statusTone(__VLS_ctx.selectedNode.status)),
            label: (__VLS_ctx.statusLabel(__VLS_ctx.selectedNode.status)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "font-mono text-xs uppercase tracking-ops text-base-700 dark:text-base-200" },
            title: (__VLS_ctx.selectedNode.label),
        });
        (__VLS_ctx.selectedNode.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-2xs text-base-500 dark:text-base-400" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num" },
        });
        (__VLS_ctx.selectedNode.parent);
        if (__VLS_ctx.selectedNode.sub_label) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "text-2xs text-base-500 dark:text-base-400" },
            });
            (__VLS_ctx.selectedNode.sub_label);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "border-t border-base-200 pt-2 text-2xs text-base-500 dark:border-base-700 dark:text-base-400" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mb-0.5 font-mono text-[10px] uppercase tracking-ops" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "break-all hud-mono-num text-2xs leading-relaxed" },
        });
        (__VLS_ctx.selectedNode.payload_excerpt);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "border-t border-base-200 pt-2 dark:border-base-700" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mb-1 font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col gap-1" },
        });
        for (const [h, i] of __VLS_getVForSourceType((__VLS_ctx.selectedNode.history))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (i),
                ...{ class: "flex items-center justify-between border border-base-100 bg-base-50 px-1.5 py-0.5 dark:border-base-800 dark:bg-base-900" },
            });
            /** @type {[typeof HudStatusPill, ]} */ ;
            // @ts-ignore
            const __VLS_60 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
                tone: (__VLS_ctx.eventTone(h.event)),
                label: (h.event.toUpperCase()),
            }));
            const __VLS_61 = __VLS_60({
                tone: (__VLS_ctx.eventTone(h.event)),
                label: (h.event.toUpperCase()),
            }, ...__VLS_functionalComponentArgsRest(__VLS_60));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "hud-mono-num text-[10px] text-base-400 dark:text-base-500" },
            });
            (__VLS_ctx.formatRelTime(h.ts));
        }
    }
    var __VLS_49;
}
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_63 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Event Stream",
    code: "EVT",
    ...{ class: "flex-1" },
}));
const __VLS_64 = __VLS_63({
    title: "Event Stream",
    code: "EVT",
    ...{ class: "flex-1" },
}, ...__VLS_functionalComponentArgsRest(__VLS_63));
__VLS_65.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_65.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops text-accent-600 dark:text-accent-300" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-[400px] flex-col gap-1 overflow-y-auto pr-1" },
});
for (const [ev] of __VLS_getVForSourceType((__VLS_ctx.events.slice(0, 60)))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (ev.id),
        ...{ class: "border border-base-200 px-2 py-1 dark:border-base-700" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between gap-2" },
    });
    /** @type {[typeof HudStatusPill, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
        tone: (__VLS_ctx.eventTone(ev.event)),
        label: (ev.event.toUpperCase()),
    }));
    const __VLS_67 = __VLS_66({
        tone: (__VLS_ctx.eventTone(ev.event)),
        label: (ev.event.toUpperCase()),
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-[10px] text-base-400 dark:text-base-500" },
    });
    (__VLS_ctx.formatRelTime(ev.ts));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-0.5 hud-mono-num text-[10px] text-base-700 dark:text-base-200" },
    });
    (ev.node);
    if (__VLS_ctx.payloadSummary(ev)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mt-0.5 truncate hud-mono-num text-[10px] text-base-500 dark:text-base-400" },
            title: (JSON.stringify(ev.payload)),
        });
        (__VLS_ctx.payloadSummary(ev));
    }
}
if (__VLS_ctx.events.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "border border-base-200 p-3 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:border-base-700 dark:text-base-500" },
    });
}
var __VLS_65;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-7']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-12']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:col-span-9']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['orchestrator-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[900px]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-950']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:col-span-3']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warn-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-warn-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-ok-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-crit-400']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['break-all']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[400px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['pr-1']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            VueFlow: VueFlow,
            Background: Background,
            Controls: Controls,
            MiniMap: MiniMap,
            HudPanel: HudPanel,
            HudStatusPill: HudStatusPill,
            HudFlowNode: HudFlowNode,
            HudFlowSubNode: HudFlowSubNode,
            events: events,
            allNodes: allNodes,
            allEdges: allEdges,
            totalActive: totalActive,
            totalCompleted: totalCompleted,
            totalFailed: totalFailed,
            subtaskCount: subtaskCount,
            selectedNode: selectedNode,
            onNodeClick: onNodeClick,
            clearSelection: clearSelection,
            resetLayout: resetLayout,
            onCanvasReady: onCanvasReady,
            eventTone: eventTone,
            statusTone: statusTone,
            statusLabel: statusLabel,
            formatRelTime: formatRelTime,
            payloadSummary: payloadSummary,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
