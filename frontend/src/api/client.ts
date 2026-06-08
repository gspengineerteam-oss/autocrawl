import axios from 'axios'
import type {
  AgentTracesResponse,
  CountryArc,
  CountryStat,
  ErrorSummaryResponse,
  ExhibitorRefRow,
  Expo,
  ExpoCountryDetail,
  ExpoCountryStat,
  Fusion,
  FusionListItem,
  FusionSuggestion,
  HealthResponse,
  IndustryStat,
  LabsCandidatesResponse,
  LabsCandidateIndustriesResponse,
  OrchestratorCurrent,
  OrchestratorEventsResponse,
  OrchestratorState,
  OrchestratorThroughput,
  OverviewResponse,
  PaginatedResponse,
  PdfMeta,
  RefsStats,
  RunModeStat,
  RunSummary,
  ScopePromptResponse,
  ScopeRule,
  ScopeRuleKind,
  ScopeRulesResponse,
  ScopeSuggestResponse,
  SettingsResponse,
  EnrichProgressResponse,
  EnrichSuccessFeedResponse,
  LlmQueueResponse,
  OllamaPsResponse,
  AgenticSessionsResponse,
  SourceTypeStat,
  TimelinePoint,
  Vendor,
} from './types'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export interface VendorsQuery {
  industry?: string
  country?: string
  search?: string
  status?: string
  limit?: number
  offset?: number
  sort?: string
  include_hidden?: boolean
}

export interface RefsQuery {
  status?: string
  failure_category?: string
  expo_id?: string
  limit?: number
  offset?: number
}

export interface ExposQuery {
  country?: string
  search?: string
  limit?: number
  offset?: number
}

