<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import HudPanel from '@/components/HudPanel.vue'
import HudStatusPill from '@/components/HudStatusPill.vue'
import HudFlowNode from '@/components/HudFlowNode.vue'
import HudFlowSubNode from '@/components/HudFlowSubNode.vue'
import { api } from '@/api/client'
import type { CrawlEvent } from '@/api/types'

const stateQ = useQuery({
  queryKey: ['orchestrator', 'state'],
  queryFn: api.orchestrator.state,
  refetchInterval: 2000,
})

const since = ref('0')
const events = ref<CrawlEvent[]>([])
const MAX_EVENTS = 200
const SUBTASK_TTL_MS = 45_000
const COMPLETED_TTL_MS = 12_000
const MAX_SUBTASKS_PER_PARENT = 10
const SUB_W = 150
const SUB_H = 70
const SUB_X_OFFSET = 36
const MASTER_ROW_Y = 60
const SUB_LANE_Y_OFFSET = 220

const eventsQ = useQuery({
  queryKey: ['orchestrator', 'events', since],
  queryFn: () => api.orchestrator.events(since.value, 50),
  refetchInterval: 1500,
})

interface SubTask {
  id: string
  parent: string
  label: string
  sub_label: string
  status: 'active' | 'ok' | 'crit' | 'idle'
  code: string
  created_at: number
  last_at: number
  order_index: number
  payload_excerpt: string
  history: { event: string; ts: number; payload_excerpt: string }[]
}

const subtasks = reactive<Map<string, SubTask>>(new Map())
const orderCounters = reactive<Map<string, number>>(new Map())
const customPositions = reactive<Map<string, { x: number; y: number }>>(new Map())

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
]
const MASTER_X_GAP = 280

const stageMeta: Record<string, { code: string; abbr: string }> = {
  discover: { code: 'DSC', abbr: 'DISC' },
  worker_extract: { code: 'XTR', abbr: 'XTR' },
  worker_pdf_extract: { code: 'PDF', abbr: 'PDF' },
  worker_resolve: { code: 'RSV', abbr: 'RSV' },
  worker_enrich: { code: 'ENR', abbr: 'ENR' },
  finalize: { code: 'FIN', abbr: 'FIN' },
}

function deriveSubId(ev: CrawlEvent): string | null {
  const p = ev.payload || {}
  if (ev.node === 'discover' || ev.node === 'finalize') return null
  if (ev.node === 'worker_extract' || ev.node === 'worker_pdf_extract') {
    return (p.expo_id as string) || null
  }
  if (ev.node === 'worker_resolve') {
    return (p.name as string) || (p.domain as string) || null
  }
  if (ev.node === 'worker_enrich') {
    return (p.domain as string) || null
  }
  return null
}

function deriveLabel(_ev: CrawlEvent, subId: string): string {
  return subId.length > 22 ? subId.slice(0, 20) + '..' : subId
}

function deriveSubLabel(ev: CrawlEvent): string {
  const p = ev.payload || {}
  const parts: string[] = []
  if (typeof p.refs === 'number') parts.push(`refs=${p.refs}`)
  if (typeof p.pdfs === 'number') parts.push(`pdfs=${p.pdfs}`)
  if (typeof p.outcome === 'string') parts.push(String(p.outcome))
  if (typeof p.reason === 'string') parts.push(String(p.reason).slice(0, 16))
  if (typeof p.domain === 'string' && ev.node === 'worker_resolve') parts.push(String(p.domain))
  return parts.slice(0, 2).join(' | ')
}

function statusFromEvent(kind: string): SubTask['status'] {
  if (kind === 'completed') return 'ok'
  if (kind === 'failed') return 'crit'
  if (kind === 'started') return 'active'
  return 'idle'
}

function masterColumnIndex(parent: string): number {
  const idx = MASTER_COLUMNS.indexOf(parent)
  return idx === -1 ? 0 : idx
}

function gridPositionFor(parent: string, orderIndex: number): { x: number; y: number } {
  // Flowy serpentine: stack vertically under the master, with a small sine
  // x-offset so consecutive subs alternate. Master node is 240px wide, so
  // master_center_x = col * MASTER_X_GAP + 120. Sub width is 155, so sub
  // top-left = master_center_x - SUB_W/2 + offset.
  const colIdx = masterColumnIndex(parent)
  const masterCenterX = colIdx * MASTER_X_GAP + 120
  const wave = Math.sin(orderIndex * 0.9) * SUB_X_OFFSET
  return {
    x: masterCenterX - SUB_W / 2 + wave,
    y: MASTER_ROW_Y + SUB_LANE_Y_OFFSET + orderIndex * SUB_H,
  }
}

