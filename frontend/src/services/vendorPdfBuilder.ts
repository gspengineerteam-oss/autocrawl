/**
 * Vendor dossier PDF builder.
 *
 *   Inputs:  VendorDossierResponse (overview, sections, business_graph, ...)
 *   Output:  Uint8Array (PDF bytes ready for Blob download)
 *
 * Pipeline:
 *   1. LLM emits structured `business_graph` JSON {nodes, edges}.
 *   2. dagre auto-layouts the graph (deterministic; no SVG, no canvas).
 *   3. Compose the PDF with pdf-lib StandardFonts + native primitives:
 *      drawRectangle for nodes, drawLine for edges, drawText for labels.
 *
 * MermaidJS was previously used for diagrams but proved unreliable in
 * the browser (theme leak, font fallback, canvas taint). Replaced with
 * dagre layout + native pdf-lib drawing for full determinism.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import dagre from '@dagrejs/dagre'
import type {
  VendorDossierResponse,
  VendorDossierContent,
  VendorDossierMeta,
  VendorBusinessGraph,
  VendorGraphNode,
} from '@/api/types'

// (MermaidJS removed 2026-05-08 — replaced by dagre layout + pdf-lib
// native drawing in `drawBusinessGraph` for full deterministic output.
// No SVG, no canvas rasterization, no theme leak, no font-fetch taint.)


interface PageCtx {
  page: PDFPage
  y: number
  width: number
  height: number
  margin: number
}

const MARGIN = 64
const MARGIN_TOP = 72
const PAGE_W = 595.28 // A4 portrait
const PAGE_H = 841.89

// Editorial paper palette — cream background, ink-deep text, vermilion +
// saffron accents. Reads like a defense/intel briefing print, not a
// dashboard screenshot. Designed for print + screen, sufficient contrast.
const C_BG = rgb(0.984, 0.965, 0.910)         // cream paper #FBF6E8
const C_INK = rgb(0.094, 0.106, 0.122)         // deep ink #181B1F
const C_INK_2 = rgb(0.282, 0.302, 0.341)       // mid gray  #484D57
const C_INK_MUTE = rgb(0.518, 0.490, 0.443)    // warm gray-brown #847D71
const C_VERMILION = rgb(0.753, 0.290, 0.157)   // accent #C04A28
const C_SAFFRON = rgb(0.851, 0.647, 0.235)     // accent #D9A53C
const C_RULE = rgb(0.690, 0.659, 0.580)        // light warm rule #B0A894
// (Removed C_RULE_STRONG — unused after layout overhaul)
const C_OK = rgb(0.243, 0.502, 0.290)          // forest green #3E804A
const C_CRIT = rgb(0.706, 0.235, 0.169)        // brick red #B43C2B

interface BuiltFonts {
  /** Times-Roman serif — body editorial reading text. */
  body: PDFFont
  /** Times-Bold — emphasized inline. */
  bodyBold: PDFFont
  /** Times-Italic — pull-quotes, captions. */
  italic: PDFFont
  /** Helvetica-Bold — display headlines, section labels. */
  display: PDFFont
  /** Helvetica — secondary running text where serif feels heavy. */
  sans: PDFFont
  /** Courier — folio, monogram, ID-like labels. */
  mono: PDFFont
}

/**
 * Standard interior page (not the cover). Cream background with a thin
 * vermilion masthead rule + brand sigil top-left and folio top-right.
 * The actual `y` cursor starts BELOW the masthead so caller doesn't need
 * to re-account for header space.
 */
function newPage(doc: PDFDocument, fonts?: BuiltFonts): PageCtx {
  const page = doc.addPage([PAGE_W, PAGE_H])
  page.drawRectangle({
    x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C_BG,
  })
  // Masthead: thin saffron rule + vermilion accent bar
  page.drawRectangle({
    x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: C_VERMILION,
  })
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - 32 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - 32 },
    thickness: 0.6, color: C_INK,
  })
  if (fonts) {
    page.drawText('AUTOCRAWL  ·  DOSIR VENDOR', {
      x: MARGIN, y: PAGE_H - 24, size: 8, font: fonts.display, color: C_INK,
    })
  }
  return { page, y: PAGE_H - MARGIN_TOP, width: PAGE_W, height: PAGE_H, margin: MARGIN }
}

function ensureSpace(ctx: PageCtx, doc: PDFDocument, need: number): PageCtx {
  if (ctx.y - need < ctx.margin + 24) {
    return newPage(doc)
  }
  return ctx
}

function drawHairline(ctx: PageCtx, color = C_RULE) {
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end: { x: ctx.width - ctx.margin, y: ctx.y },
    thickness: 0.4,
    color,
  })
  ctx.y -= 8
}

