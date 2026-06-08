import { ref, watch } from 'vue';
/**
 * useNumberTicker — odometer-style number tween.
 *
 * Returns a `display` ref that animates from its previous value to the
 * incoming `target` over `duration` ms with an ease-out curve. Suitable
 * for KPI tiles where we want the digit roll without a bouncy spring.
 */
export function useNumberTicker(target, options = {}) {
    const duration = options.duration ?? 360;
    const round = options.round ?? true;
    const display = ref(target.value ?? 0);
    let raf = 0;
    let from = display.value;
    let to = display.value;
    let start = 0;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
        if (!start)
            start = now;
        const t = Math.min(1, (now - start) / duration);
        const v = from + (to - from) * easeOut(t);
        display.value = round ? Math.round(v) : v;
        if (t < 1) {
            raf = requestAnimationFrame(step);
        }
        else {
            raf = 0;
        }
    };
    watch(target, (next) => {
        if (next == null || Number.isNaN(next))
            return;
        if (next === to)
            return;
        if (raf)
            cancelAnimationFrame(raf);
        from = display.value;
        to = next;
        start = 0;
        raf = requestAnimationFrame(step);
    }, { immediate: true });
    return display;
}
