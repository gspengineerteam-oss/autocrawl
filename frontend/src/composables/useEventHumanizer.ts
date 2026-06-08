import type { CrawlEvent } from '@/api/types'

export interface HumanizedEvent {
  text: string
  tone: 'ok' | 'warn' | 'crit' | 'info' | 'muted'
  icon: string
  expo_id?: string
  vendor_domain?: string
  vendor_name?: string
}

const STAGE_ICONS: Record<string, string> = {
  discover: 'magnifying-glass',
  worker_extract: 'spider',
  worker_pdf_extract: 'file-pdf',
  worker_resolve: 'crosshairs',
  worker_enrich: 'flask',
  finalize: 'flag-checkered',
}

function iconFor(node: string): string {
  return STAGE_ICONS[node] ?? 'circle-info'
}

function trim(value: unknown, max = 64): string {
  const s = String(value ?? '')
  return s.length > max ? s.slice(0, max - 1) + '..' : s
}

export function humanizeEvent(ev: CrawlEvent): HumanizedEvent {
  const p = (ev.payload || {}) as Record<string, unknown>
  const node = ev.node
  const kind = ev.event
  const icon = iconFor(node)

  if (kind === 'failed') {
    if (node === 'discover') {
      return {
        text: `Discovery gagal: ${trim(p.error, 80)}`,
        tone: 'crit',
        icon,
      }
    }
    if (node === 'worker_extract') {
      return {
        text: `Extract gagal di ${trim(p.expo_id, 32)}: ${trim(p.error, 60)}`,
        tone: 'crit',
        icon,
        expo_id: String(p.expo_id ?? ''),
      }
    }
    if (node === 'worker_pdf_extract') {
      return {
        text: `PDF gagal di ${trim(p.expo_id, 32)}: ${trim(p.error, 60)}`,
        tone: 'crit',
        icon,
        expo_id: String(p.expo_id ?? ''),
      }
    }
    if (node === 'worker_resolve') {
      const reason = String(p.reason ?? p.error ?? 'unknown')
      return {
        text: `Gak ketemu domain "${trim(p.name, 36)}" (${reason})`,
        tone: 'crit',
        icon,
        vendor_name: String(p.name ?? ''),
      }
    }
    if (node === 'worker_enrich') {
      const reason = String(p.reason ?? p.error ?? 'unknown')
      return {
        text: `Enrich gagal ${trim(p.domain, 32)}: ${reason}`,
        tone: 'crit',
        icon,
        vendor_domain: String(p.domain ?? ''),
      }
    }
    return {
      text: `${node} gagal: ${trim(p.error ?? p.reason, 80)}`,
      tone: 'crit',
      icon,
    }
  }

  if (kind === 'started') {
    if (node === 'discover') {
      return {
        text: 'Mencari ekspo defense baru via Wikipedia + DDG',
        tone: 'warn',
        icon,
      }
    }
    if (node === 'worker_extract') {
      const label = p.name ? trim(p.name, 40) : trim(p.expo_id, 40)
      return {
        text: `Ambil exhibitor list dari ${label}`,
        tone: 'warn',
        icon,
        expo_id: String(p.expo_id ?? ''),
      }
    }
    if (node === 'worker_pdf_extract') {
      return {
        text: `Cari + parse PDF brosur untuk ${trim(p.expo_id, 40)}`,
        tone: 'warn',
        icon,
        expo_id: String(p.expo_id ?? ''),
      }
    }
    if (node === 'worker_resolve') {
      return {
        text: `Cari domain untuk vendor "${trim(p.name, 40)}"`,
        tone: 'warn',
        icon,
        vendor_name: String(p.name ?? ''),
      }
    }
    if (node === 'worker_enrich') {
      return {
        text: `Memperkaya profil ${trim(p.domain, 40)}`,
        tone: 'warn',
        icon,
        vendor_domain: String(p.domain ?? ''),
      }
    }
    if (node === 'finalize') {
      return {
        text: 'Menyiapkan ringkasan run',
        tone: 'warn',
        icon,
      }
    }
    return {
      text: `${node} dimulai`,
      tone: 'warn',
      icon,
    }
  }

  if (kind === 'completed') {
    if (node === 'discover') {
      const expos = Number(p.expos ?? 0)
      return {
        text: `${expos} ekspo ditemukan via discovery`,
        tone: 'ok',
        icon,
      }
    }
    if (node === 'worker_extract') {
      const refs = Number(p.refs ?? 0)
      return {
        text: `${refs} ref di-extract dari ${trim(p.expo_id, 40)}`,
        tone: refs > 0 ? 'ok' : 'muted',
        icon,
        expo_id: String(p.expo_id ?? ''),
      }
    }
    if (node === 'worker_pdf_extract') {
      const refs = Number(p.refs ?? 0)
      const pdfs = Number(p.pdfs ?? 0)
      return {
        text: `${pdfs} PDF di-process, dapat ${refs} vendor di ${trim(p.expo_id, 32)}`,
        tone: refs > 0 ? 'ok' : 'muted',
        icon,
        expo_id: String(p.expo_id ?? ''),
      }
    }
    if (node === 'worker_resolve') {
      return {
        text: `"${trim(p.name, 36)}" ketemu di ${trim(p.domain, 32)}`,
        tone: 'ok',
        icon,
        vendor_name: String(p.name ?? ''),
        vendor_domain: String(p.domain ?? ''),
      }
    }
    if (node === 'worker_enrich') {
      const outcome = String(p.outcome ?? '')
      if (outcome === 'dedup_skipped') {
        return {
          text: `${trim(p.domain, 40)} sudah ada, expo_id ditambahkan`,
          tone: 'info',
          icon,
          vendor_domain: String(p.domain ?? ''),
        }
      }
      return {
        text: `Profil ${trim(p.domain, 40)} tersimpan lengkap`,
        tone: 'ok',
        icon,
        vendor_domain: String(p.domain ?? ''),
      }
    }
    if (node === 'finalize') {
      const enriched = Number(p.vendors_enriched ?? 0)
      const failures = Number(p.failures ?? 0)
      return {
        text: `Run selesai: ${enriched} vendor baru, ${failures} gagal`,
        tone: 'ok',
        icon,
      }
    }
    return {
      text: `${node} selesai`,
      tone: 'ok',
      icon,
    }
  }

  return {
    text: `${node} ${kind}`,
    tone: 'muted',
    icon,
  }
}
