// Map raw industry/topic/scope tag -> human-readable Indonesian label + FA icon.
// Sumber tag bisa beragam: scope_classifier (security_defense, law_enforcement, ...),
// industry kolom vendor (defense, cybersecurity, aerospace, ...), atau matched_topics
// dari produk. Matching pakai pattern substring supaya tahan variasi.
const RULES = [
    { patterns: /law[_\s-]?enforcement|\bpolice\b|kepolisian|penegakan/i,
        label: 'Penegakan Hukum', icon: ['fas', 'gavel'] },
    { patterns: /security[_\s-]?defen[sc]e|\bdefense\b|\bdefence\b|pertahanan|hankam/i,
        label: 'Pertahanan & Keamanan', icon: ['fas', 'shield-halved'] },
    { patterns: /border[_\s-]?control|customs|imigrasi|perbatasan/i,
        label: 'Perbatasan & Bea Cukai', icon: ['fas', 'passport'] },
    { patterns: /cyber[_\s-]?security|cyber|infosec|siber/i,
        label: 'Keamanan Siber', icon: ['fas', 'user-shield'] },
    { patterns: /surveillance|isr|recon|pengawasan|pemantauan/i,
        label: 'Pengawasan & ISR', icon: ['fas', 'satellite-dish'] },
    { patterns: /critical[_\s-]?infrastructure|scada|industrial[_\s-]?control|infrastruktur/i,
        label: 'Infrastruktur Kritis', icon: ['fas', 'industry'] },
    { patterns: /aerospace|aviation|drone|uav|unmanned|dirgantara|kedirgantaraan/i,
        label: 'Aerospace & UAV', icon: ['fas', 'plane'] },
    { patterns: /maritime|naval|marine|maritim|laut/i,
        label: 'Maritim', icon: ['fas', 'anchor'] },
    { patterns: /munition|ammunition|weapon|firearm|amunisi|senjata/i,
        label: 'Munisi & Senjata', icon: ['fas', 'bomb'] },
    { patterns: /energy|power|oil|gas|nuclear|energi/i,
        label: 'Energi', icon: ['fas', 'bolt'] },
    { patterns: /\bit\b|software|saas|cloud|teknologi[_\s-]?informasi/i,
        label: 'Teknologi Informasi', icon: ['fas', 'code'] },
    { patterns: /communication|telecom|broadcast|komunikasi/i,
        label: 'Komunikasi', icon: ['fas', 'tower-broadcast'] },
    { patterns: /robot|autonomous|otonom/i,
        label: 'Robotika', icon: ['fas', 'robot'] },
    { patterns: /target|crosshair|sniper|tactical|taktis/i,
        label: 'Sistem Taktis', icon: ['fas', 'crosshairs'] },
];
const DEFAULT_ICON = ['fas', 'tags'];
function titleCase(raw) {
    return raw
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(' ');
}
export function presentTag(raw) {
    if (!raw)
        return { label: '', icon: DEFAULT_ICON };
    for (const r of RULES) {
        if (r.patterns.test(raw))
            return { label: r.label, icon: r.icon };
    }
    return { label: titleCase(raw), icon: DEFAULT_ICON };
}
