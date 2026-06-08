<script setup lang="ts">
import { computed } from 'vue'
import { presentTag } from '@/utils/tagPresentation'

const props = withDefaults(
  defineProps<{
    raw: string
    size?: 'xs' | 'sm' | 'md'
    variant?: 'soft' | 'outline' | 'plain'
  }>(),
  { size: 'sm', variant: 'soft' },
)

const meta = computed(() => presentTag(props.raw))
</script>

<template>
  <span class="tag-badge" :data-size="size" :data-variant="variant" :title="raw">
    <FaIcon :icon="meta.icon" class="tag-badge__icon" />
    <span class="tag-badge__label">{{ meta.label }}</span>
  </span>
</template>

<style scoped>
.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
  white-space: nowrap;
  border-radius: 3px;
  font-family: inherit;
  font-feature-settings: 'ss01' on;
}
.tag-badge[data-size='xs'] { padding: 3px 7px; font-size: 10px; letter-spacing: 0.02em; }
.tag-badge[data-size='sm'] { padding: 4px 8px; font-size: 11px; letter-spacing: 0.01em; }
.tag-badge[data-size='md'] { padding: 5px 10px; font-size: 12.5px; }

.tag-badge[data-variant='soft'] {
  background: var(--surface-2, rgba(0,0,0,0.04));
  color: var(--ink-2, #3a342d);
  border: 1px solid var(--rule, rgba(0,0,0,0.08));
}
.tag-badge[data-variant='outline'] {
  background: transparent;
  color: var(--ink-2, #3a342d);
  border: 1px solid var(--rule, rgba(0,0,0,0.2));
}
.tag-badge[data-variant='plain'] {
  background: transparent;
  color: var(--ink-2, #3a342d);
  border: none;
  padding-left: 0;
  padding-right: 0;
}

.tag-badge__icon { font-size: 0.85em; opacity: 0.75; }
.tag-badge__label { font-weight: 500; }
</style>
