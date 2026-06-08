/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api/client';
import HudPanel from '@/components/HudPanel.vue';
import HudEmptyState from '@/components/HudEmptyState.vue';
const tabs = [
    {
        id: 'scope',
        label: 'Kata Kunci Cakupan',
        code: 'CFG-01',
        kinds: ['scope_keyword_include', 'scope_keyword_exclude'],
        description: 'Kata kunci yang dipakai LLM saat menilai vendor masuk cakupan (in-scope) atau bukan. Default kosong - tambahkan sesuai industri target.',
    },
    {
        id: 'blacklist',
        label: 'Blacklist Domain',
        code: 'CFG-02',
        kinds: ['blacklist_domain', 'whitelist_domain'],
        description: 'Domain yang TIDAK boleh dianggap vendor (blacklist) atau yang harus tetap diloloskan walau ada di blacklist (whitelist).',
    },
    {
        id: 'topics',
        label: 'Seed Topik',
        code: 'CFG-03',
        kinds: ['seed_topic', 'anchor_expo'],
        description: 'Topik diskoveri dan event "anchor" yang dipakai LLM untuk meng-expand query. Mempengaruhi expo apa yang masuk pipeline.',
    },
    {
        id: 'prompt',
        label: 'Prompt AI',
        code: 'CFG-04',
        kinds: [],
        description: 'System prompt yang dipakai scope_classifier saat memutuskan vendor in-scope. Edit untuk mengubah perilaku AI secara realtime.',
    },
];
const activeTab = ref('scope');
const currentTab = computed(() => tabs.find((t) => t.id === activeTab.value));
const queryClient = useQueryClient();
const scopeRulesQ = useQuery({
    queryKey: ['scopeRules'],
    queryFn: () => api.config.listScopeRules(),
    refetchInterval: 5000,
});
const allRules = computed(() => scopeRulesQ.data.value?.items ?? []);
function rulesForKind(kind) {
    return allRules.value.filter((r) => r.kind === kind);
}
const toggleMut = useMutation({
    mutationFn: (vars) => api.config.updateScopeRule(vars.id, { enabled: vars.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scopeRules'] }),
});
const deleteMut = useMutation({
    mutationFn: (id) => api.config.deleteScopeRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scopeRules'] }),
});
const createMut = useMutation({
    mutationFn: (vars) => api.config.createScopeRule({ kind: vars.kind, value: vars.value, notes: vars.notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scopeRules'] }),
});
const newRuleValue = ref({});
const errorMessage = ref('');
async function addRule(kind) {
    const value = (newRuleValue.value[kind] || '').trim();
    if (!value)
        return;
    errorMessage.value = '';
    try {
        await createMut.mutateAsync({ kind, value });
        newRuleValue.value[kind] = '';
    }
    catch (e) {
        errorMessage.value = humanizeError(e);
    }
}
async function toggleRule(rule) {
    errorMessage.value = '';
    try {
        await toggleMut.mutateAsync({ id: rule.id, enabled: !rule.enabled });
    }
    catch (e) {
        errorMessage.value = humanizeError(e);
    }
}
async function removeRule(rule) {
    errorMessage.value = '';
    if (rule.source === 'yaml_default') {
        errorMessage.value =
            'Aturan YAML default tidak bisa dihapus permanen — gunakan tombol toggle untuk menonaktifkan.';
        return;
    }
    try {
        await deleteMut.mutateAsync(rule.id);
    }
    catch (e) {
        errorMessage.value = humanizeError(e);
    }
}
function humanizeError(e) {
    if (e && typeof e === 'object' && 'response' in e) {
        const resp = e.response;
        if (resp?.data?.detail)
            return resp.data.detail;
    }
    if (e instanceof Error)
        return e.message;
    return String(e);
}
// ----- AI Suggest modal state -----
const suggestModalOpen = ref(false);
const suggestKind = ref(null);
const suggestHint = ref('');
const suggestLoading = ref(false);
const suggestResults = ref([]);
const suggestSelected = ref(new Set());
const suggestError = ref('');
function openSuggest(kind) {
    suggestKind.value = kind;
    suggestHint.value = '';
    suggestResults.value = [];
    suggestSelected.value = new Set();
    suggestError.value = '';
    suggestModalOpen.value = true;
}
async function runSuggest() {
    if (!suggestKind.value || !suggestHint.value.trim())
        return;
    suggestLoading.value = true;
    suggestError.value = '';
    try {
        const res = await api.config.suggestScopeRules({
            kind: suggestKind.value,
            hint: suggestHint.value.trim(),
            max_suggestions: 10,
        });
        suggestResults.value = res.suggestions;
        suggestSelected.value = new Set(res.suggestions.map((s) => s.value));
    }
    catch (e) {
        suggestError.value = humanizeError(e);
    }
    finally {
        suggestLoading.value = false;
    }
}
async function applySuggestions() {
    if (!suggestKind.value)
        return;
    const kind = suggestKind.value;
    const chosen = suggestResults.value.filter((s) => suggestSelected.value.has(s.value));
    if (chosen.length === 0) {
        suggestModalOpen.value = false;
        return;
    }
    suggestLoading.value = true;
    suggestError.value = '';
    try {
        for (const s of chosen) {
            await api.config.createScopeRule({
                kind,
                value: s.value,
                source: 'ai_suggested',
                notes: s.reason || null,
            });
        }
        queryClient.invalidateQueries({ queryKey: ['scopeRules'] });
        suggestModalOpen.value = false;
    }
    catch (e) {
        suggestError.value = humanizeError(e);
    }
    finally {
        suggestLoading.value = false;
    }
}
function toggleSuggestion(value) {
    const next = new Set(suggestSelected.value);
    if (next.has(value))
        next.delete(value);
    else
        next.add(value);
    suggestSelected.value = next;
}
// ----- Prompt tab -----
const promptQ = useQuery({
    queryKey: ['scopePrompt'],
    queryFn: () => api.config.getScopePrompt(),
    refetchInterval: 10000,
});
const promptDraft = ref('');
const promptDraftDirty = ref(false);
const promptStatus = ref('');
function onPromptInput(value) {
    promptDraft.value = value;
    promptDraftDirty.value = true;
    promptStatus.value = '';
}
const setPromptMut = useMutation({
    mutationFn: (content) => api.config.setScopePrompt(content),
    onSuccess: () => {
        promptStatus.value = 'Tersimpan. Berlaku realtime untuk klasifikasi berikutnya.';
        promptDraftDirty.value = false;
        queryClient.invalidateQueries({ queryKey: ['scopePrompt'] });
    },
});
const resetPromptMut = useMutation({
    mutationFn: () => api.config.resetScopePrompt(),
    onSuccess: () => {
        promptStatus.value = 'Dikembalikan ke default sistem.';
        promptDraftDirty.value = false;
        queryClient.invalidateQueries({ queryKey: ['scopePrompt'] });
    },
});
// keep draft in sync with server when not dirty
const promptServerContent = computed(() => promptQ.data.value?.content ?? '');
const promptIsCustom = computed(() => promptQ.data.value?.is_custom ?? false);
watch(promptServerContent, (next) => {
    if (!promptDraftDirty.value && next)
        promptDraft.value = next;
}, { immediate: true });
async function savePrompt() {
    if (!promptDraft.value.trim()) {
        promptStatus.value = 'Konten tidak boleh kosong.';
        return;
    }
    promptStatus.value = '';
    await setPromptMut.mutateAsync(promptDraft.value);
}
async function resetPrompt() {
    if (!confirm('Reset prompt ke default? Versi kustom akan dihapus.'))
        return;
    await resetPromptMut.mutateAsync();
    promptDraft.value = '';
}
// ----- Helpers -----
const KIND_LABEL = {
    scope_keyword_include: 'Kata kunci IN-SCOPE',
    scope_keyword_exclude: 'Kata kunci OUT-OF-SCOPE',
    blacklist_domain: 'Domain Blacklist',
    whitelist_domain: 'Domain Whitelist',
    seed_topic: 'Seed Topik',
    anchor_expo: 'Anchor Expo',
};
const KIND_PLACEHOLDER = {
    scope_keyword_include: 'cth: ballistic, surveillance camera, ISR',
    scope_keyword_exclude: 'cth: tour package, hotel chain',
    blacklist_domain: 'cth: example.com',
    whitelist_domain: 'cth: dual-use-vendor.com',
    seed_topic: 'cth: maritime_security',
    anchor_expo: 'cth: Defense & Security Bangkok',
};
function sourceBadgeClass(src) {
    if (src === 'yaml_default')
        return 'hud-pill border-base-300 bg-base-100 text-base-600 dark:border-base-700 dark:bg-base-800 dark:text-base-300';
    if (src === 'ai_suggested')
        return 'hud-pill border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300';
    return 'hud-pill border-ok-600/30 bg-ok-500/10 text-ok-700 dark:text-ok-300';
}
function sourceBadgeLabel(src) {
    if (src === 'yaml_default')
        return 'YAML';
    if (src === 'ai_suggested')
        return 'AI';
    return 'USER';
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-3 p-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "flex border-b border-base-200 dark:border-base-700" },
});
for (const [tab] of __VLS_getVForSourceType((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.activeTab = tab.id;
            } },
        key: (tab.id),
        ...{ class: ([
                'relative flex items-center gap-2 border-b-2 px-3 py-2 font-mono text-2xs font-medium uppercase tracking-ops transition-colors',
                __VLS_ctx.activeTab === tab.id
                    ? 'border-accent-500 text-accent-700 dark:text-accent-300'
                    : 'border-transparent text-base-500 hover:text-base-800 dark:text-base-400 dark:hover:text-base-100',
            ]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-base-400 dark:text-base-600" },
    });
    (tab.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (tab.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "font-mono text-xs leading-relaxed text-base-600 dark:text-base-400" },
});
(__VLS_ctx.currentTab.description);
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rounded-md border border-crit-500/40 bg-crit-500/10 px-3 py-2 font-mono text-xs text-crit-700 dark:text-crit-300" },
    });
    (__VLS_ctx.errorMessage);
}
if (__VLS_ctx.activeTab !== 'prompt') {
    for (const [kind] of __VLS_getVForSourceType((__VLS_ctx.currentTab.kinds))) {
        /** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
            key: (kind),
            title: (__VLS_ctx.KIND_LABEL[kind]),
            code: (kind.toUpperCase()),
        }));
        const __VLS_1 = __VLS_0({
            key: (kind),
            title: (__VLS_ctx.KIND_LABEL[kind]),
            code: (kind.toUpperCase()),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        __VLS_2.slots.default;
        {
            const { actions: __VLS_thisSlot } = __VLS_2.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab !== 'prompt'))
                            return;
                        __VLS_ctx.openSuggest(kind);
                    } },
                ...{ class: "hud-btn-ghost" },
                type: "button",
            });
            const __VLS_3 = {}.FaIcon;
            /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
            // @ts-ignore
            const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
                icon: (['fas', 'wand-magic-sparkles']),
                ...{ class: "text-2xs" },
            }));
            const __VLS_5 = __VLS_4({
                icon: (['fas', 'wand-magic-sparkles']),
                ...{ class: "text-2xs" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_4));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col gap-2.5" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onKeydown: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab !== 'prompt'))
                        return;
                    __VLS_ctx.addRule(kind);
                } },
            placeholder: (__VLS_ctx.KIND_PLACEHOLDER[kind]),
            ...{ class: "hud-input flex-1" },
        });
        (__VLS_ctx.newRuleValue[kind]);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab !== 'prompt'))
                        return;
                    __VLS_ctx.addRule(kind);
                } },
            ...{ class: "hud-btn-primary" },
            type: "button",
        });
        const __VLS_7 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
            icon: (['fas', 'plus']),
            ...{ class: "text-2xs" },
        }));
        const __VLS_9 = __VLS_8({
            icon: (['fas', 'plus']),
            ...{ class: "text-2xs" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        if (__VLS_ctx.rulesForKind(kind).length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "py-4" },
            });
            /** @type {[typeof HudEmptyState, ]} */ ;
            // @ts-ignore
            const __VLS_11 = __VLS_asFunctionalComponent(HudEmptyState, new HudEmptyState({
                title: "Belum ada aturan untuk kategori ini.",
            }));
            const __VLS_12 = __VLS_11({
                title: "Belum ada aturan untuk kategori ini.",
            }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
                ...{ class: "hud-table" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ class: "text-left" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ class: "text-left" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ class: "text-left" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ class: "text-left" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ class: "text-right" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
            for (const [row] of __VLS_getVForSourceType((__VLS_ctx.rulesForKind(kind)))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                    key: (row.id),
                    ...{ class: ([!row.enabled ? 'opacity-50' : '']) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ class: "px-3 py-1.5 font-mono text-xs" },
                });
                (row.value);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ class: "px-3 py-1.5" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: (__VLS_ctx.sourceBadgeClass(row.source)) },
                });
                (__VLS_ctx.sourceBadgeLabel(row.source));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ class: "px-3 py-1.5" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab !== 'prompt'))
                                return;
                            if (!!(__VLS_ctx.rulesForKind(kind).length === 0))
                                return;
                            __VLS_ctx.toggleRule(row);
                        } },
                    ...{ class: "hud-btn-ghost gap-1 text-2xs" },
                    type: "button",
                });
                const __VLS_14 = {}.FaIcon;
                /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
                // @ts-ignore
                const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
                    icon: (['fas', row.enabled ? 'toggle-on' : 'toggle-off']),
                    ...{ class: (row.enabled ? 'text-ok-500' : 'text-base-400') },
                }));
                const __VLS_16 = __VLS_15({
                    icon: (['fas', row.enabled ? 'toggle-on' : 'toggle-off']),
                    ...{ class: (row.enabled ? 'text-ok-500' : 'text-base-400') },
                }, ...__VLS_functionalComponentArgsRest(__VLS_15));
                (row.enabled ? 'Aktif' : 'Off');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ class: "px-3 py-1.5 font-mono text-2xs text-base-500 dark:text-base-400" },
                });
                (row.notes || '—');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ class: "px-3 py-1.5 text-right" },
                });
                if (row.source !== 'yaml_default') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.activeTab !== 'prompt'))
                                    return;
                                if (!!(__VLS_ctx.rulesForKind(kind).length === 0))
                                    return;
                                if (!(row.source !== 'yaml_default'))
                                    return;
                                __VLS_ctx.removeRule(row);
                            } },
                        ...{ class: "hud-btn-ghost gap-1 text-2xs text-crit-600 hover:text-crit-700 dark:text-crit-400" },
                        type: "button",
                        disabled: (__VLS_ctx.deleteMut.isPending.value),
                    });
                    const __VLS_18 = {}.FaIcon;
                    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
                        icon: (['fas', 'trash']),
                        ...{ class: "text-2xs" },
                    }));
                    const __VLS_20 = __VLS_19({
                        icon: (['fas', 'trash']),
                        ...{ class: "text-2xs" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "font-mono text-2xs text-base-400 dark:text-base-600" },
                        title: "Aturan YAML default hanya bisa di-toggle, tidak bisa dihapus",
                    });
                }
            }
        }
        var __VLS_2;
    }
}
else {
    /** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
        title: "System Prompt — Scope Classifier",
        code: "CFG-04",
    }));
    const __VLS_23 = __VLS_22({
        title: "System Prompt — Scope Classifier",
        code: "CFG-04",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    {
        const { actions: __VLS_thisSlot } = __VLS_24.slots;
        if (__VLS_ctx.promptIsCustom) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "hud-pill border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300" },
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "hud-pill border-base-300 bg-base-100 text-base-600 dark:border-base-700 dark:bg-base-800 dark:text-base-300" },
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col gap-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "font-mono text-xs leading-relaxed text-base-600 dark:text-base-400" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        ...{ onInput: (...[$event]) => {
                if (!!(__VLS_ctx.activeTab !== 'prompt'))
                    return;
                __VLS_ctx.onPromptInput($event.target.value);
            } },
        ...{ class: "hud-input min-h-[320px] font-mono text-xs leading-relaxed" },
        value: (__VLS_ctx.promptDraft || __VLS_ctx.promptServerContent),
        spellcheck: "false",
    });
    if (__VLS_ctx.promptStatus) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "font-mono text-2xs uppercase tracking-ops text-ok-600 dark:text-ok-400" },
        });
        (__VLS_ctx.promptStatus);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.savePrompt) },
        ...{ class: "hud-btn-primary" },
        type: "button",
        disabled: (__VLS_ctx.setPromptMut.isPending.value || !__VLS_ctx.promptDraftDirty),
    });
    const __VLS_25 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
        icon: (['fas', 'check']),
        ...{ class: "text-2xs" },
    }));
    const __VLS_27 = __VLS_26({
        icon: (['fas', 'check']),
        ...{ class: "text-2xs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.resetPrompt) },
        ...{ class: "hud-btn-ghost" },
        type: "button",
        disabled: (!__VLS_ctx.promptIsCustom || __VLS_ctx.resetPromptMut.isPending.value),
    });
    const __VLS_29 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        icon: (['fas', 'rotate']),
        ...{ class: "text-2xs" },
    }));
    const __VLS_31 = __VLS_30({
        icon: (['fas', 'rotate']),
        ...{ class: "text-2xs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    var __VLS_24;
}
if (__VLS_ctx.suggestModalOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.suggestModalOpen))
                    return;
                __VLS_ctx.suggestModalOpen = false;
            } },
        ...{ class: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hud-panel w-full max-w-2xl" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hud-panel-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    const __VLS_33 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        icon: (['fas', 'robot']),
        ...{ class: "text-2xs text-accent-500" },
    }));
    const __VLS_35 = __VLS_34({
        icon: (['fas', 'robot']),
        ...{ class: "text-2xs text-accent-500" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "hud-panel-title" },
    });
    (__VLS_ctx.suggestKind ? __VLS_ctx.KIND_LABEL[__VLS_ctx.suggestKind] : '');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.suggestModalOpen))
                    return;
                __VLS_ctx.suggestModalOpen = false;
            } },
        ...{ class: "hud-btn-ghost" },
        type: "button",
    });
    const __VLS_37 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        icon: (['fas', 'xmark']),
        ...{ class: "text-2xs" },
    }));
    const __VLS_39 = __VLS_38({
        icon: (['fas', 'xmark']),
        ...{ class: "text-2xs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hud-panel-body flex flex-col gap-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col gap-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.suggestHint),
        ...{ class: "hud-input min-h-[80px]" },
        placeholder: "cth: hotel chain Asia yang sering nyangkut, atau platform event ticketing",
        spellcheck: "false",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.runSuggest) },
        ...{ class: "hud-btn-primary self-start" },
        type: "button",
        disabled: (!__VLS_ctx.suggestHint.trim() || __VLS_ctx.suggestLoading),
    });
    const __VLS_41 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        icon: (['fas', 'wand-magic-sparkles']),
        ...{ class: "text-2xs" },
    }));
    const __VLS_43 = __VLS_42({
        icon: (['fas', 'wand-magic-sparkles']),
        ...{ class: "text-2xs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    (__VLS_ctx.suggestLoading ? 'Memproses…' : 'Minta Saran');
    if (__VLS_ctx.suggestError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rounded-md border border-crit-500/40 bg-crit-500/10 px-3 py-2 font-mono text-xs text-crit-700 dark:text-crit-300" },
        });
        (__VLS_ctx.suggestError);
    }
    if (__VLS_ctx.suggestResults.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-col gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
        });
        (__VLS_ctx.suggestSelected.size);
        (__VLS_ctx.suggestResults.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex max-h-72 flex-col gap-1.5 overflow-y-auto" },
        });
        for (const [s] of __VLS_getVForSourceType((__VLS_ctx.suggestResults))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (s.value),
                ...{ class: "flex cursor-pointer items-start gap-2 border border-base-200 bg-base-50/50 px-3 py-2 hover:bg-base-100 dark:border-base-700 dark:bg-base-800/50 dark:hover:bg-base-800" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.suggestModalOpen))
                            return;
                        if (!(__VLS_ctx.suggestResults.length > 0))
                            return;
                        __VLS_ctx.toggleSuggestion(s.value);
                    } },
                type: "checkbox",
                checked: (__VLS_ctx.suggestSelected.has(s.value)),
                ...{ class: "mt-0.5" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex-1" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "font-mono text-xs font-medium text-base-800 dark:text-base-100" },
            });
            (s.value);
            if (s.reason) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "font-mono text-2xs text-base-500 dark:text-base-400" },
                });
                (s.reason);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "hud-chip self-start" },
            });
            (Math.round(s.confidence * 100));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex justify-end gap-2 pt-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.suggestModalOpen))
                        return;
                    if (!(__VLS_ctx.suggestResults.length > 0))
                        return;
                    __VLS_ctx.suggestModalOpen = false;
                } },
            ...{ class: "hud-btn-ghost" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.applySuggestions) },
            ...{ class: "hud-btn-primary" },
            type: "button",
            disabled: (__VLS_ctx.suggestSelected.size === 0 || __VLS_ctx.suggestLoading),
        });
        const __VLS_45 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
            icon: (['fas', 'plus']),
            ...{ class: "text-2xs" },
        }));
        const __VLS_47 = __VLS_46({
            icon: (['fas', 'plus']),
            ...{ class: "text-2xs" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_46));
        (__VLS_ctx.suggestSelected.size);
    }
}
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-crit-500/40']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-crit-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-crit-300']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-input']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-table']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-600']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-crit-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-crit-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['border-accent-500/40']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-accent-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-input']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-[320px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-ok-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-black/50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-panel-body']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-input']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-[80px]']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['self-start']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-crit-500/40']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-crit-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-crit-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['max-h-72']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50/50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-800/50']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:hover:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['self-start']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudPanel: HudPanel,
            HudEmptyState: HudEmptyState,
            tabs: tabs,
            activeTab: activeTab,
            currentTab: currentTab,
            rulesForKind: rulesForKind,
            deleteMut: deleteMut,
            newRuleValue: newRuleValue,
            errorMessage: errorMessage,
            addRule: addRule,
            toggleRule: toggleRule,
            removeRule: removeRule,
            suggestModalOpen: suggestModalOpen,
            suggestKind: suggestKind,
            suggestHint: suggestHint,
            suggestLoading: suggestLoading,
            suggestResults: suggestResults,
            suggestSelected: suggestSelected,
            suggestError: suggestError,
            openSuggest: openSuggest,
            runSuggest: runSuggest,
            applySuggestions: applySuggestions,
            toggleSuggestion: toggleSuggestion,
            promptDraft: promptDraft,
            promptDraftDirty: promptDraftDirty,
            promptStatus: promptStatus,
            onPromptInput: onPromptInput,
            setPromptMut: setPromptMut,
            resetPromptMut: resetPromptMut,
            promptServerContent: promptServerContent,
            promptIsCustom: promptIsCustom,
            savePrompt: savePrompt,
            resetPrompt: resetPrompt,
            KIND_LABEL: KIND_LABEL,
            KIND_PLACEHOLDER: KIND_PLACEHOLDER,
            sourceBadgeClass: sourceBadgeClass,
            sourceBadgeLabel: sourceBadgeLabel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
