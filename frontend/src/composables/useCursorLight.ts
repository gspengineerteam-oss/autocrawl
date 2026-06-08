/**
 * useCursorLight — track pointer + interaction state into CSS vars +
 * data attributes on <body>. Drives a custom editorial cursor:
 *   - --mx / --my : pointer position
 *   - data-cursor-active: pointer di dalam document
 *   - data-cursor-hover : pointer di atas interactive element
 *   - data-cursor-down  : mouse sedang ditekan
 * Touch / coarse pointers di-skip otomatis (no custom cursor di mobile).
 */
import { onBeforeUnmount, onMounted } from 'vue'

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], input, textarea, select, summary, [contenteditable], label, [data-cursor-target]'

export function useCursorLight() {
  let rafId = 0
  let pendingX = 0
  let pendingY = 0
  let active = false

  function setBodyFlag(name: string, value: boolean) {
    if (typeof document === 'undefined') return
    document.body.setAttribute(name, value ? 'true' : 'false')
  }

  function setCursorActive(v: boolean) {
    active = v
    setBodyFlag('data-cursor-active', v)
  }

  function onMove(e: PointerEvent) {
    pendingX = e.clientX
    pendingY = e.clientY
    if (!active) setCursorActive(true)
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      const root = document.documentElement
      root.style.setProperty('--mx', `${pendingX}px`)
      root.style.setProperty('--my', `${pendingY}px`)
    })

    // Hover state: detect if target chain matches interactive selector.
    const target = e.target as Element | null
    const hovering = !!(target && target.closest && target.closest(INTERACTIVE_SELECTOR))
    setBodyFlag('data-cursor-hover', hovering)
  }

  function onDown() { setBodyFlag('data-cursor-down', true) }
  function onUp()   { setBodyFlag('data-cursor-down', false) }
  function onLeave() { setCursorActive(false) }
  function onEnter() { setCursorActive(true) }

  onMounted(() => {
    if (typeof window === 'undefined') return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarsePointer  = window.matchMedia('(pointer: coarse)').matches
    if (prefersReduced || coarsePointer) {
      document.documentElement.style.setProperty('--mx', '50%')
      document.documentElement.style.setProperty('--my', '0%')
      setCursorActive(false)
      return
    }
    setCursorActive(false) // false until first move
    setBodyFlag('data-cursor-hover', false)
    setBodyFlag('data-cursor-down', false)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup',   onUp,   { passive: true })
    document.addEventListener('mouseleave', onLeave)
    document.addEventListener('mouseenter', onEnter)
  })

  onBeforeUnmount(() => {
    if (rafId) cancelAnimationFrame(rafId)
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseenter', onEnter)
    }
  })
}
