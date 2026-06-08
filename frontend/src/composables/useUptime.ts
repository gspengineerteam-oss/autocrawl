import { onMounted, onUnmounted, ref, computed } from 'vue'

export function useUptime(referenceSeconds = ref(0)) {
  const tick = ref(0)
  let timer: number | undefined

  onMounted(() => {
    timer = window.setInterval(() => {
      tick.value += 1
    }, 1000)
  })

  onUnmounted(() => {
    if (timer !== undefined) window.clearInterval(timer)
  })

  const totalSeconds = computed(() => referenceSeconds.value + tick.value)

  const formatted = computed(() => formatUptime(totalSeconds.value))

  return { totalSeconds, formatted, tick }
}

export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const secs = s % 60

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(secs)}`
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
