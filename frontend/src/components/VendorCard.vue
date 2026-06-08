<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import GeoAvatar from '@/components/GeoAvatar.vue'
import TagBadge from '@/components/TagBadge.vue'
import EnrichmentBadge from '@/components/EnrichmentBadge.vue'
import { resolveCountry, flagEmoji } from '@/data/country_resolver'

export interface VendorCardItem {
  vendor_id: string
  company_name: string
  domain?: string | null
  logo_url?: string | null
  industries?: string[]
  enrichment_gap?: string[]
  has_verified_email?: boolean
  confidence_score?: number
  country?: string | null
  similarity?: number
}

const props = withDefaults(
  defineProps<{
    vendor: VendorCardItem
    size?: 'compact' | 'row' | 'tile'
    selected?: boolean
    to?: string
    showEnrichment?: boolean
    industryLimit?: number
  }>(),
  {
    size: 'row',
    selected: false,
    showEnrichment: true,
    industryLimit: 3,
  },
)

const emit = defineEmits<{
  (e: 'click', vendor: VendorCardItem): void
}>()

const avatarSize = computed(() => {
  if (props.size === 'compact') return 28
  if (props.size === 'tile') return 44
  return 36
})

const industriesShown = computed(() => (props.vendor.industries ?? []).slice(0, props.industryLimit))
const industriesExtra = computed(() => {
  const total = props.vendor.industries?.length ?? 0
  return Math.max(0, total - industriesShown.value.length)
})

const countryFlag = computed(() => {
  if (!props.vendor.country) return ''
  const rec = resolveCountry(props.vendor.country)
  return rec ? flagEmoji(rec.cca2) : ''
})

const seed = computed(() => props.vendor.vendor_id || props.vendor.domain || props.vendor.company_name)

function handleClick(event: MouseEvent) {
  if (props.to) return
  event.preventDefault()
  emit('click', props.vendor)
}
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    :class="['vc', `vc--${size}`, selected ? 'vc--selected' : '']"
    @click="handleClick"
  >
    <span class="vc__avatar" :style="{ width: `${avatarSize}px`, height: `${avatarSize}px` }">
      <img
        v-if="vendor.logo_url"
        :src="vendor.logo_url"
        :alt="vendor.company_name"
        class="vc__logo"
        referrerpolicy="no-referrer"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <GeoAvatar
        v-else
        :seed="seed"
        :fallback="vendor.company_name"
        :size="avatarSize"
      />
    </span>

    <span class="vc__body">
      <span class="vc__head">
        <span class="vc__name">{{ vendor.company_name }}</span>
        <span v-if="typeof vendor.similarity === 'number'" class="vc__sim" :title="`Similaritas ${(vendor.similarity * 100).toFixed(0)} persen`">
          <span class="vc__sim-tick" v-for="i in 5" :key="i" :data-on="vendor.similarity >= i / 5 ? 'true' : 'false'" />
        </span>
      </span>

      <span v-if="vendor.domain || countryFlag" class="vc__meta">
        <span v-if="vendor.domain" class="vc__domain num-display">{{ vendor.domain }}</span>
        <span v-if="vendor.domain && countryFlag" class="vc__dot" aria-hidden="true">·</span>
        <span v-if="countryFlag" class="vc__country">
          <span class="vc__flag">{{ countryFlag }}</span>
          <span class="vc__country-name">{{ vendor.country }}</span>
        </span>
      </span>

      <span v-if="industriesShown.length" class="vc__industries">
        <TagBadge
          v-for="ind in industriesShown"
          :key="ind"
          :raw="ind"
          size="xs"
        />
        <span v-if="industriesExtra > 0" class="vc__more">+{{ industriesExtra }}</span>
      </span>
    </span>

    <span v-if="showEnrichment && vendor.enrichment_gap" class="vc__enrich">
      <EnrichmentBadge :gap="vendor.enrichment_gap" :size="size === 'compact' ? 'compact' : 'normal'" :show-label="size !== 'compact'" />
    </span>
  </component>
</template>

<style scoped>
.vc {
  display: grid;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--dur-160) var(--ease-out), border-color var(--dur-160) var(--ease-out);
}

.vc--compact {
  grid-template-columns: auto 1fr auto;
  padding: 6px 10px;
  border-radius: 4px;
}
.vc--row {
  grid-template-columns: auto 1fr auto;
  padding: 10px 14px;
  border-radius: 5px;
}
.vc--tile {
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  padding: 14px;
  border-radius: 6px;
  border-color: rgb(var(--rule));
  background: rgb(var(--surface));
}

.vc:hover {
  background: rgb(var(--surface-2) / 0.5);
}
.vc--tile:hover {
  border-color: rgb(var(--rule-strong));
  background: rgb(var(--surface-2));
}

.vc--selected {
  background: rgb(var(--accent) / 0.08);
  border-color: rgb(var(--accent) / 0.5);
}

.vc__avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgb(var(--surface-2));
}
.vc__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 3px;
  background: rgb(var(--surface));
  border-radius: inherit;
}

.vc__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.vc__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.vc__name {
  font-family: var(--font-sans);
  font-weight: 600;
  color: rgb(var(--ink));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.vc--compact .vc__name { font-size: 13px; }
.vc--row .vc__name { font-size: 14px; }
.vc--tile .vc__name { font-size: 15px; }

.vc__sim {
  display: inline-flex;
  align-items: stretch;
  gap: 2px;
  height: 12px;
  flex-shrink: 0;
}
.vc__sim-tick {
  display: block;
  width: 2px;
  background: rgb(var(--surface-3));
  border-radius: 1px;
}
.vc__sim-tick[data-on='true'] {
  background: rgb(var(--accent));
}

.vc__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: rgb(var(--ink-mute));
  min-width: 0;
}
.vc__domain {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vc__dot { opacity: 0.5; }
.vc__country {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.vc__flag { font-size: 13px; line-height: 1; }
.vc__country-name {
  font-size: 11px;
  color: rgb(var(--ink-2));
}

.vc__industries {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.vc__more {
  font-size: 10px;
  color: rgb(var(--ink-mute));
  letter-spacing: 0.04em;
}

.vc__enrich {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.vc--tile .vc__enrich {
  grid-column: 1 / -1;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgb(var(--rule));
}

.vc--compact .vc__industries { display: none; }
.vc--compact .vc__meta { font-size: 10.5px; }
</style>