// Wrap text manually (pdf-lib has no native wrapping). Returns line array.
/**
 * pdf-lib StandardFonts use WinAnsi encoding which doesn't include common
 * Unicode chars LLMs love to emit (curly quotes, en/em dashes, the math
 * minus sign U+2212, ellipsis, arrows, etc.). Without sanitization,
 * `font.widthOfTextAtSize` and `page.drawText` throw `WinAnsi cannot
 * encode "−"`. Map common offenders to ASCII equivalents; strip anything
 * else outside Latin-1 (0x00–0xFF).
 */
const _WIN_ANSI_REPLACE: Array<[RegExp, string]> = [
  [/‐|‑|‒|–|—|―|−|➖/g, '-'], // dashes & math minus
  [/[‘’‚‛]/g, "'"], // curly single quotes
  [/[“”„‟]/g, '"'], // curly double quotes
  [/•|‣|◦|⁃/g, '*'], // bullets
  [/…/g, '...'],                     // ellipsis
  [/→|➡|：/g, '->'],        // right arrow
  [/←/g, '<-'],                      // left arrow
  [/✓|✔/g, '+'],                // checkmark
  [/✗|✘|✕|✖/g, 'x'],  // cross / x mark
  [/[  - ]/g, ' '],        // non-breaking + thin spaces
  [/©/g, '(c)'],                     // copyright
  [/®/g, '(R)'],                     // registered
  [/™/g, '(TM)'],                    // trademark
]

function sanitizeWinAnsi(text: string): string {
  if (!text) return text
  let out = text
  for (const [re, rep] of _WIN_ANSI_REPLACE) out = out.replace(re, rep)
  // Strip any remaining non-Latin-1 chars (emoji, CJK in chunks LLM
  // sometimes leaks). Replace with '?' so layout doesn't shift wildly.
  out = out.replace(/[^\x00-\xFF]/g, '?')
  return out
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const sanitized = sanitizeWinAnsi(text)
  const out: string[] = []
  for (const para of sanitized.split(/\n+/)) {
    if (!para.trim()) { out.push(''); continue }
    const words = para.split(/\s+/)
    let line = ''
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w
      const trialWidth = font.widthOfTextAtSize(trial, size)
      if (trialWidth > maxWidth && line) {
        out.push(line)
        line = w
      } else {
        line = trial
      }
    }
    if (line) out.push(line)
  }
  return out
}

function drawText(
  ctx: PageCtx,
  doc: PDFDocument,
  text: string,
  opts: {
    font: PDFFont
    size: number
    color?: ReturnType<typeof rgb>
    lineHeight?: number
    maxWidth?: number
  },
): PageCtx {
  const lh = opts.lineHeight ?? opts.size * 1.4
  const maxW = opts.maxWidth ?? ctx.width - ctx.margin * 2
  const lines = wrapText(text, opts.font, opts.size, maxW)
  let cur = ctx
  for (const line of lines) {
    cur = ensureSpace(cur, doc, lh)
    cur.page.drawText(line, {
      x: cur.margin,
      y: cur.y - opts.size,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? C_INK,
    })
    cur.y -= lh
  }
  return cur
}

function drawHeading(
  ctx: PageCtx, doc: PDFDocument, text: string, fonts: BuiltFonts,
): PageCtx {
  let cur = ensureSpace(ctx, doc, 32)
  cur.page.drawText(sanitizeWinAnsi(text.toUpperCase()), {
    x: cur.margin,
    y: cur.y - 12,
    size: 11,
    font: fonts.display,
    color: C_VERMILION,
  })
  cur.y -= 18
  drawHairline(cur, C_VERMILION)
  return cur
}

// (drawMetaPair removed — replaced by drawCoverFact + sidebar in spread)


// ============================================================ //
// BUSINESS GRAPH RENDERER                                        //
// ============================================================ //
// Replaces the old mermaid-based diagram. Pipeline:              //
//   1. dagre.js auto-layouts the directed graph (TB direction).  //
//   2. Each node drawn as pdf-lib rounded rect with kind-based   //
//      color (root=vermilion, capability=saffron, domain=cream,  //
//      product=dim cream).                                       //
//   3. Each edge drawn as straight line + small filled triangle  //
//      arrowhead pointing into the target node boundary.         //
// No SVG, no canvas, no rasterization — pure PDF primitives.     //
// ============================================================ //

interface NodeStyle {
  fill: ReturnType<typeof rgb>
  stroke: ReturnType<typeof rgb>
  textColor: ReturnType<typeof rgb>
  borderWidth: number
  fontWeight: 'normal' | 'bold'
}