function ingestEvents(batch: CrawlEvent[]) {
  const now = Date.now()
  for (const ev of batch) {
    const subId = deriveSubId(ev)
    if (!subId) continue
    const id = `${ev.node}:${subId}`
    const existing = subtasks.get(id)
    const evMs = ev.ts > 1e12 ? ev.ts : ev.ts * 1000
    const status = statusFromEvent(ev.event)
    const meta = stageMeta[ev.node] || { code: 'NODE', abbr: ev.node.toUpperCase().slice(0, 4) }
    const payloadExcerpt = JSON.stringify(ev.payload || {}).slice(0, 120)
    if (existing) {
      existing.status = status
      existing.last_at = evMs || now
      const merged = deriveSubLabel(ev)
      if (merged) existing.sub_label = merged
      existing.payload_excerpt = payloadExcerpt
      existing.history.unshift({ event: ev.event, ts: evMs || now, payload_excerpt: payloadExcerpt })
      if (existing.history.length > 12) existing.history.length = 12
    } else {
      const orderIndex = orderCounters.get(ev.node) ?? 0
      orderCounters.set(ev.node, orderIndex + 1)
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
      })
    }
  }

  // Rolling window: keep at most MAX_SUBTASKS_PER_PARENT visible per master.
  // Eviction priority: ok > idle > crit > active (drop completed first).
  const perParent: Record<string, SubTask[]> = {}
  for (const s of subtasks.values()) {
    if (!perParent[s.parent]) perParent[s.parent] = []
    perParent[s.parent].push(s)
  }
  const evictWeight: Record<SubTask['status'], number> = { ok: 0, idle: 1, crit: 2, active: 3 }
  for (const parent of Object.keys(perParent)) {
    const list = perParent[parent]
    if (list.length <= MAX_SUBTASKS_PER_PARENT) continue
    list.sort((a, b) => {
      const w = evictWeight[a.status] - evictWeight[b.status]
      return w !== 0 ? w : a.last_at - b.last_at
    })
    const toRemove = list.length - MAX_SUBTASKS_PER_PARENT
    for (let i = 0; i < toRemove; i++) {
      subtasks.delete(list[i].id)
      customPositions.delete(list[i].id)
    }
  }
}

function pruneStale() {
  const now = Date.now()
  for (const [id, s] of subtasks) {
    const age = now - s.last_at
    if (s.status === 'ok' && age > COMPLETED_TTL_MS) {
      subtasks.delete(id)
      customPositions.delete(id)
    } else if (age > SUBTASK_TTL_MS) {
      subtasks.delete(id)
      customPositions.delete(id)
    }
  }
}

setInterval(pruneStale, 5000)

watch(
  () => eventsQ.data.value,
  (resp) => {
    if (!resp) return
    if (resp.events.length > 0) {
      events.value = [...resp.events.slice().reverse(), ...events.value].slice(0, MAX_EVENTS)
      since.value = resp.next_since
      ingestEvents(resp.events)
    }
  },
)

const masterNodes = computed(() => {
  const data = stateQ.data.value
  if (!data) return []
  return data.nodes.map((n) => {
    const colIdx = MASTER_COLUMNS.indexOf(n.id)
    const x = colIdx === -1 ? n.x : colIdx * MASTER_X_GAP
    const y = colIdx === -1 ? n.y : MASTER_ROW_Y
    const custom = customPositions.get(n.id)
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
        kind: 'master' as const,
      },
    }
  })
})

const subtaskNodes = computed(() => {
  const list = Array.from(subtasks.values())
  return list.map((s) => {
    const custom = customPositions.get(s.id)
    const grid = gridPositionFor(s.parent, s.order_index)
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
    }
  })
})

const allNodes = computed<Node[]>(() => [...masterNodes.value, ...subtaskNodes.value] as Node[])

const masterEdges = computed<Edge[]>(() => {
  const data = stateQ.data.value
  if (!data) return []
  const activeNodes = new Set(
    data.nodes.filter((n) => n.active > 0).map((n) => n.id),
  )
  return data.edges.map<Edge>((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: activeNodes.has(e.source) || activeNodes.has(e.target),
    type: 'smoothstep',
    style: {
      stroke: activeNodes.has(e.source) ? '#FFB800' : '#5C6878',
      strokeWidth: activeNodes.has(e.source) ? 2.5 : 1.4,
    },
  }))
})