export const api = {
  overview: () => http.get<OverviewResponse>('/overview').then((r) => r.data),
  vendors: (q: VendorsQuery = {}) =>
    http.get<PaginatedResponse<Vendor>>('/vendors', { params: q }).then((r) => r.data),
  // Semantic search via ChromaDB vendor_specialty collection. Returns
  // vendor rows ranked by cosine similarity to the query (embedded via
  // Ollama). Falls back to lexical LIKE search with mode="lexical" and
  // degraded=true when the embedding backend is unreachable, so the UI
  // can surface a "cadangan leksikal" chip instead of silently empty.
  vendorsSemantic: (q: string, limit = 20, country?: string) =>
    http
      .get<{
        items: Array<Vendor & { similarity: number | null }>
        mode: 'semantic' | 'lexical' | 'semantic_empty_fallback'
        degraded: boolean
        query: string
        limit: number
      }>('/vendors/search/semantic', {
        params: { q, limit, ...(country ? { country } : {}) },
      })
      .then((r) => r.data),
  vendor: (domain: string) => http.get<Vendor>(`/vendors/${domain}`).then((r) => r.data),
  deepenVendor: (vendorId: string) =>
    http.post<{ status: string; vendor_id: string; domain: string | null; current_status: string; current_score: number }>(
      `/vendors/${vendorId}/deepen`,
    ).then((r) => r.data),
  // Phase 5 — enqueue product-catalog enrichment for one vendor.
  deepenVendorProducts: (vendorId: string) =>
    http.post<{ status: string; vendor_id: string; queue_entry_id: string | null; has_legacy_products: boolean }>(
      `/vendors/${vendorId}/deepen-products`,
    ).then((r) => r.data),
  // Industrial-invitation email draft per (vendor, language). Persisted.
  vendorEmailDraft: {
    get: (vendorId: string, language: 'en' | 'id' = 'en') =>
      http
        .get<import('./types').VendorEmailDraftLookup>(
          `/vendors/${vendorId}/email-draft`,
          { params: { language } },
        )
        .then((r) => r.data),
    list: (vendorId: string) =>
      http
        .get<{ vendor_id: string; items: import('./types').VendorEmailDraft[] }>(
          `/vendors/${vendorId}/email-drafts`,
        )
        .then((r) => r.data),
    generate: (
      vendorId: string,
      body: { language?: 'en' | 'id'; our_context?: string | null } = {},
    ) =>
      http
        .post<import('./types').VendorEmailDraft>(
          `/vendors/${vendorId}/email-draft/generate`,
          body,
        )
        .then((r) => r.data),
    save: (
      vendorId: string,
      body: { subject: string; body: string },
      language: 'en' | 'id' = 'en',
    ) =>
      http
        .put<import('./types').VendorEmailDraft>(
          `/vendors/${vendorId}/email-draft`,
          body,
          { params: { language } },
        )
        .then((r) => r.data),
  },
  // Vendor PDF dossier - structured content from LLM, frontend renders to PDF.
  // 180s timeout: Mistral dossier generation can take 60-120s for vendors
  // with rich product catalogs; 90s was hitting the boundary.
  vendorDossierContent: (vendorId: string, language: 'en' | 'id' = 'en') =>
    http
      .post<import('./types').VendorDossierResponse>(
        `/vendors/${vendorId}/dossier-content`,
        null,
        { params: { language }, timeout: 180_000 },
      )
      .then((r) => r.data),
  expos: (q: ExposQuery = {}) =>
    http.get<PaginatedResponse<Expo>>('/expos', { params: q }).then((r) => r.data),
  expo: (expoId: string) => http.get<Expo>(`/expos/${expoId}`).then((r) => r.data),
  deepenExpo: (expoId: string) =>
    http.post<{ status: string; expo_id: string; name: string | null }>(
      `/expos/${expoId}/deepen`,
    ).then((r) => r.data),
  pdfs: (expoId?: string) =>
    http
      .get<PaginatedResponse<PdfMeta>>('/pdfs', { params: expoId ? { expo_id: expoId } : {} })
      .then((r) => r.data),
  runs: (limit = 20) =>
    http.get<PaginatedResponse<RunSummary>>('/runs', { params: { limit } }).then((r) => r.data),
  stats: {
    industries: () => http.get<IndustryStat[]>('/stats/industries').then((r) => r.data),
    countries: (limit = 10) =>
      http.get<CountryStat[]>('/stats/countries', { params: { limit } }).then((r) => r.data),
    sourceTypes: () => http.get<SourceTypeStat[]>('/stats/source-types').then((r) => r.data),
    timeline: (days = 30) =>
      http.get<TimelinePoint[]>('/stats/timeline', { params: { days } }).then((r) => r.data),
    runsMode: (days = 30) =>
      http.get<RunModeStat[]>('/stats/runs-mode', { params: { days } }).then((r) => r.data),
    expoCountries: () =>
      http.get<ExpoCountryStat[]>('/stats/expo-countries').then((r) => r.data),
    expoCountryDetail: (country: string) =>
      http
        .get<ExpoCountryDetail>(`/stats/expo-countries/${encodeURIComponent(country)}`)
        .then((r) => r.data),
    countryArcs: (limit = 80) =>
      http
        .get<CountryArc[]>('/stats/country-arcs', { params: { limit } })
        .then((r) => r.data),
  },
  health: () => http.get<HealthResponse>('/health').then((r) => r.data),
  settings: () => http.get<SettingsResponse>('/settings').then((r) => r.data),
  system: {
    llmQueue: () =>
      http.get<LlmQueueResponse>('/system/llm-queue').then((r) => r.data),
    ollamaPs: () =>
      http.get<OllamaPsResponse>('/system/ollama-ps').then((r) => r.data),
    agenticSessions: () =>
      http.get<AgenticSessionsResponse>('/system/agentic-sessions').then((r) => r.data),
    enrichProgress: () =>
      http.get<EnrichProgressResponse>('/system/enrich-progress').then((r) => r.data),
    enrichSuccessFeed: (since = 0, limit = 20) =>
      http
        .get<EnrichSuccessFeedResponse>('/system/enrich-success-feed', { params: { since, limit } })
        .then((r) => r.data),
  },
  orchestrator: {
    state: () => http.get<OrchestratorState>('/orchestrator/state').then((r) => r.data),
    events: (since = '0', limit = 50) =>
      http
        .get<OrchestratorEventsResponse>('/orchestrator/events', { params: { since, limit } })
        .then((r) => r.data),
    current: () =>
      http.get<OrchestratorCurrent>('/orchestrator/current').then((r) => r.data),
    throughput: (windowSeconds = 60) =>
      http
        .get<OrchestratorThroughput>('/orchestrator/throughput', {
          params: { window_seconds: windowSeconds },
        })
        .then((r) => r.data),
    errorSummary: (samplesPerGroup = 5) =>
      http
        .get<ErrorSummaryResponse>('/orchestrator/error-summary', {
          params: { samples_per_group: samplesPerGroup },
        })
        .then((r) => r.data),
    agentTraces: (limit = 60) =>
      http
        .get<AgentTracesResponse>('/orchestrator/agent-traces', { params: { limit } })
        .then((r) => r.data),
  },
  exhibitorRefs: {
    stats: () => http.get<RefsStats>('/exhibitor-refs/stats').then((r) => r.data),
    list: (q: RefsQuery = {}) =>
      http
        .get<PaginatedResponse<ExhibitorRefRow>>('/exhibitor-refs', { params: q })
        .then((r) => r.data),
    retry: (refId: string) =>
      http.post(`/exhibitor-refs/${refId}/retry-resolve`).then((r) => r.data),
  },
  triggerRun: (mode: 'dev' | 'normal' | 'aggressive' = 'normal') =>
    http.post('/runs/trigger', { mode }).then((r) => r.data),
  activeRun: () =>
    http
      .get<{ active: Record<string, unknown> | null }>('/runs/active')
      .then((r) => r.data),
  stopRun: (force = false) =>
    http
      .post<{ status: string; mode: string }>('/runs/stop', { force })
      .then((r) => r.data),
  config: {
    listScopeRules: (params: { kind?: ScopeRuleKind; source?: string; enabled?: boolean } = {}) =>
      http
        .get<ScopeRulesResponse>('/config/scope', { params })
        .then((r) => r.data),
    createScopeRule: (body: {
      kind: ScopeRuleKind
      value: string
      source?: 'user' | 'ai_suggested'
      enabled?: boolean
      notes?: string | null
      extra?: Record<string, unknown> | null
    }) =>
      http
        .post<ScopeRule>('/config/scope', body)
        .then((r) => r.data),
    updateScopeRule: (id: string, body: { enabled?: boolean; notes?: string | null }) =>
      http.patch<ScopeRule>(`/config/scope/${id}`, body).then((r) => r.data),
    deleteScopeRule: (id: string) =>
      http.delete<void>(`/config/scope/${id}`).then((r) => r.data),
    getScopePrompt: () =>
      http.get<ScopePromptResponse>('/config/scope/prompt').then((r) => r.data),
    setScopePrompt: (content: string) =>
      http.put<ScopePromptResponse>('/config/scope/prompt', { content }).then((r) => r.data),
    resetScopePrompt: () =>
      http.delete<void>('/config/scope/prompt').then((r) => r.data),
    suggestScopeRules: (body: {
      kind: ScopeRuleKind
      hint: string
      max_suggestions?: number
    }) =>
      http
        .post<ScopeSuggestResponse>('/config/scope/suggest', body)
        .then((r) => r.data),
  },
  labs: {
    candidates: (params: {
      search?: string
      only_with_email?: boolean
      only_with_products?: boolean
      industries?: string[]
      limit?: number
      offset?: number
    } = {}) =>
      http
        .get<LabsCandidatesResponse>('/labs/candidates', {
          params,
          paramsSerializer: { indexes: null },
        })
        .then((r) => r.data),
    candidateIndustries: (params: { only_with_products?: boolean; only_with_email?: boolean } = {}) =>
      http
        .get<LabsCandidateIndustriesResponse>('/labs/candidate-industries', { params })
        .then((r) => r.data),
    suggest: (body: { candidate_vendor_ids?: string[]; industries?: string[] } = {}) =>
      http.post<{ suggestions: FusionSuggestion[] }>('/labs/suggestions', body).then((r) => r.data),
    create: (body: { vendor_ids: string[]; hint?: string }) =>
      http.post<Fusion>('/labs/fusions', body, { timeout: 120000 }).then((r) => r.data),
    list: (params: { limit?: number; offset?: number } = {}) =>
      http.get<{ items: FusionListItem[]; limit: number; offset: number }>('/labs/fusions', { params }).then((r) => r.data),
    detail: (id: string) =>
      http.get<Fusion>(`/labs/fusions/${id}`).then((r) => r.data),
    markCopied: (fusionId: string, emailId: number) =>
      http.post<{ ok: boolean }>(`/labs/fusions/${fusionId}/emails/${emailId}/mark-copied`).then((r) => r.data),
  },
}