const NODE_STYLES: Record<VendorGraphNode['kind'], NodeStyle> = {
  root: {
    fill: rgb(0.753, 0.290, 0.157),       // C_VERMILION
    stroke: rgb(0.094, 0.106, 0.122),     // C_INK
    textColor: rgb(0.984, 0.965, 0.910),  // C_BG cream — high contrast on vermilion
    borderWidth: 1.5,
    fontWeight: 'bold',
  },
  capability: {
    fill: rgb(0.964, 0.901, 0.776),       // saffron-cream
    stroke: rgb(0.851, 0.647, 0.235),     // C_SAFFRON
    textColor: rgb(0.094, 0.106, 0.122),
    borderWidth: 1.2,
    fontWeight: 'bold',
  },
  domain: {
    fill: rgb(0.984, 0.910, 0.847),       // soft vermilion tint
    stroke: rgb(0.753, 0.290, 0.157),     // C_VERMILION border
    textColor: rgb(0.094, 0.106, 0.122),
    borderWidth: 1.0,
    fontWeight: 'normal',
  },
  product: {
    fill: rgb(0.984, 0.965, 0.910),       // pure cream
    stroke: rgb(0.518, 0.490, 0.443),     // warm gray
    textColor: rgb(0.282, 0.302, 0.341),
    borderWidth: 0.8,
    fontWeight: 'normal',
  },
}


/**
 * Build the vendor business graph DETERMINISTICALLY from vendor_meta.
 * Structure:
 *   root (vendor) → capability nodes (top product categories) → domain
 *   nodes (domain_of_interest topics).
 * If products_detailed is empty, uses industries as capability layer.
 * Edges connect capabilities to all matched domains they serve.
 */
function buildGraphFromVendorMeta(meta: VendorDossierMeta): VendorBusinessGraph {
  const vendorLabel = meta.company_name || meta.domain || 'Vendor'
  const nodes: VendorGraphNode[] = [
    { id: 'V', label: vendorLabel, kind: 'root' },
  ]
  const edges: { source: string; target: string }[] = []

  // Domain nodes: domain_of_interest → topic labels (humanized)
  const doiList = (meta.domain_of_interest || []).slice(0, 6)
  const domainIdMap = new Map<string, string>()
  doiList.forEach((topic, i) => {
    const id = `D${i + 1}`
    domainIdMap.set(topic, id)
    nodes.push({
      id,
      label: humanizeTopic(topic),
      kind: 'domain',
    })
  })

  // Capability nodes: derive from products_detailed categories.
  const products = meta.products_detailed || []
  const capByCategory = new Map<string, { id: string; products: typeof products }>()
  products.forEach((p) => {
    const cat = (p.category || 'Lain-lain').trim()
    if (!capByCategory.has(cat)) {
      const id = `C${capByCategory.size + 1}`
      capByCategory.set(cat, { id, products: [] })
    }
    capByCategory.get(cat)!.products.push(p)
  })

  // Cap to top 4 categories by product count
  const topCaps = Array.from(capByCategory.entries())
    .sort((a, b) => b[1].products.length - a[1].products.length)
    .slice(0, 4)

  if (topCaps.length === 0) {
    // Fallback: use industries as direct capability layer
    const industries = (meta.industries || []).slice(0, 3)
    industries.forEach((ind, i) => {
      const id = `C${i + 1}`
      nodes.push({ id, label: ind, kind: 'capability' })
      edges.push({ source: 'V', target: id })
      // Industry connects to all domains
      doiList.forEach((topic) => {
        const did = domainIdMap.get(topic)
        if (did) edges.push({ source: id, target: did })
      })
    })
    return { nodes, edges }
  }

  // Add capability nodes + edges from root
  topCaps.forEach(([cat, info]) => {
    nodes.push({ id: info.id, label: cat, kind: 'capability' })
    edges.push({ source: 'V', target: info.id })
    // For each capability, connect to domains its products match
    const matched = new Set<string>()
    info.products.forEach((p) => {
      ;(p as { matched_topics?: string[] }).matched_topics?.forEach?.((t) => {
        if (domainIdMap.has(t)) matched.add(t)
      })
    })
    if (matched.size === 0) {
      // No matched topics — connect to first domain so it's not orphaned
      doiList.slice(0, 2).forEach((t) => matched.add(t))
    }
    matched.forEach((t) => {
      const did = domainIdMap.get(t)
      if (did) edges.push({ source: info.id, target: did })
    })
  })

  return { nodes, edges }
}


/**
 * Convert a snake_case topic name into a human-readable Indonesian label.
 */
function humanizeTopic(topic: string): string {
  const map: Record<string, string> = {
    security_defense: 'Pertahanan',
    surveillance_isr: 'Pengawasan ISR',
    law_enforcement: 'Penegakan Hukum',
    border_control: 'Kontrol Perbatasan',
    cybersecurity: 'Keamanan Siber',
    critical_infrastructure: 'Infrastruktur Kritis',
  }
  return map[topic] || topic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}


/**
 * Wrap text into multiple lines for fitting inside a node box. Returns
 * the array of lines. Used by both layout (to size the node) and render.
 */
function wrapForNode(
  text: string, font: PDFFont, fontSize: number, maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(trial, fontSize) <= maxWidth) {
      cur = trial
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}


/**
 * Lay out + draw the structured vendor business graph onto the current
 * page. Returns the updated PageCtx (cursor moved past the diagram).
 *
 * Layout: dagre rankdir=TB (top-down). Sizes per-node based on label
 * text dimensions. Cap diagram height; if a graph exceeds the cap,
 * dagre still produces valid coords, we just rescale to fit.
 */
