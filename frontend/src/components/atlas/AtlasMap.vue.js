/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import landTopo from 'world-atlas/land-110m.json';
import { api } from '@/api/client';
import { resolveCountry } from '@/data/country_resolver';
/**
 * Operator dark world map - Leaflet engine, industrial-instrument layers.
 *
 *   1. Graticule  : dotted lat/lng grid (sextant feel)
 *   2. Land base  : darker-than-bg fill, hairline borders
 *   3. Arcs       : 3 stacked layers + animated traveling packet
 *   4. Markers    : SVG crosshair with pulse ring + corner ticks
 *   5. Top labels : permanent leader-line callouts for top-3 hubs
 *   6. Chrome     : compass rose, gradient legend, tally strip
 *
 * Reference benchmarks: Cloudflare Radar, Bloomberg Terminal,
 * Flightradar24 - dense, scientific, amber-on-navy.
 */
const router = useRouter();
const expoCountries = useQuery({
    queryKey: ['stats', 'expo-countries'],
    queryFn: api.stats.expoCountries,
    refetchInterval: 15_000,
    staleTime: 0,
});
const vendorCountries = useQuery({
    queryKey: ['stats', 'countries'],
    queryFn: () => api.stats.countries(50),
    refetchInterval: 15_000,
    staleTime: 0,
});
const countryArcs = useQuery({
    queryKey: ['stats', 'country-arcs'],
    queryFn: () => api.stats.countryArcs(80),
    refetchInterval: 30_000,
    staleTime: 0,
});
const points = computed(() => {
    const expoRows = (expoCountries.data.value ?? []);
    const vendorRows = (vendorCountries.data.value ?? []);
    const merged = new Map();
    for (const r of expoRows) {
        if (!r.country)
            continue;
        merged.set(r.country, { expos: r.expo_count ?? 0, vendors: r.vendor_count ?? 0 });
    }
    for (const r of vendorRows) {
        if (!r.country)
            continue;
        const ex = merged.get(r.country);
        if (ex)
            ex.vendors = Math.max(ex.vendors, r.count ?? 0);
        else
            merged.set(r.country, { expos: 0, vendors: r.count ?? 0 });
    }
    const byIso = new Map();
    for (const [country, data] of merged) {
        const rec = resolveCountry(country);
        if (!rec)
            continue;
        const ex = byIso.get(rec.cca2);
        if (ex) {
            ex.expos += data.expos;
            ex.vendors = Math.max(ex.vendors, data.vendors);
        }
        else {
            byIso.set(rec.cca2, {
                iso2: rec.cca2, name: rec.name,
                lat: rec.lat, lon: rec.lon,
                expos: data.expos, vendors: data.vendors,
            });
        }
    }
    const out = [...byIso.values()].filter(p => p.vendors > 0 || p.expos > 0);
    out.sort((a, b) => b.vendors - a.vendors);
    return out;
});
const arcs = computed(() => {
    const list = (countryArcs.data.value ?? []);
    const out = [];
    for (const a of list) {
        const f = resolveCountry(a.from_country);
        const t = resolveCountry(a.to_country);
        if (!f || !t)
            continue;
        if (f.cca2 === t.cca2)
            continue;
        out.push({
            from: { lat: f.lat, lon: f.lon, iso2: f.cca2, name: f.name },
            to: { lat: t.lat, lon: t.lon, iso2: t.cca2, name: t.name },
            vendors: a.vendor_count ?? 0,
            expos: a.expo_count ?? 0,
        });
    }
    return out;
});
const top3 = computed(() => points.value.slice(0, 3));
const mapEl = ref(null);
let map = null;
// @ts-expect-error retained for cleanup hooks even if not read elsewhere
let landLayer = null;
let bordersLayer = null;
// @ts-expect-error retained for cleanup hooks even if not read elsewhere
let graticuleLayer = null;
let pointsLayer = null;
let arcsLayer = null;
let labelsLayer = null;
/* GeoJSON sources from local TopoJSON */
const rawCountriesGeoJson = feature(countriesTopo, countriesTopo.objects.countries);
const rawLandGeoJson = (() => {
    const fc = feature(landTopo, landTopo.objects.land);
    return ('features' in fc)
        ? fc
        : { type: 'FeatureCollection', features: [fc] };
})();
/* -------------------------------------------------------------------- */
/* Antimeridian splitter                                                  */
/*                                                                        */
/* world-atlas TopoJSON has Russia/Fiji as single rings that wrap across   */
/* the 180/-180 boundary. After feature() conversion, that wrap becomes    */
/* a 360deg longitude jump between consecutive points - which Leaflet      */
/* renders as a horizontal line slashing across the entire map.            */
/*                                                                        */
/* This pre-processor walks every ring; when it detects a >180deg jump,   */
/* it splits the ring into two segments and seals each side with a        */
/* synthetic point at the antimeridian (lat interpolated linearly).        */
/* -------------------------------------------------------------------- */
function splitRingAtAntimeridian(ring) {
    if (ring.length < 2)
        return [ring];
    const segments = [];
    let current = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
        const prev = ring[i - 1];
        const curr = ring[i];
        const dLon = curr[0] - prev[0];
        if (Math.abs(dLon) > 180) {
            // Going east-to-west across the dateline if dLon < -180; otherwise west-to-east.
            // sign = +1 means we crossed eastbound (prev near +180, curr near -180).
            const sign = dLon < 0 ? 1 : -1;
            const fromBoundary = sign > 0 ? 180 : -180; // exit on prev's side
            const toBoundary = -fromBoundary; // re-enter on curr's side
            // Interpolate latitude at the dateline using "unwrapped" curr longitude
            // so the interpolation t-parameter is well-formed.
            const unwrappedCurrLon = curr[0] + sign * 360;
            const span = unwrappedCurrLon - prev[0];
            const t = span === 0 ? 0 : (fromBoundary - prev[0]) / span;
            const latAt = prev[1] + t * (curr[1] - prev[1]);
            current.push([fromBoundary, latAt]);
            segments.push(current);
            current = [[toBoundary, latAt], curr];
        }
        else {
            current.push(curr);
        }
    }
    segments.push(current);
    // Close each segment as a ring (repeat first point at end) so it
    // renders as a filled polygon, not an open line.
    return segments
        .filter((seg) => seg.length >= 3)
        .map((seg) => {
        const first = seg[0];
        const last = seg[seg.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1])
            seg.push([first[0], first[1]]);
        return seg;
    });
}
function fixAntimeridian(fc) {
    const features = [];
    for (const f of fc.features) {
        if (!f.geometry) {
            features.push(f);
            continue;
        }
        if (f.geometry.type === 'Polygon') {
            const newRings = [];
            for (const ring of f.geometry.coordinates) {
                for (const seg of splitRingAtAntimeridian(ring))
                    newRings.push(seg);
            }
            if (newRings.length > 0) {
                features.push({ ...f, geometry: { type: 'Polygon', coordinates: newRings } });
            }
        }
        else if (f.geometry.type === 'MultiPolygon') {
            const newPolys = [];
            for (const poly of f.geometry.coordinates) {
                const newRings = [];
                for (const ring of poly) {
                    for (const seg of splitRingAtAntimeridian(ring))
                        newRings.push(seg);
                }
                if (newRings.length > 0)
                    newPolys.push(newRings);
            }
            if (newPolys.length > 0) {
                features.push({ ...f, geometry: { type: 'MultiPolygon', coordinates: newPolys } });
            }
        }
        else {
            features.push(f);
        }
    }
    return { type: 'FeatureCollection', features };
}
const countriesGeoJson = fixAntimeridian(rawCountriesGeoJson);
const landGeoJson = fixAntimeridian(rawLandGeoJson);
/* Lat/lng graticule - dotted instrument grid */
function buildGraticule() {
    const features = [];
    // Parallels every 20deg from -80 to 80
    for (let lat = -80; lat <= 80; lat += 20) {
        const coords = [];
        for (let lon = -180; lon <= 180; lon += 5)
            coords.push([lon, lat]);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { kind: lat === 0 ? 'equator' : 'parallel' } });
    }
    // Meridians every 30deg
    for (let lon = -180; lon <= 180; lon += 30) {
        const coords = [];
        for (let lat = -80; lat <= 80; lat += 5)
            coords.push([lon, lat]);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { kind: lon === 0 ? 'meridian' : 'meridian-secondary' } });
    }
    return { type: 'FeatureCollection', features };
}
const graticuleGeoJson = buildGraticule();
/* Bezier curve for arcs - returns [lat, lon] for Leaflet */
function arcCurve(from, to) {
    const STEPS = 64;
    const out = [];
    const mx = (from.lon + to.lon) / 2;
    const my = (from.lat + to.lat) / 2;
    const dist = Math.sqrt((to.lon - from.lon) ** 2 + (to.lat - from.lat) ** 2);
    const lift = Math.min(28, dist * 0.35);
    const liftDir = (from.lat + to.lat) / 2 < 50 ? 1 : -1;
    const cx = mx;
    const cy = my + lift * liftDir;
    for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const x = (1 - t) * (1 - t) * from.lon + 2 * (1 - t) * t * cx + t * t * to.lon;
        const y = (1 - t) * (1 - t) * from.lat + 2 * (1 - t) * t * cy + t * t * to.lat;
        out.push([y, x]);
    }
    return out;
}
/* Sizing - radius of the OUTER ring in the crosshair marker */
function ringRadius(vendors) {
    if (vendors >= 500)
        return 32;
    if (vendors >= 100)
        return 24;
    if (vendors >= 25)
        return 18;
    if (vendors >= 5)
        return 13;
    if (vendors >= 1)
        return 9;
    return 7;
}
function dotRadius(vendors) {
    if (vendors >= 500)
        return 5.5;
    if (vendors >= 100)
        return 4;
    if (vendors >= 25)
        return 3;
    if (vendors >= 5)
        return 2.4;
    return 2;
}
function markerColor(vendors) {
    if (vendors >= 200)
        return '#FF9230'; // amber-hot
    if (vendors >= 25)
        return '#FFB840'; // amber
    return '#FFC868'; // amber-soft
}
function arcGlowWeight(vendors) {
    if (vendors >= 100)
        return 9;
    if (vendors >= 25)
        return 6;
    if (vendors >= 5)
        return 4;
    return 2;
}
function arcCoreWeight(vendors) {
    if (vendors >= 100)
        return 2.6;
    if (vendors >= 25)
        return 1.8;
    if (vendors >= 5)
        return 1.2;
    return 0.7;
}
function popupHtml(p) {
    const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
    return `
    <div class="autocrawl-dark-popup">
      <div class="popup-name">${escape(p.name)}</div>
      <div class="popup-iso">${escape(p.iso2)} · NODE</div>
      <div class="popup-stats">
        <div class="popup-stat">
          <span class="popup-num">${p.vendors.toLocaleString()}</span>
          <span class="popup-label">Vendor</span>
        </div>
        <div class="popup-stat">
          <span class="popup-num">${p.expos.toLocaleString()}</span>
          <span class="popup-label">Ekspo</span>
        </div>
      </div>
    </div>`;
}
/**
 * Crosshair marker icon — concentric rings + corner ticks + central dot.
 * Rendered as inline SVG so we can animate the pulse ring via SMIL/CSS
 * and keep crisp anti-aliasing at any zoom. The bounding wrap reserves
 * extra room for the pulse animation overshoot.
 */
