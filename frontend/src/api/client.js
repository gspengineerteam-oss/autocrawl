import axios from 'axios';
const http = axios.create({
    baseURL: '/api',
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
});
export const api = {
    overview: () => http.get('/overview').then((r) => r.data),
    vendors: (q = {}) => http.get('/vendors', { params: q }).then((r) => r.data),
    // Semantic search via ChromaDB vendor_specialty collection. Returns
    // vendor rows ranked by cosine similarity to the query (embedded via
    // Ollama). Falls back to lexical LIKE search with mode="lexical" and
    // degraded=true when the embedding backend is unreachable, so the UI
    // can surface a "cadangan leksikal" chip instead of silently empty.
    vendorsSemantic: (q, limit = 20, country) => http
        .get('/vendors/search/semantic', {
        params: { q, limit, ...(country ? { country } : {}) },
    })
        .then((r) => r.data),
    vendor: (domain) => http.get(`/vendors/${domain}`).then((r) => r.data),
    deepenVendor: (vendorId) => http.post(`/vendors/${vendorId}/deepen`).then((r) => r.data),
    // Phase 5 — enqueue product-catalog enrichment for one vendor.
    deepenVendorProducts: (vendorId) => http.post(`/vendors/${vendorId}/deepen-products`).then((r) => r.data),
    // Industrial-invitation email draft per (vendor, language). Persisted.
    vendorEmailDraft: {
        get: (vendorId, language = 'en') => http
            .get(`/vendors/${vendorId}/email-draft`, { params: { language } })
            .then((r) => r.data),
        list: (vendorId) => http
            .get(`/vendors/${vendorId}/email-drafts`)
            .then((r) => r.data),
        generate: (vendorId, body = {}) => http
            .post(`/vendors/${vendorId}/email-draft/generate`, body)
            .then((r) => r.data),
        save: (vendorId, body, language = 'en') => http
            .put(`/vendors/${vendorId}/email-draft`, body, { params: { language } })
            .then((r) => r.data),
    },
    // Vendor PDF dossier - structured content from LLM, frontend renders to PDF.
    // 180s timeout: Mistral dossier generation can take 60-120s for vendors
    // with rich product catalogs; 90s was hitting the boundary.
    vendorDossierContent: (vendorId, language = 'en') => http
        .post(`/vendors/${vendorId}/dossier-content`, null, { params: { language }, timeout: 180_000 })
        .then((r) => r.data),
    expos: (q = {}) => http.get('/expos', { params: q }).then((r) => r.data),
    expo: (expoId) => http.get(`/expos/${expoId}`).then((r) => r.data),
    deepenExpo: (expoId) => http.post(`/expos/${expoId}/deepen`).then((r) => r.data),
    pdfs: (expoId) => http
        .get('/pdfs', { params: expoId ? { expo_id: expoId } : {} })
        .then((r) => r.data),
    runs: (limit = 20) => http.get('/runs', { params: { limit } }).then((r) => r.data),
    stats: {
        industries: () => http.get('/stats/industries').then((r) => r.data),
        countries: (limit = 10) => http.get('/stats/countries', { params: { limit } }).then((r) => r.data),
        sourceTypes: () => http.get('/stats/source-types').then((r) => r.data),
        timeline: (days = 30) => http.get('/stats/timeline', { params: { days } }).then((r) => r.data),
        runsMode: (days = 30) => http.get('/stats/runs-mode', { params: { days } }).then((r) => r.data),
        expoCountries: () => http.get('/stats/expo-countries').then((r) => r.data),
        expoCountryDetail: (country) => http
            .get(`/stats/expo-countries/${encodeURIComponent(country)}`)
            .then((r) => r.data),
        countryArcs: (limit = 80) => http
            .get('/stats/country-arcs', { params: { limit } })
            .then((r) => r.data),
    },
    health: () => http.get('/health').then((r) => r.data),
    settings: () => http.get('/settings').then((r) => r.data),
    system: {
        llmQueue: () => http.get('/system/llm-queue').then((r) => r.data),
        ollamaPs: () => http.get('/system/ollama-ps').then((r) => r.data),
        agenticSessions: () => http.get('/system/agentic-sessions').then((r) => r.data),
        enrichProgress: () => http.get('/system/enrich-progress').then((r) => r.data),
    },
    orchestrator: {
        state: () => http.get('/orchestrator/state').then((r) => r.data),
        events: (since = '0', limit = 50) => http
            .get('/orchestrator/events', { params: { since, limit } })
            .then((r) => r.data),
        current: () => http.get('/orchestrator/current').then((r) => r.data),
        throughput: (windowSeconds = 60) => http
            .get('/orchestrator/throughput', {
            params: { window_seconds: windowSeconds },
        })
            .then((r) => r.data),
        errorSummary: (samplesPerGroup = 5) => http
            .get('/orchestrator/error-summary', {
            params: { samples_per_group: samplesPerGroup },
        })
            .then((r) => r.data),
        agentTraces: (limit = 60) => http
            .get('/orchestrator/agent-traces', { params: { limit } })
            .then((r) => r.data),
    },
    exhibitorRefs: {
        stats: () => http.get('/exhibitor-refs/stats').then((r) => r.data),
        list: (q = {}) => http
            .get('/exhibitor-refs', { params: q })
            .then((r) => r.data),
        retry: (refId) => http.post(`/exhibitor-refs/${refId}/retry-resolve`).then((r) => r.data),
    },
    triggerRun: (mode = 'normal') => http.post('/runs/trigger', { mode }).then((r) => r.data),
    activeRun: () => http
        .get('/runs/active')
        .then((r) => r.data),
    stopRun: (force = false) => http
        .post('/runs/stop', { force })
        .then((r) => r.data),
    config: {
        listScopeRules: (params = {}) => http
            .get('/config/scope', { params })
            .then((r) => r.data),
        createScopeRule: (body) => http
            .post('/config/scope', body)
            .then((r) => r.data),
        updateScopeRule: (id, body) => http.patch(`/config/scope/${id}`, body).then((r) => r.data),
        deleteScopeRule: (id) => http.delete(`/config/scope/${id}`).then((r) => r.data),
        getScopePrompt: () => http.get('/config/scope/prompt').then((r) => r.data),
        setScopePrompt: (content) => http.put('/config/scope/prompt', { content }).then((r) => r.data),
        resetScopePrompt: () => http.delete('/config/scope/prompt').then((r) => r.data),
        suggestScopeRules: (body) => http
            .post('/config/scope/suggest', body)
            .then((r) => r.data),
    },
    labs: {
        candidates: (params = {}) => http
            .get('/labs/candidates', {
            params,
            paramsSerializer: { indexes: null },
        })
            .then((r) => r.data),
        candidateIndustries: (params = {}) => http
            .get('/labs/candidate-industries', { params })
            .then((r) => r.data),
        suggest: (body = {}) => http.post('/labs/suggestions', body).then((r) => r.data),
        create: (body) => http.post('/labs/fusions', body, { timeout: 120000 }).then((r) => r.data),
        list: (params = {}) => http.get('/labs/fusions', { params }).then((r) => r.data),
        detail: (id) => http.get(`/labs/fusions/${id}`).then((r) => r.data),
        markCopied: (fusionId, emailId) => http.post(`/labs/fusions/${fusionId}/emails/${emailId}/mark-copied`).then((r) => r.data),
    },
};