function drawBusinessGraph(
  ctx: PageCtx,
  doc: PDFDocument,
  graph: VendorBusinessGraph,
  fonts: BuiltFonts,
): PageCtx {
  if (!graph || !graph.nodes || graph.nodes.length === 0) return ctx
  let cur = drawHeading(ctx, doc, 'Diagram Lingkup Bisnis', fonts)

  const NODE_FONT_SIZE = 10
  const NODE_LINE_HEIGHT = 13
  const NODE_PAD_X = 12
  const NODE_PAD_Y = 8
  const MAX_NODE_TEXT_W = 110

  // Build dagre graph with sized nodes.
  const g = new dagre.graphlib.Graph({ multigraph: false, compound: false })
  g.setGraph({
    rankdir: 'TB',
    nodesep: 22,
    ranksep: 36,
    marginx: 8,
    marginy: 8,
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Pre-compute wrapped lines per node so we can size boxes correctly.
  const lineCache = new Map<string, string[]>()
  for (const n of graph.nodes) {
    const fontForLabel = NODE_STYLES[n.kind].fontWeight === 'bold'
      ? fonts.display : fonts.sans
    const wrapped = wrapForNode(
      sanitizeWinAnsi(n.label || n.id),
      fontForLabel, NODE_FONT_SIZE, MAX_NODE_TEXT_W,
    )
    lineCache.set(n.id, wrapped)
    const widest = Math.max(
      ...wrapped.map((l) => fontForLabel.widthOfTextAtSize(l, NODE_FONT_SIZE)),
      40,
    )
    const w = Math.min(MAX_NODE_TEXT_W, widest) + NODE_PAD_X * 2
    const h = wrapped.length * NODE_LINE_HEIGHT + NODE_PAD_Y * 2
    g.setNode(n.id, { width: w, height: h, _label: n.label, _kind: n.kind })
  }
  for (const e of graph.edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }

  // Run layout
  try {
    dagre.layout(g)
  } catch (e) {
    console.warn('[vendorPdfBuilder] dagre layout failed', e)
    return cur
  }

  // Diagram bounding box from dagre
  const graphInfo = g.graph()
  const bbW = graphInfo.width || 400
  const bbH = graphInfo.height || 200

  // Fit into available width, scale uniformly. Cap height at 300pt.
  const availW = cur.width - cur.margin * 2
  const maxDiagramH = 320
  const scaleW = availW / bbW
  const scaleH = maxDiagramH / bbH
  const scale = Math.min(1, scaleW, scaleH)
  const drawW = bbW * scale
  const drawH = bbH * scale

  cur = ensureSpace(cur, doc, drawH + 16)
  if (cur.y - drawH < cur.margin + 50) {
    // New page if not enough room.
    cur = newPage(doc, fonts)
    cur = drawHeading(cur, doc, 'Diagram Lingkup Bisnis', fonts)
  }

  const ox = cur.margin + (availW - drawW) / 2  // center horizontally
  const topY = cur.y                              // top of diagram in PDF coords
  // dagre y grows down from 0; PDF y grows up. Convert: pdfY = topY - dagreY*scale

  // Draw edges first so nodes overlay them at endpoints.
  for (const eIdx of g.edges()) {
    const eData = g.edge(eIdx)
    if (!eData || !eData.points || eData.points.length < 2) continue
    const pts = eData.points.map((p: { x: number; y: number }) => ({
      x: ox + p.x * scale,
      y: topY - p.y * scale,
    }))
    // Draw polyline as connected segments
    for (let i = 0; i < pts.length - 1; i++) {
      cur.page.drawLine({
        start: { x: pts[i].x, y: pts[i].y },
        end: { x: pts[i + 1].x, y: pts[i + 1].y },
        thickness: 0.9,
        color: rgb(0.094, 0.106, 0.122),
      })
    }
    // Arrowhead at last segment
    const a = pts[pts.length - 2]
    const b = pts[pts.length - 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const headLen = 6
    const headW = 3
    // Tip
    const tx = b.x
    const ty = b.y
    // Base center
    const cx = b.x - ux * headLen
    const cy = b.y - uy * headLen
    // Perpendicular for base
    const px = -uy
    const py = ux
    const left = { x: cx + px * headW, y: cy + py * headW }
    const right = { x: cx - px * headW, y: cy - py * headW }
    // Filled triangle via three lines + fill workaround: pdf-lib has no
    // drawTriangle; use drawSvgPath. Simpler: small filled rectangle
    // angled — but pdf-lib drawRectangle is axis-aligned. Use
    // drawSvgPath if available, otherwise just thick stroked V.
    cur.page.drawLine({
      start: left, end: { x: tx, y: ty },
      thickness: 1.2, color: rgb(0.094, 0.106, 0.122),
    })
    cur.page.drawLine({
      start: right, end: { x: tx, y: ty },
      thickness: 1.2, color: rgb(0.094, 0.106, 0.122),
    })
  }

  // Draw nodes
  for (const id of g.nodes()) {
    const nd = g.node(id) as {
      x: number; y: number; width: number; height: number;
      _label: string; _kind: VendorGraphNode['kind'];
    }
    if (!nd) continue
    const w = nd.width * scale
    const h = nd.height * scale
    const x = ox + nd.x * scale - w / 2
    const y = topY - nd.y * scale - h / 2
    const style = NODE_STYLES[nd._kind] || NODE_STYLES.capability

    // Box (slight rounded look via two thin overlays — pdf-lib has no
    // border-radius, but a 1px inset stroke + fill reads like soft chip)
    cur.page.drawRectangle({
      x, y, width: w, height: h,
      color: style.fill,
      borderColor: style.stroke,
      borderWidth: style.borderWidth,
    })

    // Label text — center within node, multi-line
    const lines = lineCache.get(id) || [nd._label]
    const fontForLabel = style.fontWeight === 'bold' ? fonts.display : fonts.sans
    const totalTextH = lines.length * NODE_LINE_HEIGHT
    const textTopY = y + h / 2 + totalTextH / 2 - NODE_LINE_HEIGHT
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const tw = fontForLabel.widthOfTextAtSize(line, NODE_FONT_SIZE)
      cur.page.drawText(sanitizeWinAnsi(line), {
        x: x + (w - tw) / 2,
        y: textTopY - i * NODE_LINE_HEIGHT,
        size: NODE_FONT_SIZE,
        font: fontForLabel,
        color: style.textColor,
      })
    }
  }

  cur.y -= drawH + 18
  return cur
}


function drawProsConsBlock(
  ctx: PageCtx,
  doc: PDFDocument,
  pros: string[],
  cons: string[],
  fonts: BuiltFonts,
): PageCtx {
  if (!pros.length && !cons.length) return ctx
  let cur = drawHeading(ctx, doc, 'Penilaian Pengadaan', fonts)
  const colW = (cur.width - cur.margin * 2 - 16) / 2
  const startY = cur.y

  const drawCol = (
    title: string,
    items: string[],
    color: ReturnType<typeof rgb>,
    xStart: number,
  ): number => {
    let y = startY
    // Column header — display sans bold all-caps with spaced letters
    cur.page.drawText(sanitizeWinAnsi(title.toUpperCase()), {
      x: xStart, y: y - 9, size: 10, font: fonts.display, color,
    })
    y -= 16
    cur.page.drawLine({
      start: { x: xStart, y },
      end: { x: xStart + colW, y },
      thickness: 0.6, color,
    })
    y -= 10
    items.forEach((item, i) => {
      const num = String(i + 1).padStart(2, '0')
      // Numbered prefix — display sans (was mono Courier)
      cur.page.drawText(num, {
        x: xStart, y: y - 10, size: 10, font: fonts.display, color,
      })
      const lines = wrapText(item, fonts.body, 10.5, colW - 26)
      lines.forEach((line, li) => {
        cur.page.drawText(sanitizeWinAnsi(line), {
          x: xStart + 26, y: y - 10 - li * 13, size: 10.5, font: fonts.body, color: C_INK,
        })
      })
      y -= Math.max(13, lines.length * 13) + 6
    })
    return y
  }

  const yLeft = drawCol('+ Kelebihan', pros, C_OK, cur.margin)
  const yRight = drawCol('− Kekurangan', cons, C_CRIT, cur.margin + colW + 16)
  cur.y = Math.min(yLeft, yRight) - 8
  // If we crossed below margin, push to new page (uncommon for short lists)
  if (cur.y < cur.margin + 24) cur = newPage(doc)
  return cur
}

export interface BuildOptions {
  /** Filename hint for the download trigger; not used by builder itself. */
  filename?: string
}

// ============================================================ //
// COVER PAGE                                                     //
// ============================================================ //

function drawCoverPage(
  doc: PDFDocument,
  c: VendorDossierContent,
  meta: VendorDossierMeta,
  fonts: BuiltFonts,
): void {
  const page = doc.addPage([PAGE_W, PAGE_H])
  // Cream paper
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C_BG })

  // Top vermilion strip + bottom rule
  page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: C_VERMILION })
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 4, color: C_INK })

  // Masthead text
  const mastheadY = PAGE_H - 64
  page.drawText('AUTOCRAWL', {
    x: MARGIN, y: mastheadY, size: 12, font: fonts.display, color: C_VERMILION,
  })
  page.drawText('DOSIR  VENDOR', {
    x: MARGIN + 92, y: mastheadY, size: 10, font: fonts.display, color: C_INK,
  })
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const dateW = fonts.display.widthOfTextAtSize(dateStr.toUpperCase(), 9)
  page.drawText(dateStr.toUpperCase(), {
    x: PAGE_W - MARGIN - dateW, y: mastheadY, size: 9, font: fonts.display, color: C_INK,
  })

  // Thin double rule under masthead
  page.drawLine({
    start: { x: MARGIN, y: mastheadY - 12 }, end: { x: PAGE_W - MARGIN, y: mastheadY - 12 },
    thickness: 0.6, color: C_INK,
  })
  page.drawLine({
    start: { x: MARGIN, y: mastheadY - 16 }, end: { x: PAGE_W - MARGIN, y: mastheadY - 16 },
    thickness: 0.4, color: C_INK,
  })

  // Issue number / domain (sub-masthead)
  const issueLabel = `EDISI  ·  ${(meta.domain || 'vendor').toUpperCase()}`
  page.drawText(sanitizeWinAnsi(issueLabel), {
    x: MARGIN, y: mastheadY - 30, size: 9, font: fonts.display, color: C_INK_MUTE,
  })

  // Big title — wrapped serif. Position from top ~38% of page.
  const titleSize = 38
  const titleMaxW = PAGE_W - MARGIN * 2
  const titleSrc = c.title || meta.company_name || 'Vendor'
  const titleLines = wrapText(titleSrc, fonts.bodyBold, titleSize, titleMaxW)
  let yTitle = PAGE_H - 240
  for (const line of titleLines) {
    page.drawText(sanitizeWinAnsi(line), {
      x: MARGIN, y: yTitle, size: titleSize, font: fonts.bodyBold, color: C_INK,
    })
    yTitle -= titleSize * 1.05
  }

  // Subtitle (italic serif)
  if (c.subtitle) {
    yTitle -= 14
    const subLines = wrapText(c.subtitle, fonts.italic, 14, titleMaxW)
    for (const line of subLines) {
      page.drawText(sanitizeWinAnsi(line), {
        x: MARGIN, y: yTitle, size: 14, font: fonts.italic, color: C_INK_2,
      })
      yTitle -= 18
    }
  }

  // Vermilion divider
  yTitle -= 24
  page.drawRectangle({
    x: MARGIN, y: yTitle, width: 80, height: 3, color: C_VERMILION,
  })

  // DOI tags row (horizontal)
  yTitle -= 30
  if ((meta.domain_of_interest || []).length) {
    page.drawText('DOMAIN  MINAT', {
      x: MARGIN, y: yTitle, size: 9, font: fonts.display, color: C_INK_MUTE,
    })
    yTitle -= 16
    let xTag = MARGIN
    const tagSize = 10
    for (const tag of (meta.domain_of_interest || []).slice(0, 5)) {
      const label = `# ${tag}`
      const tw = fonts.display.widthOfTextAtSize(label, tagSize)
      // Tag pill background (saffron tint)
      page.drawRectangle({
        x: xTag - 4, y: yTitle - 3, width: tw + 8, height: 16,
        color: C_SAFFRON, opacity: 0.18,
      })
      page.drawText(sanitizeWinAnsi(label), {
        x: xTag, y: yTitle, size: tagSize, font: fonts.display, color: C_INK,
      })
      xTag += tw + 14
      if (xTag > PAGE_W - MARGIN - 80) break
    }
    yTitle -= 30
  }

  // Bottom block: facts grid (2 columns)
  const factsTop = 180
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2
  drawCoverFact(page, fonts, MARGIN, factsTop, 'DOMAIN', meta.domain || '—')
  drawCoverFact(page, fonts, MARGIN + colW + 24, factsTop, 'NEGARA', meta.country || '—')
  drawCoverFact(
    page, fonts, MARGIN, factsTop - 44, 'INDUSTRI',
    (meta.industries || []).slice(0, 3).join(' · ') || '—',
  )
  if (typeof meta.overall_scope_score === 'number') {
    drawCoverFact(
      page, fonts, MARGIN + colW + 24, factsTop - 44,
      'KESESUAIAN',
      `${Math.round((meta.overall_scope_score || 0) * 100)}%`,
      C_VERMILION,
    )
  }

  // Top-rule above facts
  page.drawLine({
    start: { x: MARGIN, y: factsTop + 22 }, end: { x: PAGE_W - MARGIN, y: factsTop + 22 },
    thickness: 0.4, color: C_INK,
  })

  // Footer brand line
  page.drawText('AUTOCRAWL  ·  BRIEF INTELIJEN VENDOR', {
    x: MARGIN, y: 38, size: 8, font: fonts.display, color: C_INK,
  })
  const folio = '01'
  page.drawText(folio, {
    x: PAGE_W - MARGIN - fonts.display.widthOfTextAtSize(folio, 8), y: 38,
    size: 8, font: fonts.display, color: C_INK,
  })
}