function makeMarkerIcon(p) {
    const r = ringRadius(p.vendors);
    const d = dotRadius(p.vendors);
    const color = markerColor(p.vendors);
    const isPeak = p.vendors >= 200;
    const isTop = p.vendors >= 25;
    const isHub = p.vendors >= 5;
    const wrap = Math.max(64, r * 2 + 28);
    const cx = wrap / 2;
    const cy = wrap / 2;
    const tickLen = Math.max(3, r * 0.18);
    const tickGap = Math.max(2, r * 0.10);
    const innerRing = Math.max(2, r * 0.55);
    // 4 corner ticks: N S E W just outside outer ring
    const tickN = `<line x1="${cx}" y1="${cy - r - tickGap}" x2="${cx}" y2="${cy - r - tickGap - tickLen}" />`;
    const tickS = `<line x1="${cx}" y1="${cy + r + tickGap}" x2="${cx}" y2="${cy + r + tickGap + tickLen}" />`;
    const tickE = `<line x1="${cx + r + tickGap}" y1="${cy}" x2="${cx + r + tickGap + tickLen}" y2="${cy}" />`;
    const tickW = `<line x1="${cx - r - tickGap}" y1="${cy}" x2="${cx - r - tickGap - tickLen}" y2="${cy}" />`;
    const pulse = isHub ? `
    <circle class="ac-pulse" cx="${cx}" cy="${cy}" r="${r}" fill="none"
            stroke="${color}" stroke-width="1.2" opacity="0.6" />` : '';
    const peakHalo = isPeak ? `
    <circle cx="${cx}" cy="${cy}" r="${r * 1.45}" fill="none"
            stroke="${color}" stroke-width="0.8" opacity="0.18"
            stroke-dasharray="2 3" class="ac-spin" />` : '';
    const html = `
    <div class="ac-mk-wrap" style="width:${wrap}px;height:${wrap}px">
      <svg width="${wrap}" height="${wrap}" viewBox="0 0 ${wrap} ${wrap}"
           class="ac-mk-svg" style="--mk-color:${color}">
        ${peakHalo}
        ${pulse}
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="${color}" stroke-width="1.2" opacity="0.85" />
        <circle cx="${cx}" cy="${cy}" r="${innerRing}" fill="none"
                stroke="${color}" stroke-width="0.8" opacity="0.55"
                stroke-dasharray="${isTop ? '0' : '1.5 2'}" />
        <g class="ac-mk-ticks" stroke="${color}" stroke-width="1.4"
           stroke-linecap="square" opacity="0.95">
          ${tickN}${tickE}${tickS}${tickW}
        </g>
        <circle class="ac-mk-dot" cx="${cx}" cy="${cy}" r="${d}"
                fill="${color}" />
        ${isPeak ? `<circle cx="${cx}" cy="${cy}" r="${d * 0.5}" fill="#FFF0D2" />` : ''}
      </svg>
    </div>`;
    return L.divIcon({
        html,
        className: 'ac-mk',
        iconSize: [wrap, wrap],
        iconAnchor: [wrap / 2, wrap / 2],
    });
}
/**
 * Permanent leader-line label for top hubs. Anchor offset ~52px to the
 * upper-right of the marker, so the label sits clear of the rings.
 */
