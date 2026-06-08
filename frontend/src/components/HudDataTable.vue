<script setup lang="ts" generic="T">
import { computed } from 'vue'

interface Column<R> {
  key: string
  label: string
  width?: string
  align?: 'left' | 'right' | 'center'
  render?: (row: R) => string
}

const props = withDefaults(
  defineProps<{
    columns: Column<T>[]
    rows: T[]
    rowKey: (row: T) => string
    emptyMessage?: string
    onRowClick?: (row: T) => void
    dense?: boolean
  }>(),
  { emptyMessage: 'Tidak ada data.', dense: true },
)

const cellPadding = computed(() => (props.dense ? 'px-3 py-1.5' : 'px-3 py-2.5'))

function alignClass(col: Column<T>) {
  if (col.align === 'right') return 'text-right'
  if (col.align === 'center') return 'text-center'
  return 'text-left'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="hud-table">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width } : {}"
            :class="[alignClass(col)]"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="rowKey(row)"
          :class="[onRowClick ? 'cursor-pointer' : '']"
          @click="onRowClick?.(row)"
        >
          <td v-for="col in columns" :key="col.key" :class="[alignClass(col), cellPadding]">
            <slot :name="`cell-${col.key}`" :row="row" :value="(row as never)[col.key]">
              {{ col.render ? col.render(row) : (row as never)[col.key] }}
            </slot>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td
            :colspan="columns.length"
            class="px-3 py-8 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500"
          >
            {{ emptyMessage }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