function drawCoverFact(
  page: PDFPage,
  fonts: BuiltFonts,
  x: number,
  y: number,
  label: string,
  value: string,
  valueColor: ReturnType<typeof rgb> = C_INK,
): void {
  page.drawText(label, {
    x, y, size: 8.5, font: fonts.display, color: C_INK_MUTE,
  })
  // Wrap value if needed (small col)
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2
  const lines = wrapText(value, fonts.bodyBold, 16, colW)
  for (let i = 0; i < Math.min(2, lines.length); i++) {
    page.drawText(sanitizeWinAnsi(lines[i]), {
      x, y: y - 14 - i * 18, size: 16, font: fonts.bodyBold, color: valueColor,
    })
  }
}


// ============================================================ //
// OVERVIEW SPREAD — page 2: lead text + sticky facts column     //
// ============================================================ //

function drawOverviewSpread(
  ctx: PageCtx,
  _doc: PDFDocument,
  c: VendorDossierContent,
  meta: VendorDossierMeta,
  fonts: BuiltFonts,
): PageCtx {
  // Layout: 60% left lead, 40% right sidebar
  const gutter = 24
  const sidebarW = 160
  const leadW = ctx.width - ctx.margin * 2 - sidebarW - gutter
  const leadX = ctx.margin
  const sidebarX = ctx.margin + leadW + gutter

  // Section eyebrow
  ctx.page.drawText('01  ·  IKHTISAR', {
    x: leadX, y: ctx.y, size: 9.5, font: fonts.display, color: C_VERMILION,
  })
  ctx.y -= 8
  ctx.page.drawRectangle({
    x: leadX, y: ctx.y, width: 36, height: 2, color: C_VERMILION,
  })
  ctx.y -= 18

  // Lead heading (serif bold, large)
  const leadHead = c.subtitle || (c.title ? 'Profil Vendor' : 'Ikhtisar Vendor')
  const leadHeadLines = wrapText(leadHead, fonts.bodyBold, 22, leadW)
  for (const line of leadHeadLines) {
    ctx.page.drawText(sanitizeWinAnsi(line), {
      x: leadX, y: ctx.y - 22, size: 22, font: fonts.bodyBold, color: C_INK,
    })
    ctx.y -= 28
  }
  ctx.y -= 6

  // Lead body — serif at 11pt with generous line-height
  const leadStartY = ctx.y
  const leadParas = (c.overview || '').split(/\n+/).filter((p) => p.trim())
  let yLead = leadStartY
  for (const para of leadParas) {
    const lines = wrapText(para, fonts.body, 11, leadW)
    for (const line of lines) {
      ctx.page.drawText(sanitizeWinAnsi(line), {
        x: leadX, y: yLead - 11, size: 11, font: fonts.body, color: C_INK,
      })
      yLead -= 16
    }
    yLead -= 6
  }

  // Sticky right column — facts table
  let ySide = leadStartY
  const drawSideRow = (label: string, value: string, accent = C_INK) => {
    // Label row (display small caps)
    ctx.page.drawText(label.toUpperCase(), {
      x: sidebarX, y: ySide - 7, size: 8, font: fonts.display, color: C_INK_MUTE,
    })
    ySide -= 12
    const lines = wrapText(value, fonts.bodyBold, 11, sidebarW)
    for (const line of lines.slice(0, 3)) {
      ctx.page.drawText(sanitizeWinAnsi(line), {
        x: sidebarX, y: ySide - 11, size: 11, font: fonts.bodyBold, color: accent,
      })
      ySide -= 14
    }
    ySide -= 4
    // Hairline
    ctx.page.drawLine({
      start: { x: sidebarX, y: ySide }, end: { x: sidebarX + sidebarW, y: ySide },
      thickness: 0.3, color: C_RULE,
    })
    ySide -= 10
  }
  drawSideRow('Domain', meta.domain || '—')
  drawSideRow('Negara', meta.country || '—')
  if ((meta.industries || []).length) {
    drawSideRow('Industri', (meta.industries || []).slice(0, 4).join(', '))
  }
  if (typeof meta.overall_scope_score === 'number') {
    drawSideRow(
      'Kesesuaian Domain',
      `${Math.round((meta.overall_scope_score || 0) * 100)}%`,
      C_VERMILION,
    )
  }
  if ((meta.domain_of_interest || []).length) {
    drawSideRow(
      'Topik DOI',
      (meta.domain_of_interest || []).map((s) => `#${s}`).join('  '),
    )
  }

  ctx.y = Math.min(yLead, ySide) - 8
  return ctx
}