function makeLabelIcon(p, rank) {
    const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
    const html = `
    <div class="ac-label">
      <span class="ac-label-leader"></span>
      <span class="ac-label-elbow"></span>
      <span class="ac-label-card">
        <span class="ac-label-rank">#${rank}</span>
        <span class="ac-label-iso">${escape(p.iso2)}</span>
        <span class="ac-label-name">${escape(p.name)}</span>
        <span class="ac-label-stat">
          <span class="ac-label-num">${p.vendors.toLocaleString()}</span>
          <span class="ac-label-unit">vendor</span>
        </span>
      </span>
    </div>`;
    return L.divIcon({
        html,
        className: 'ac-label-wrap',
        iconSize: [220, 48],
        iconAnchor: [-32, 48], // marker is at lower-left of the label
    });
}
function renderPoints() {
    if (!pointsLayer)
        return;
    pointsLayer.clearLayers();
    // Smaller-first so larger markers stack above
    const ordered = [...points.value].sort((a, b) => a.vendors - b.vendors);
    for (const p of ordered) {
        const m = L.marker([p.lat, p.lon], {
            icon: makeMarkerIcon(p),
            keyboard: false,
            zIndexOffset: Math.round(p.vendors),
        });
        m
            .bindPopup(popupHtml(p), { className: 'autocrawl-popup-wrap', closeButton: false, offset: [0, -10] })
            .on('mouseover', () => m.openPopup())
            .on('mouseout', () => m.closePopup())
            .on('click', () => router.push({ path: '/vendors', query: { country: p.name } }));
        m.addTo(pointsLayer);
    }
}
function renderLabels() {
    if (!labelsLayer)
        return;
    labelsLayer.clearLayers();
    top3.value.forEach((p, i) => {
        const m = L.marker([p.lat, p.lon], {
            icon: makeLabelIcon(p, i + 1),
            interactive: false,
            keyboard: false,
            zIndexOffset: 10000 + (3 - i), // always above markers
        });
        m.addTo(labelsLayer);
    });
}
function renderArcs() {
    if (!arcsLayer)
        return;
    arcsLayer.clearLayers();
    for (const a of arcs.value) {
        const latlngs = arcCurve(a.from, a.to);
        /* Outer glow halo */
        L.polyline(latlngs, {
            color: '#FFB840',
            weight: arcGlowWeight(a.vendors),
            opacity: 0.32,
            className: 'arc-glow-path',
            interactive: false,
        }).addTo(arcsLayer);
        /* Mid amber blur */
        L.polyline(latlngs, {
            color: '#FFB840',
            weight: arcGlowWeight(a.vendors) * 0.6,
            opacity: 0.55,
            className: 'arc-mid-path',
            interactive: false,
        }).addTo(arcsLayer);
        /* Sharp dotted core - shows direction */
        L.polyline(latlngs, {
            color: '#FFC868',
            weight: arcCoreWeight(a.vendors),
            opacity: 0.85,
            className: 'arc-flow-path',
            interactive: false,
        }).addTo(arcsLayer);
        /* Traveling packet - bright moving segment */
        L.polyline(latlngs, {
            color: '#FFE9B8',
            weight: arcCoreWeight(a.vendors) + 0.6,
            opacity: 0.95,
            className: 'arc-packet-path',
            interactive: false,
        }).addTo(arcsLayer);
    }
}
onMounted(() => {
    if (!mapEl.value)
        return;
    map = L.map(mapEl.value, {
        attributionControl: false,
        zoomControl: false,
        worldCopyJump: false,
        center: [22, 12],
        zoom: 2,
        minZoom: 2,
        maxZoom: 6,
        /* Lock pan to a single world copy. Without this, zooming out
         * exposes empty navy gaps between world copies which looks broken.
         * Viscosity 1.0 makes the bound a hard wall, not just a hint. */
        maxBounds: [[-72, -180], [84, 180]],
        maxBoundsViscosity: 1.0,
        preferCanvas: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    /* L1 Land mass fill - solid base (no per-country fill, just shape) */
    landLayer = L.geoJSON(landGeoJson, {
        style: {
            fillColor: '#162338',
            fillOpacity: 1,
            color: 'transparent',
            weight: 0,
        },
        interactive: false,
    }).addTo(map);
    /* L2 Country borders - per-country path so each is independently
     * hoverable. Subtle hairline normally; on hover, amber-tinted fill
     * + brighter border. Gives the choropleth depth without being noisy. */
    const baseStyle = {
        fillColor: '#FFB840',
        fillOpacity: 0,
        color: '#F0E8D5',
        weight: 0.4,
        opacity: 0.18,
    };
    const hoverStyle = {
        fillColor: '#FFB840',
        fillOpacity: 0.10,
        color: '#FFB840',
        weight: 0.9,
        opacity: 0.65,
    };
    /* Tooltip content is computed lazily on each open so it picks up
     * live data refreshes without rebuilding the borders layer.
     * world-atlas uses Natural Earth names (e.g. "United States of America"),
     * our points use ISO names - try multiple keys for best-effort match. */
    function tooltipFor(featureName) {
        const pointByName = new Map();
        for (const p of points.value) {
            pointByName.set(p.name.toLowerCase(), p);
            pointByName.set(p.iso2.toLowerCase(), p);
        }
        const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
        const key = featureName.toLowerCase();
        let p = pointByName.get(key);
        if (!p) {
            // Fuzzy: try contains-match (e.g. "United States of America" ~ "United States")
            for (const [k, v] of pointByName) {
                if (k.length < 4)
                    continue;
                if (key.includes(k) || k.includes(key)) {
                    p = v;
                    break;
                }
            }
        }
        if (p) {
            return `
        <div class="ac-cty-tip">
          <div class="ac-cty-name">${escape(p.name)}</div>
          <div class="ac-cty-stats">
            <span class="ac-cty-iso">${escape(p.iso2)}</span>
            <span class="ac-cty-num">${p.vendors.toLocaleString()}</span>
            <span class="ac-cty-unit">vendor</span>
            <span class="ac-cty-sep"></span>
            <span class="ac-cty-num">${p.expos.toLocaleString()}</span>
            <span class="ac-cty-unit">ekspo</span>
          </div>
        </div>`;
        }
        return `
      <div class="ac-cty-tip">
        <div class="ac-cty-name">${escape(featureName)}</div>
        <div class="ac-cty-stats">
          <span class="ac-cty-empty">tidak ada data</span>
        </div>
      </div>`;
    }
    bordersLayer = L.geoJSON(countriesGeoJson, {
        style: baseStyle,
        onEachFeature: (feature, layer) => {
            const path = layer;
            const name = feature?.properties?.name ?? '—';
            layer.bindTooltip(() => tooltipFor(name), {
                sticky: true,
                direction: 'top',
                offset: [0, -2],
                className: 'autocrawl-cty-tooltip',
                opacity: 1,
            });
            layer.on({
                mouseover: () => {
                    path.setStyle(hoverStyle);
                    path.bringToFront();
                },
                mouseout: () => {
                    bordersLayer?.resetStyle(path);
                },
            });
        },
    }).addTo(map);
    /* L3 Graticule - lat/lng grid as continuous hairlines. Dasharray
     * was causing choppy/broken-looking artifacts at thin weights;
     * solid lines at very low opacity read cleaner as instrument grid. */
    graticuleLayer = L.geoJSON(graticuleGeoJson, {
        style: (f) => {
            const kind = f?.properties?.kind;
            const isMain = kind === 'equator' || kind === 'meridian';
            return {
                color: '#F0E8D5',
                weight: isMain ? 0.4 : 0.3,
                opacity: isMain ? 0.10 : 0.05,
                lineCap: 'butt',
            };
        },
        interactive: false,
    }).addTo(map);
    /* L4 Arcs */
    arcsLayer = L.layerGroup().addTo(map);
    /* L5 Markers */
    pointsLayer = L.layerGroup().addTo(map);
    /* L6 Top-3 leader labels */
    labelsLayer = L.layerGroup().addTo(map);
    renderArcs();
    renderPoints();
    renderLabels();
});
watch([points, arcs, top3], () => {
    renderArcs();
    renderPoints();
    renderLabels();
});
onBeforeUnmount(() => {
    pointsLayer?.clearLayers();
    arcsLayer?.clearLayers();
    labelsLayer?.clearLayers();
    map?.remove();
    map = null;
    landLayer = null;
    bordersLayer = null;
    graticuleLayer = null;
    pointsLayer = null;
    arcsLayer = null;
    labelsLayer = null;
});
const isLoading = computed(() => expoCountries.isPending.value);
const totalCountries = computed(() => points.value.length);
const totalArcs = computed(() => arcs.value.length);
const totalVendors = computed(() => points.value.reduce((s, p) => s + p.vendors, 0));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "autocrawl-map relative w-full h-full select-none overflow-hidden" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ref: "mapEl",
    ...{ class: "absolute inset-0 w-full h-full" },
});
/** @type {typeof __VLS_ctx.mapEl} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "absolute inset-0 pointer-events-none z-[350] map-vignette" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute left-4 top-3.5 z-[400] flex flex-col pointer-events-none" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber dot-glow blink" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-amber" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display num-amber text-[18px] mt-1 font-semibold leading-none" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[10.5px] text-ink-mute tracking-[0.18em] mt-0.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute right-4 top-3.5 z-[400] flex items-stretch gap-0 pointer-events-none rounded-[6px] overflow-hidden border border-rule bg-surface" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-3 py-1.5 flex flex-col items-end border-r border-rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display num-amber text-[15px] font-semibold leading-none tabular-nums" },
});
(__VLS_ctx.totalCountries);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute text-[9px] mt-0.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-3 py-1.5 flex flex-col items-end border-r border-rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display num-amber text-[15px] font-semibold leading-none tabular-nums" },
});
(__VLS_ctx.totalArcs);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute text-[9px] mt-0.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-3 py-1.5 flex flex-col items-end" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display num-amber text-[15px] font-semibold leading-none tabular-nums" },
});
(__VLS_ctx.totalVendors.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute text-[9px] mt-0.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute left-4 bottom-4 z-[400] flex flex-col gap-2 pointer-events-none bg-surface px-3 py-2.5 rounded-[8px] border border-rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute w-[44px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "legend-gradient" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between w-[160px] num-display text-[9.5px] text-ink-mute tabular-nums" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute w-[44px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "160",
    height: "14",
    viewBox: "0 0 160 14",
    ...{ class: "block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: "0",
    x2: "160",
    y1: "7",
    y2: "7",
    ...{ style: {} },
    'stroke-width': "6",
    'stroke-linecap': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: "6",
    x2: "46",
    y1: "7",
    y2: "7",
    ...{ style: {} },
    'stroke-width': "0.7",
    'stroke-linecap': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: "58",
    x2: "98",
    y1: "7",
    y2: "7",
    ...{ style: {} },
    'stroke-width': "1.4",
    'stroke-linecap': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: "110",
    x2: "155",
    y1: "7",
    y2: "7",
    ...{ style: {} },
    'stroke-width': "2.6",
    'stroke-linecap': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[9.5px] text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute left-4 top-1/2 -translate-y-1/2 z-[400] pointer-events-none" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "56",
    height: "56",
    viewBox: "0 0 56 56",
    ...{ class: "block compass-rose" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "28",
    cy: "28",
    r: "22",
    ...{ style: {} },
    'stroke-width': "0.6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "28",
    cy: "28",
    r: "14",
    fill: "none",
    ...{ style: {} },
    'stroke-width': "0.4",
    'stroke-dasharray': "1 3",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
    points: "28,8 24,28 28,24 32,28",
    ...{ style: {} },
    opacity: "0.95",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
    points: "28,48 24,28 28,32 32,28",
    ...{ style: {} },
    opacity: "0.55",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: "6",
    x2: "14",
    y1: "28",
    y2: "28",
    ...{ style: {} },
    'stroke-width': "0.6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: "42",
    x2: "50",
    y1: "28",
    y2: "28",
    ...{ style: {} },
    'stroke-width': "0.6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "28",
    y: "6",
    'text-anchor': "middle",
    ...{ style: {} },
    'font-family': "Geist Mono Variable, monospace",
    'font-size': "7",
    'font-weight': "700",
    'letter-spacing': "0.18em",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "28",
    y: "56",
    'text-anchor': "middle",
    ...{ style: {} },
    'font-family': "Geist Mono Variable, monospace",
    'font-size': "7",
    'font-weight': "600",
    'letter-spacing': "0.18em",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "3",
    y: "30",
    'text-anchor': "middle",
    ...{ style: {} },
    'font-family': "Geist Mono Variable, monospace",
    'font-size': "7",
    'font-weight': "600",
    'letter-spacing': "0.18em",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "53",
    y: "30",
    'text-anchor': "middle",
    ...{ style: {} },
    'font-family': "Geist Mono Variable, monospace",
    'font-size': "7",
    'font-weight': "600",
    'letter-spacing': "0.18em",
});
if (__VLS_ctx.isLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute inset-0 flex items-center justify-center pointer-events-none z-[500]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label bg-surface px-3 py-1.5 rule rounded-[6px] border border-rule" },
    });
}
/** @type {__VLS_StyleScopedClasses['autocrawl-map']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['select-none']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[350]']} */ ;
/** @type {__VLS_StyleScopedClasses['map-vignette']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-4']} */ ;
/** @type {__VLS_StyleScopedClasses['top-3.5']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[400]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['blink']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[18px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['right-4']} */ ;
/** @type {__VLS_StyleScopedClasses['top-3.5']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[400]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-stretch']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-0']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['border-r']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[15px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['border-r']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[15px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[15px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-4']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-4']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[400]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[8px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[44px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-gradient']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[160px]']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[44px]']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-4']} */ ;
/** @type {__VLS_StyleScopedClasses['top-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-y-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[400]']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['compass-rose']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[500]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            mapEl: mapEl,
            isLoading: isLoading,
            totalCountries: totalCountries,
            totalArcs: totalArcs,
            totalVendors: totalVendors,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
