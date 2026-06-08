export interface FailureExplanation {
  title: string
  cause: string
  remedy: string
  severity: 'low' | 'medium' | 'high'
}

const FAILURE_DICT: Record<string, FailureExplanation> = {
  no_url_no_match: {
    title: 'Resolver gak nemu domain',
    cause:
      'Search engine (Wikipedia, DuckDuckGo, Crawl4AI) gagal nemu match buat nama vendor.',
    remedy:
      'Kemungkinan nama OCR garbage dari PDF, atau company gak punya web presence. Buka detail vendor lalu klik PERDALAM SEKARANG untuk coba ulang.',
    severity: 'high',
  },
  dns_invalid: {
    title: 'Domain tidak resolve',
    cause:
      'DNS lookup gagal. Domain mungkin parking page, dead, atau salah ketik.',
    remedy:
      'Cek domain di browser. Kalau beneran mati, ref ini aman diabaikan.',
    severity: 'medium',
  },
  scrape_failed: {
    title: 'Scraping situs gagal',
    cause: 'Timeout, rate-limit, atau Cloudflare blocking.',
    remedy:
      'Biasanya retry sukses. Set CRAWL4AI_BROWSER=undetected di .env untuk situs anti-bot.',
    severity: 'medium',
  },
  aggregator_only: {
    title: 'Cuma kandidat aggregator',
    cause:
      'Semua kandidat domain berasal dari aggregator (10times, eventbrite, dll), bukan website asli vendor.',
    remedy:
      'Vendor mungkin pure-aggregator listing. Coba PERDALAM SEKARANG dengan context tambahan.',
    severity: 'medium',
  },
  llm_tiebreak_null: {
    title: 'LLM tiebreak abstain',
    cause:
      'LLM melihat banyak kandidat tapi gak yakin pilih yang mana.',
    remedy:
      'Trigger PERDALAM SEKARANG, atau cek nama vendor terlalu generic.',
    severity: 'medium',
  },
  llm_merge_error: {
    title: 'OpenAI merge gagal',
    cause:
      'LLM call rate-limit, quota habis, atau respons malformed.',
    remedy:
      'Cek balance OPENAI_API_KEY. Jalankan crawl reprocess-pdfs --only-failed setelah quota refresh.',
    severity: 'high',
  },
  completeness_low: {
    title: 'Profil terlalu tipis',
    cause:
      'Enrichment sukses tapi data minimal. Score completeness di bawah threshold (default 0.10).',
    remedy:
      'Turunkan VENDOR_COMPLETENESS_THRESHOLD di .env, atau klik PERDALAM SEKARANG di vendor detail.',
    severity: 'low',
  },
  scope_out_of_scope: {
    title: 'Bukan defense vendor',
    cause:
      'Scope classifier reject karena hotel, news, catering, event platform, atau industry generic.',
    remedy:
      'Bisa diabaikan kalau benar. KEEP_OUT_OF_SCOPE=true sudah default sehingga ref tetap ke-persist sebagai info.',
    severity: 'low',
  },
  whois_failed: {
    title: 'WHOIS lookup gagal',
    cause:
      'Server registrar timeout, atau domain TLD eksotik (cn, ru, dll).',
    remedy:
      'Data registrar opsional. Skor completeness biasanya tetap valid tanpa WHOIS.',
    severity: 'low',
  },
  unknown: {
    title: 'Penyebab tidak teridentifikasi',
    cause:
      'Resolver return None tanpa error message yang bisa diklasifikasi.',
    remedy:
      'Buka raw failure_reason via halaman exhibitor-refs filter unknown.',
    severity: 'medium',
  },
}

export function explainFailure(category: string | null | undefined): FailureExplanation {
  if (!category) {
    return {
      title: 'Kategori belum ada',
      cause: 'Status ini gak punya failure_category yang ke-tag.',
      remedy: 'Inspect raw row di tabel exhibitor_refs.',
      severity: 'low',
    }
  }
  return (
    FAILURE_DICT[category] ?? {
      title: category.replace(/_/g, ' ').toUpperCase(),
      cause: 'Kategori belum ada di kamus humanizer.',
      remedy: 'Tambah entry di useFailureExplainer.ts kalau sering muncul.',
      severity: 'medium',
    }
  )
}