// ============================================================ //
// SECTION — editorial body section with numbered eyebrow         //
// ============================================================ //

function drawSection(
  ctx: PageCtx,
  doc: PDFDocument,
  fonts: BuiltFonts,
  num: number,
  heading: string,
  body: string,
): PageCtx {
  ctx = ensureSpace(ctx, doc, 100)
  if (ctx.y < 220) ctx = newPage(doc, fonts)

  ctx.y -= 12
  // Section number block — vermilion display sans
  const eyebrow = `${String(num + 1).padStart(2, '0')}  ·  ${(heading || '').toUpperCase()}`
  ctx.page.drawText(sanitizeWinAnsi(eyebrow), {
    x: ctx.margin, y: ctx.y - 9, size: 9.5, font: fonts.display, color: C_VERMILION,
  })
  ctx.y -= 12
  // Underline rule (vermilion short bar)
  ctx.page.drawRectangle({
    x: ctx.margin, y: ctx.y, width: 36, height: 2, color: C_VERMILION,
  })
  ctx.y -= 14

  // Heading bold serif
  const headLines = wrapText(heading, fonts.bodyBold, 16, ctx.width - ctx.margin * 2)
  for (const line of headLines) {
    ctx = ensureSpace(ctx, doc, 22)
    ctx.page.drawText(sanitizeWinAnsi(line), {
      x: ctx.margin, y: ctx.y - 16, size: 16, font: fonts.bodyBold, color: C_INK,
    })
    ctx.y -= 22
  }
  ctx.y -= 4

  // Body — serif 11pt, justified-feel via word wrap
  ctx = drawText(ctx, doc, body, {
    font: fonts.body, size: 11, color: C_INK, lineHeight: 16,
  })
  ctx.y -= 8
  return ctx
}


