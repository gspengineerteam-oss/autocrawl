<script setup lang="ts">
import { computed } from 'vue'
import type { VendorCandidate } from '@/api/types'
import VendorCard from '@/components/VendorCard.vue'

const props = defineProps<{
  vendor: VendorCandidate
  selected: boolean
  busyDeepen?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', vendorId: string): void
  (e: 'deepen', vendorId: string): void
}>()

const cardItem = computed(() => ({
  vendor_id: props.vendor.vendor_id,
  company_name: props.vendor.company_name,
  domain: props.vendor.domain,
  logo_url: props.vendor.logo_url,
  industries: props.vendor.industries,
  has_verified_email: props.vendor.has_verified_email,
  confidence_score: props.vendor.confidence_score,
  enrichment_gap: props.vendor.has_verified_email ? [] : ['email'],
}))
</script>

<template>
  <div
    :class="[
      'labs-vc',
      selected ? 'labs-vc--selected' : '',
    ]"
    @click="emit('toggle', vendor.vendor_id)"
  >
    <span
      :class="[
        'labs-vc__check',
        selected ? 'labs-vc__check--on' : '',
      ]"
      aria-hidden="true"
    >
      <FaIcon v-if="selected" :icon="['fas', 'check']" class="text-[8px] text-bg" />
    </span>

    <VendorCard
      :vendor="cardItem"
      size="tile"
      :selected="selected"
      :show-enrichment="false"
      :industry-limit="3"
      class="labs-vc__card"
    />

    <div class="labs-vc__foot">
      <span
        v-if="vendor.has_verified_email"
        class="pill pill-ok text-[9.5px]"
      >
        <FaIcon :icon="['fas', 'check']" class="text-[8px]" />
        Email OK
      </span>
      <span v-else class="pill text-[9.5px]" style="border-color: rgb(var(--warn) / 0.5); color: rgb(var(--warn))">
        Belum ada email
      </span>

      <button
        v-if="!vendor.has_verified_email"
        type="button"
        :disabled="busyDeepen"
        class="labs-vc__deepen"
        @click.stop="emit('deepen', vendor.vendor_id)"
      >
        {{ busyDeepen ? 'Memuat' : 'Perdalam' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.labs-vc {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  cursor: pointer;
  border: 1px solid rgb(var(--rule));
  border-radius: 6px;
  background: rgb(var(--surface));
  transition: border-color var(--dur-160) var(--ease-out), background var(--dur-160) var(--ease-out);
}
.labs-vc:hover {
  border-color: rgb(var(--rule-strong));
  background: rgb(var(--surface-2));
}
.labs-vc--selected {
  border-color: rgb(var(--accent) / 0.6);
  background: rgb(var(--accent) / 0.08);
  box-shadow: 0 0 0 1px rgb(var(--accent) / 0.2);
}

.labs-vc__check {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid rgb(var(--ink-mute));
  border-radius: 3px;
  background: rgb(var(--surface-2));
}
.labs-vc__check--on {
  border-color: rgb(var(--accent));
  background: rgb(var(--accent));
}

.labs-vc__card {
  border: none !important;
  background: transparent !important;
  padding: 14px 14px 0 14px !important;
}
.labs-vc__card:hover {
  background: transparent !important;
  border: none !important;
}

.labs-vc__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px 12px 14px;
  border-top: 1px solid rgb(var(--rule));
}

.labs-vc__deepen {
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgb(var(--ink-mute));
  text-decoration: underline;
  text-decoration-color: rgb(var(--ink-mute) / 0.3);
  text-underline-offset: 3px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color var(--dur-160) var(--ease-out), text-decoration-color var(--dur-160) var(--ease-out);
}
.labs-vc__deepen:hover {
  color: rgb(var(--accent));
  text-decoration-color: rgb(var(--accent));
}
.labs-vc__deepen:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