const subtaskEdges = computed<Edge[]>(() => {
  // Chain edges: master → sub0 → sub1 → sub2 → ... so the lane reads like a flowing
  // pipeline of work units rather than a starburst from the master node.
  const grouped = new Map<string, SubTask[]>()
  for (const s of subtasks.values()) {
    if (!grouped.has(s.parent)) grouped.set(s.parent, [])
    grouped.get(s.parent)!.push(s)
  }
  const edges: Edge[] = []
  for (const [parent, list] of grouped) {
    list.sort((a, b) => a.order_index - b.order_index)
    let prev = parent
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
      })
      prev = s.id
    }
  }
  return edges
})

const allEdges = computed<Edge[]>(() => [...masterEdges.value, ...subtaskEdges.value] as Edge[])

const totalActive = computed(() => {
  const data = stateQ.data.value
  if (!data) return 0
  return data.nodes.reduce((sum, n) => sum + (n.active ?? 0), 0)
})

const totalCompleted = computed(() => {
  const data = stateQ.data.value
  if (!data) return 0
  return data.nodes.reduce((sum, n) => sum + (n.completed ?? 0), 0)
})

const totalFailed = computed(() => {
  const data = stateQ.data.value
  if (!data) return 0
  return data.nodes.reduce((sum, n) => sum + (n.failed ?? 0), 0)
})

const subtaskCount = computed(() => subtasks.size)

const { fitView, onNodeDragStop } = useVueFlow()

onNodeDragStop((event) => {
  const node = event.node
  if (!node) return
  customPositions.set(node.id, { x: node.position.x, y: node.position.y })
})

const selectedId = ref<string | null>(null)
const selectedNode = computed(() => {
  if (!selectedId.value) return null
  if (subtasks.has(selectedId.value)) {
    const s = subtasks.get(selectedId.value)!
    return {
      kind: 'sub' as const,
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
    }
  }
  const data = stateQ.data.value
  if (data) {
    const m = data.nodes.find((n) => n.id === selectedId.value)
    if (m) {
      const subList = Array.from(subtasks.values()).filter((s) => s.parent === m.id)
      const breakdown = {
        active: subList.filter((s) => s.status === 'active').length,
        ok: subList.filter((s) => s.status === 'ok').length,
        crit: subList.filter((s) => s.status === 'crit').length,
        total: subList.length,
      }
      return {
        kind: 'master' as const,
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
      }
    }
  }
  return null
})

function onNodeClick({ node }: { node: { id: string } }) {
  selectedId.value = node.id
}

function clearSelection() {
  selectedId.value = null
}

function resetLayout() {
  customPositions.clear()
  setTimeout(() => fitView({ padding: 0.18 }), 80)
}

function onCanvasReady() {
  setTimeout(() => fitView({ padding: 0.2 }), 50)
}

watch(
  () => masterNodes.value.length,
  (n) => {
    if (n > 0) {
      setTimeout(() => fitView({ padding: 0.18 }), 100)
    }
  },
)

function eventTone(kind: string): 'ok' | 'warn' | 'crit' | 'info' {
  if (kind === 'completed') return 'ok'
  if (kind === 'failed') return 'crit'
  if (kind === 'started') return 'warn'
  return 'info'
}

function statusTone(status: string): 'ok' | 'warn' | 'crit' | 'muted' {
  if (status === 'ok') return 'ok'
  if (status === 'active') return 'warn'
  if (status === 'crit') return 'crit'
  return 'muted'
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'SELESAI'
  if (status === 'active') return 'AKTIF'
  if (status === 'crit') return 'GAGAL'
  return 'IDLE'
}