export async function buildVendorDossierPdf(
  resp: VendorDossierResponse,
  _opts: BuildOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts: BuiltFonts = {
    body: await doc.embedFont(StandardFonts.TimesRoman),
    bodyBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    display: await doc.embedFont(StandardFonts.HelveticaBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    mono: await doc.embedFont(StandardFonts.Courier),
  }

  const meta: VendorDossierMeta = resp.vendor_meta || {}
  const c: VendorDossierContent = resp.content

  // ============================================================
  // COVER PAGE — full-bleed editorial. Big serif name, vermilion
  // accent bar, scope gauge bottom-right.
  // ============================================================
  drawCoverPage(doc, c, meta, fonts)

  // ============================================================
  // PAGE 2 — Overview spread: lead text + sticky facts sidebar
  // ============================================================
  let ctx = newPage(doc, fonts)
  ctx = drawOverviewSpread(ctx, doc, c, meta, fonts)

  // ============================================================
  // PAGE 3+ — Sections in editorial column
  // ============================================================
  for (let i = 0; i < (c.sections || []).length; i++) {
    const sec = c.sections[i]
    ctx = drawSection(ctx, doc, fonts, i + 1, sec.heading, sec.body)
  }

  // ============================================================
  // Mermaid diagram (its own area on a fresh page if needed)
  // ============================================================
  // Graph is BUILT DETERMINISTICALLY from vendor_meta — no LLM call.
  // Reliable: always renders, never hallucinates, exact structure match
  // with vendor's products_detailed + domain_of_interest.
  const graph = buildGraphFromVendorMeta(meta)
  if (graph.nodes.length > 1) {
    ctx.y -= 16
    if (ctx.y < 350) ctx = newPage(doc, fonts)
    ctx = drawBusinessGraph(ctx, doc, graph, fonts)
  }

  // ============================================================
  // Pros/Cons spread
  // ============================================================
  ctx.y -= 18
  if (ctx.y < 340) ctx = newPage(doc, fonts)
  ctx = drawProsConsBlock(
    ctx, doc, c.pros_cons?.pros || [], c.pros_cons?.cons || [], fonts,
  )

  // ============================================================
  // Closing
  // ============================================================
  if (c.closing_note && c.closing_note.trim()) {
    ctx.y -= 12
    if (ctx.y < 160) ctx = newPage(doc, fonts)
    drawHairline(ctx, C_VERMILION)
    ctx.y -= 4
    ctx = drawText(ctx, doc, c.closing_note, {
      font: fonts.italic, size: 10.5, color: C_INK_2, lineHeight: 16,
    })
  }

  // ============================================================
  // Footer on every page (cover skipped — has its own design)
  // ============================================================
  const total = doc.getPageCount()
  for (let i = 1; i < total; i++) {
    const p = doc.getPage(i)
    // Bottom rule
    p.drawLine({
      start: { x: MARGIN, y: 44 }, end: { x: PAGE_W - MARGIN, y: 44 },
      thickness: 0.6, color: C_INK,
    })
    p.drawText(sanitizeWinAnsi(`autocrawl · ${(meta.domain || '').toLowerCase()}`), {
      x: MARGIN, y: 30, size: 8, font: fonts.mono, color: C_INK_MUTE,
    })
    const folio = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
    const folioW = fonts.mono.widthOfTextAtSize(folio, 8)
    p.drawText(folio, {
      x: PAGE_W - MARGIN - folioW, y: 30, size: 8, font: fonts.mono, color: C_INK,
    })
  }

  return await doc.save()
}

/** Convenience: build the PDF and trigger a browser download. */
export async function downloadVendorDossierPdf(
  resp: VendorDossierResponse,
  filename?: string,
): Promise<void> {
  const bytes = await buildVendorDossierPdf(resp)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = (resp.vendor_meta?.domain || resp.vendor_meta?.company_name || resp.vendor_id)
    .toString()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  a.href = url
  a.download = filename || `vendor-dossier-${slug || 'export'}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
