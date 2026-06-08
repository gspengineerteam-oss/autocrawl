import type { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import type { default as Icon } from '@/components/icons/Icon.vue'

declare module 'vue' {
  export interface GlobalComponents {
    FaIcon: typeof FontAwesomeIcon
    Icon: typeof Icon
  }
}

export {}