function formatRelTime(ts: number): string {
  const tsMs = ts > 1e12 ? ts : ts * 1000
  const diff = (Date.now() - tsMs) / 1000
  if (diff < 1) return 'baru saja'
  if (diff < 60) return `${Math.floor(diff)}s lalu`
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`
  return `${Math.floor(diff / 3600)}j lalu`
}

function payloadSummary(ev: CrawlEvent): string {
  const p = ev.payload || {}
  const keys = Object.keys(p)
  if (keys.length === 0) return ''
  return keys
    .slice(0, 3)
    .map((k) => `${k}=${String(p[k]).slice(0, 40)}`)
    .join(' ')
}
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500">
        OPS-07 / ORKESTRATOR LANGGRAPH
      </span>
      <div class="flex items-center gap-2">
        <HudStatusPill
          :tone="totalActive > 0 ? 'warn' : 'muted'"
          :label="`${totalActive} AKTIF`"
          :pulse="totalActive > 0"
        />
        <HudStatusPill tone="ok" :label="`${totalCompleted} OK`" />
        <HudStatusPill
          :tone="totalFailed > 0 ? 'crit' : 'muted'"
          :label="`${totalFailed} GAGAL`"
        />
        <HudStatusPill
          :tone="subtaskCount > 0 ? 'accent' : 'muted'"
          :label="`${subtaskCount} TASK`"
        />
        <button class="hud-btn-ghost h-7" @click="resetLayout">
          <FaIcon :icon="['fas', 'arrows-rotate']" class="text-2xs" />
          <span>RESET</span>
        </button>
      </div>
    </div>

    <div class="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
      <HudPanel
        title="Peta Workflow"
        code="GRAPH"
        class="lg:col-span-9"
      >
        <template #actions>
          <span class="font-mono text-2xs uppercase tracking-ops text-accent-600 dark:text-accent-300">
            DRAG / KLIK
          </span>
          <span class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
            POLL 1.5s
          </span>
        </template>

        <div class="orchestrator-canvas relative h-[900px] w-full border border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-950">
          <VueFlow
            :nodes="allNodes"
            :edges="allEdges"
            :min-zoom="0.1"
            :max-zoom="4"
            :fit-view-on-init="true"
            :nodes-draggable="true"
            :nodes-connectable="false"
            :elements-selectable="true"
            :only-render-visible-elements="false"
            :pan-on-drag="true"
            :zoom-on-scroll="true"
            :default-edge-options="{ type: 'smoothstep' }"
            @node-click="onNodeClick"
            @pane-click="clearSelection"
            @nodes-initialized="onCanvasReady"
          >
            <template #node-hud="props">
              <HudFlowNode v-bind="props" />
            </template>
            <template #node-sub="props">
              <HudFlowSubNode v-bind="props" />
            </template>
            <Background pattern-color="#5C6878" :gap="24" :size="1" />
            <Controls position="top-left" :show-zoom="true" :show-fit-view="true" :show-interactive="false" />
            <MiniMap pannable zoomable position="bottom-right" />
          </VueFlow>
        </div>
      </HudPanel>

      <div class="flex flex-col gap-3 lg:col-span-3">
        <HudPanel
          v-if="selectedNode"
          :title="selectedNode.kind === 'master' ? `Stage ${selectedNode.code}` : 'Sub-Task'"
          :code="selectedNode.kind === 'master' ? 'DETAIL' : 'TASK'"
        >
          <template #actions>
            <button class="hud-btn-ghost h-6 px-1.5" @click="clearSelection">
              <FaIcon :icon="['fas', 'xmark']" class="text-2xs" />
            </button>
          </template>

          <div v-if="selectedNode.kind === 'master'" class="flex flex-col gap-2">
            <div class="font-mono text-xs uppercase tracking-ops text-base-700 dark:text-base-200">
              {{ selectedNode.label }}
            </div>
            <div class="text-2xs leading-relaxed text-base-500 dark:text-base-400">
              {{ selectedNode.description }}
            </div>
            <div class="grid grid-cols-3 gap-1 border-t border-base-200 pt-2 dark:border-base-700">
              <div class="flex flex-col items-center">
                <span class="font-mono text-[9px] uppercase tracking-ops text-base-400">AKTIF</span>
                <span class="hud-mono-num text-base font-semibold text-warn-600 dark:text-warn-400">
                  {{ selectedNode.active }}
                </span>
              </div>
              <div class="flex flex-col items-center">
                <span class="font-mono text-[9px] uppercase tracking-ops text-base-400">OK</span>
                <span class="hud-mono-num text-base font-semibold text-ok-600 dark:text-ok-400">
                  {{ selectedNode.completed }}
                </span>
              </div>
              <div class="flex flex-col items-center">
                <span class="font-mono text-[9px] uppercase tracking-ops text-base-400">GAGAL</span>
                <span class="hud-mono-num text-base font-semibold text-crit-600 dark:text-crit-400">
                  {{ selectedNode.failed }}
                </span>
              </div>
            </div>
            <div class="border-t border-base-200 pt-2 dark:border-base-700">
              <div class="mb-1 font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500">
                SUB-TASK TERLIHAT ({{ selectedNode.breakdown.total }})
              </div>
              <div class="flex flex-col gap-1">
                <div
                  v-for="s in selectedNode.recent_subs"
                  :key="s.id"
                  class="flex items-center justify-between gap-1 border border-base-100 bg-base-50 px-1.5 py-1 dark:border-base-800 dark:bg-base-900"
                >
                  <span class="hud-mono-num truncate text-2xs text-base-700 dark:text-base-200" :title="s.label">
                    {{ s.label }}
                  </span>
                  <HudStatusPill :tone="statusTone(s.status)" :label="statusLabel(s.status)" />
                </div>
                <div
                  v-if="selectedNode.recent_subs.length === 0"
                  class="border border-base-100 px-2 py-2 text-center text-2xs text-base-400 dark:border-base-800 dark:text-base-500"
                >
                  belum ada sub-task aktif
                </div>
              </div>
            </div>
          </div>

          <div v-else class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">{{ selectedNode.code }}</span>
              <HudStatusPill :tone="statusTone(selectedNode.status)" :label="statusLabel(selectedNode.status)" />
            </div>
            <div class="font-mono text-xs uppercase tracking-ops text-base-700 dark:text-base-200" :title="selectedNode.label">
              {{ selectedNode.label }}
            </div>
            <div class="text-2xs text-base-500 dark:text-base-400">
              parent: <span class="hud-mono-num">{{ selectedNode.parent }}</span>
            </div>
            <div v-if="selectedNode.sub_label" class="text-2xs text-base-500 dark:text-base-400">
              {{ selectedNode.sub_label }}
            </div>
            <div class="border-t border-base-200 pt-2 text-2xs text-base-500 dark:border-base-700 dark:text-base-400">
              <div class="mb-0.5 font-mono text-[10px] uppercase tracking-ops">PAYLOAD</div>
              <div class="break-all hud-mono-num text-2xs leading-relaxed">
                {{ selectedNode.payload_excerpt }}
              </div>
            </div>
            <div class="border-t border-base-200 pt-2 dark:border-base-700">
              <div class="mb-1 font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500">
                RIWAYAT EVENT
              </div>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(h, i) in selectedNode.history"
                  :key="i"
                  class="flex items-center justify-between border border-base-100 bg-base-50 px-1.5 py-0.5 dark:border-base-800 dark:bg-base-900"
                >
                  <HudStatusPill :tone="eventTone(h.event)" :label="h.event.toUpperCase()" />
                  <span class="hud-mono-num text-[10px] text-base-400 dark:text-base-500">
                    {{ formatRelTime(h.ts) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </HudPanel>

        <HudPanel
          title="Event Stream"
          code="EVT"
          class="flex-1"
        >
          <template #actions>
            <span class="font-mono text-2xs uppercase tracking-ops text-accent-600 dark:text-accent-300">
              LIVE
            </span>
          </template>

          <div class="flex h-[400px] flex-col gap-1 overflow-y-auto pr-1">
            <div
              v-for="ev in events.slice(0, 60)"
              :key="ev.id"
              class="border border-base-200 px-2 py-1 dark:border-base-700"
            >
              <div class="flex items-center justify-between gap-2">
                <HudStatusPill
                  :tone="eventTone(ev.event)"
                  :label="ev.event.toUpperCase()"
                />
                <span class="hud-mono-num text-[10px] text-base-400 dark:text-base-500">
                  {{ formatRelTime(ev.ts) }}
                </span>
              </div>
              <div class="mt-0.5 hud-mono-num text-[10px] text-base-700 dark:text-base-200">
                {{ ev.node }}
              </div>
              <div
                v-if="payloadSummary(ev)"
                class="mt-0.5 truncate hud-mono-num text-[10px] text-base-500 dark:text-base-400"
                :title="JSON.stringify(ev.payload)"
              >
                {{ payloadSummary(ev) }}
              </div>
            </div>

            <div
              v-if="events.length === 0"
              class="border border-base-200 p-3 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:border-base-700 dark:text-base-500"
            >
              Menunggu event. Trigger ENGAGE untuk mulai operasi.
            </div>
          </div>
        </HudPanel>
      </div>
    </div>
  </div>
</template>

<style>
.orchestrator-canvas .vue-flow__edge-path {
  transition: stroke 0.2s, stroke-width 0.2s, opacity 0.3s;
}
.orchestrator-canvas .vue-flow__node.selected,
.orchestrator-canvas .vue-flow__node-sub.selected {
  outline: 1.5px solid #FFB800;
  outline-offset: 2px;
}
.orchestrator-canvas .vue-flow__minimap {
  background: rgba(20, 27, 37, 0.85);
  border: 1px solid #2a3340;
}
.orchestrator-canvas .vue-flow__controls {
  background: rgba(20, 27, 37, 0.85);
  border: 1px solid #2a3340;
}
.orchestrator-canvas .vue-flow__controls button {
  background: transparent;
  color: #bfc8d4;
  border-bottom: 1px solid #2a3340;
}
.orchestrator-canvas .vue-flow__controls button:hover {
  background: rgba(255, 184, 0, 0.1);
  color: #ffb800;
}
</style>
