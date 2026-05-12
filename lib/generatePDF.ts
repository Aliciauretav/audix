import type { Zone } from "@/components/ZoneEditor";

// ─── Types ────────────────────────────────────────────────

const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316"];
const SEVERITY_LABEL = ["", "Cosmético", "Menor", "Mayor", "Crítico"];

interface Issue { heuristic: string; description: string; severity: number; effort: string; recommendation: string; }
interface ZoneResult { id: string; name: string; score: number; summary: string; issues: Issue[]; }
interface AnalysisResult { overallScore: number; zones: ZoneResult[]; }
interface Context { product: string; user: string; flow: string; version: string; }
interface EvalData { imageBase64: string; imageMime: string; zones: Zone[]; context: Context; results: AnalysisResult; }

// ─── Color helpers ────────────────────────────────────────

function scoreRGB(s: number): [number, number, number] {
  return s >= 70 ? [16,185,129] : s >= 40 ? [245,158,11] : [239,68,68];
}

// Severity badge: [bg RGB, text RGB]
const SEV_COLORS: [[number,number,number],[number,number,number]][] = [
  [[209,213,219],[55,65,81]],   // 0 - fallback gray
  [[243,244,246],[75,85,99]],   // 1 Cosmético
  [[254,249,195],[161,98,7]],   // 2 Menor
  [[255,237,213],[154,52,18]],  // 3 Mayor
  [[254,226,226],[153,27,27]],  // 4 Crítico
];
const EFFORT_COLORS: Record<string,[number,number,number][]> = {
  bajo:  [[220,252,231],[21,128,61]],
  medio: [[254,249,195],[161,98,7]],
  alto:  [[254,226,226],[153,27,27]],
};

// ─── Badge drawing helper ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawBadge(doc: any, x: number, y: number, text: string, bg: [number,number,number], fg: [number,number,number]) {
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  const w = Math.max(doc.getTextWidth(text) + 6, 14);
  doc.setFillColor(...bg);
  doc.roundedRect(x, y - 4.5, w, 6, 1, 1, "F");
  doc.setTextColor(...fg);
  doc.text(text, x + w / 2, y, { align: "center" });
  return w; // return width so caller can advance x
}

function severityBadge(doc: any, x: number, y: number, severity: number) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [bg, fg] = SEV_COLORS[severity] ?? SEV_COLORS[1];
  return drawBadge(doc, x, y, SEVERITY_LABEL[severity] ?? "—", bg, fg);
}

function effortBadge(doc: any, x: number, y: number, effort: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [bg, fg] = EFFORT_COLORS[effort] ?? [[209,213,219],[55,65,81]];
  return drawBadge(doc, x, y, effort, bg, fg);
}

// ─── Image builder ────────────────────────────────────────

const PDF_IMG_PX = Math.round((182 / 25.4) * 150);

async function buildZonedImage(imageBase64: string, imageMime: string, zones: Zone[]): Promise<{ dataUrl: string; aspect: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      const outW = PDF_IMG_PX;
      const outH = Math.round(outW / aspect);
      const scale = outW / img.naturalWidth;
      const canvas = document.createElement("canvas");
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, outW, outH);
      zones.forEach((zone, i) => {
        const color = COLORS[i % COLORS.length];
        const sx = zone.x * scale, sy = zone.y * scale, sw = zone.width * scale, sh = zone.height * scale;
        ctx.lineWidth = Math.max(2, outW * 0.002);
        ctx.strokeStyle = color; ctx.fillStyle = color + "25";
        ctx.fillRect(sx, sy, sw, sh); ctx.strokeRect(sx, sy, sw, sh);
        const fs = Math.max(13, outW * 0.014);
        ctx.font = `bold ${fs}px Arial`;
        const tw = ctx.measureText(zone.name).width;
        ctx.fillStyle = color; ctx.fillRect(sx, sy - fs - 6, tw + 12, fs + 6);
        ctx.fillStyle = "#fff"; ctx.fillText(zone.name, sx + 6, sy - 4);
      });
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), aspect });
    };
    img.src = `data:${imageMime};base64,${imageBase64}`;
  });
}

// ─── Shared page helpers ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawPageHeader(doc: any, PW: number) {
  doc.setFillColor(15, 33, 86);
  doc.rect(0, 0, PW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("Audix", 14, 14);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 190, 230);
  doc.text("Reporte de Evaluación Heurística", 36, 14);
}

// ─── Individual issue table row ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawIssueTableHeader(doc: any, M: number, CW: number, y: number): number {
  const COL = { item: 44, crit: 24, effort: 20, detail: 47, measure: 47 };
  doc.setFillColor(244, 246, 250);
  doc.rect(M, y, CW, 8, "F");
  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 100, 100);
  let x = M + 2;
  doc.text("ITEM", x, y + 5.5); x += COL.item;
  doc.text("CRITICIDAD", x, y + 5.5); x += COL.crit;
  doc.text("ESFUERZO", x, y + 5.5); x += COL.effort;
  doc.text("DETALLE", x, y + 5.5); x += COL.detail;
  doc.text("MEDIDA", x, y + 5.5);
  return y + 9;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawIssueRow(doc: any, M: number, CW: number, y: number, issue: Issue, PH: number, addPage: () => void, drawHeader: () => number): number {
  const COL = { item: 44, crit: 24, effort: 20, detail: 47, measure: 47 };
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
  const iL = doc.splitTextToSize(issue.heuristic, COL.item - 3);
  const dL = doc.splitTextToSize(issue.description, COL.detail - 3);
  const mL = doc.splitTextToSize(issue.recommendation, COL.measure - 3);
  const rowH = Math.max(iL.length, dL.length, mL.length) * 4 + 9;
  if (y + rowH > PH - 18) { addPage(); y = drawHeader(); }

  doc.setFillColor(250, 251, 252);
  doc.rect(M, y, CW, rowH, "F");
  doc.setDrawColor(230, 230, 230);
  doc.line(M, y + rowH, M + CW, y + rowH);

  let x = M + 3;
  doc.setTextColor(27, 63, 143); doc.setFont("helvetica", "bold");
  doc.text(iL, x, y + 5); x += COL.item;

  severityBadge(doc, x, y + 5, issue.severity); x += COL.crit;
  effortBadge(doc, x, y + 5, issue.effort); x += COL.effort;

  doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
  doc.text(dL, x, y + 5); x += COL.detail;
  doc.setTextColor(80, 80, 80);
  doc.text(mL, x, y + 5);
  return y + rowH;
}

// ─── Individual PDF ───────────────────────────────────────

export async function generatePDF(imageBase64: string, imageMime: string, zones: Zone[], context: Context, results: AnalysisResult) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF("p", "mm", "a4");
  const PW = 210, PH = 297, M = 14, CW = PW - M * 2;
  let y = 0;

  drawPageHeader(doc, PW);
  y = 30;

  // Context
  doc.setTextColor(20, 20, 20); doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text(context.flow || context.product, M, y); y += 6;
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
  doc.text([context.product, context.version, context.user, new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})].filter(Boolean).join("  ·  "), M, y);
  y += 10;

  // Score badge
  const [sr, sg, sb] = scoreRGB(results.overallScore);
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(M, y, 40, 12, 2, 2, "F");
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont("helvetica","bold");
  doc.text(`Score  ${results.overallScore}/100`, M + 20, y + 8, { align: "center" });
  y += 18;

  // Zoned image
  const { dataUrl, aspect } = await buildZonedImage(imageBase64, imageMime, zones);
  let imgW = CW, imgH = CW / aspect;
  if (imgH > 110) { imgH = 110; imgW = 110 * aspect; }
  doc.addImage(dataUrl, "JPEG", M, y, imgW, imgH);
  y += imgH + 10;

  let currentY = y;
  const addPage = () => { doc.addPage(); currentY = M; };
  const drawTH = () => { currentY = drawIssueTableHeader(doc, M, CW, currentY); return currentY; };

  for (const zone of results.zones) {
    if (currentY > PH - 55) addPage();
    const [zr, zg, zb] = scoreRGB(zone.score);
    doc.setFillColor(15, 33, 86); doc.rect(M, currentY, CW, 12, "F");
    doc.setFillColor(zr, zg, zb); doc.circle(M + 7, currentY + 6, 4.5, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
    doc.text(String(zone.score), M + 7, currentY + 7.8, { align: "center" });
    doc.setFontSize(10); doc.text(zone.name, M + 15, currentY + 7.8);
    currentY += 14;

    doc.setFontSize(8); doc.setFont("helvetica","italic"); doc.setTextColor(80,80,80);
    const sumL = doc.splitTextToSize(zone.summary, CW);
    doc.text(sumL, M, currentY); currentY += sumL.length * 4.5 + 5;

    if (zone.issues.length === 0) { currentY += 4; continue; }
    drawTH();
    for (const issue of zone.issues) {
      currentY = drawIssueRow(doc, M, CW, currentY, issue, PH, addPage, drawTH);
    }
    currentY += 6;
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(170,170,170);
    doc.text(`Audix  ·  ${context.product}  ·  ${context.version}  ·  Página ${p} de ${total}`, PW/2, PH-7, { align: "center" });
  }
  doc.save(`audix-${(context.product||"reporte").toLowerCase().replace(/\s+/g,"-")}-${context.version}.pdf`);
}

// ─── Comparative PDF ──────────────────────────────────────

function normalizeHeuristic(h: string) {
  return h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalizeName(n: string) {
  return n.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Landscape A4: content width = 297 - 28 = 269mm
// item(40) | v1Crit(20) v1Esf(18) v1Det(38) | v2Crit(20) v2Esf(18) v2Det(38) | analisis(40) | medidas(37) = 269
const CC = {
  item:     { x: 0,   w: 40 },
  v1Crit:   { x: 40,  w: 20 },
  v1Esf:    { x: 60,  w: 18 },
  v1Det:    { x: 78,  w: 38 },
  v2Crit:   { x: 116, w: 20 },
  v2Esf:    { x: 136, w: 18 },
  v2Det:    { x: 154, w: 38 },
  analisis: { x: 192, w: 40 },
  medidas:  { x: 232, w: 37 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCompareTableHeader(doc: any, M: number, CW: number, v1label: string, v2label: string, y: number): number {
  const v1W = CC.v1Crit.w + CC.v1Esf.w + CC.v1Det.w; // 76
  const v2W = CC.v2Crit.w + CC.v2Esf.w + CC.v2Det.w; // 76

  // Row 1: group labels (h=8)
  doc.setFillColor(244, 246, 250);
  doc.rect(M, y, CW, 8, "F");
  doc.setFillColor(219, 234, 254);
  doc.rect(M + CC.v1Crit.x, y, v1W, 8, "F");
  doc.setFillColor(220, 252, 231);
  doc.rect(M + CC.v2Crit.x, y, v2W, 8, "F");

  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("ITEM", M + CC.item.x + 2, y + 5.5);
  doc.setTextColor(29, 78, 216);
  doc.text(v1label, M + CC.v1Crit.x + v1W / 2, y + 5.5, { align: "center" });
  doc.setTextColor(21, 128, 61);
  doc.text(v2label, M + CC.v2Crit.x + v2W / 2, y + 5.5, { align: "center" });
  doc.setTextColor(80, 80, 80);
  doc.text("ANÁLISIS", M + CC.analisis.x + 2, y + 5.5);
  doc.text("MEDIDAS", M + CC.medidas.x + 2, y + 5.5);

  // Row 2: sub-column labels (h=7)
  const y2 = y + 8;
  doc.setFillColor(234, 241, 255);
  doc.rect(M + CC.v1Crit.x, y2, v1W, 7, "F");
  doc.setFillColor(234, 252, 240);
  doc.rect(M + CC.v2Crit.x, y2, v2W, 7, "F");
  doc.setFillColor(248, 249, 251);
  doc.rect(M + CC.item.x, y2, CC.item.w, 7, "F");
  doc.rect(M + CC.analisis.x, y2, CC.analisis.w, 7, "F");
  doc.rect(M + CC.medidas.x, y2, CC.medidas.w, 7, "F");

  doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 100, 100);
  doc.text("CRITICIDAD", M + CC.v1Crit.x + 2, y2 + 4.5);
  doc.text("ESFUERZO",   M + CC.v1Esf.x  + 2, y2 + 4.5);
  doc.text("DETALLE",    M + CC.v1Det.x  + 2, y2 + 4.5);
  doc.text("CRITICIDAD", M + CC.v2Crit.x + 2, y2 + 4.5);
  doc.text("ESFUERZO",   M + CC.v2Esf.x  + 2, y2 + 4.5);
  doc.text("DETALLE",    M + CC.v2Det.x  + 2, y2 + 4.5);

  return y + 16;
}

export async function generateComparePDF(v1: EvalData, v2: EvalData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF("l", "mm", "a4"); // landscape
  const PW = 297, PH = 210, M = 14, CW = PW - M * 2; // 269mm
  let y = 0;

  // Page header
  doc.setFillColor(15, 33, 86); doc.rect(0, 0, PW, 20, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("Audix", M, 13);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(160, 190, 230);
  doc.text("Reporte Comparativo", M + 20, 13);
  y = 26;

  // Title + date
  doc.setTextColor(20, 20, 20); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(`${v1.context.product} — ${v1.context.version} vs ${v2.context.version}`, M, y); y += 5;
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
  doc.text(new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }), M, y); y += 8;

  // Score badges
  for (const [idx, d] of [[0, v1], [1, v2]] as [number, EvalData][]) {
    const [sr, sg, sb] = scoreRGB(d.results.overallScore);
    const x = M + idx * 58;
    doc.setFillColor(sr, sg, sb); doc.roundedRect(x, y, 53, 10, 2, 2, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(`${d.context.version}  ${d.results.overallScore}/100`, x + 26.5, y + 7, { align: "center" });
  }
  y += 16;

  // Images side by side
  const [img1, img2] = await Promise.all([
    buildZonedImage(v1.imageBase64, v1.imageMime, v1.zones),
    buildZonedImage(v2.imageBase64, v2.imageMime, v2.zones),
  ]);
  const imgAreaW = (CW - 4) / 2;
  const maxImgH = 46;
  for (const [idx, imgData] of [[0, img1], [1, img2]] as [number, { dataUrl: string; aspect: number }][]) {
    let iW = imgAreaW, iH = imgAreaW / imgData.aspect;
    if (iH > maxImgH) { iH = maxImgH; iW = maxImgH * imgData.aspect; }
    const x = M + idx * (imgAreaW + 4);
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(60, 60, 60);
    doc.text([v1, v2][idx].context.version, x, y + 4);
    doc.addImage(imgData.dataUrl, "JPEG", x, y + 6, iW, iH);
  }
  y += maxImgH + 10;

  // ── Build zone pairs ───────────────────────────────────────────────────────
  type MatchedIssue =
    | { type: "both";   h: string; i1: Issue; i2: Issue; zone: string }
    | { type: "v1only"; h: string; i1: Issue;             zone: string }
    | { type: "v2only"; h: string;             i2: Issue; zone: string };

  type ZonePair = { displayName: string; z1?: ZoneResult; z2?: ZoneResult };
  const zonePairs: ZonePair[] = [];
  const usedV2 = new Set<string>();
  for (const z1 of v1.results.zones) {
    const key = normalizeName(z1.name);
    const z2 = v2.results.zones.find(z => normalizeName(z.name) === key);
    if (z2) usedV2.add(normalizeName(z2.name));
    zonePairs.push({ displayName: z1.name, z1, z2 });
  }
  for (const z2 of v2.results.zones) {
    if (!usedV2.has(normalizeName(z2.name))) zonePairs.push({ displayName: z2.name, z2 });
  }

  // ── Collect all matched issues across all zones ────────────────────────────
  const allIssues: MatchedIssue[] = [];
  for (const pair of zonePairs) {
    const usedI2 = new Set<number>();
    if (pair.z1) {
      for (const i1 of pair.z1.issues) {
        const key = normalizeHeuristic(i1.heuristic);
        const idx2 = pair.z2?.issues.findIndex((i2, idx) => !usedI2.has(idx) && normalizeHeuristic(i2.heuristic) === key) ?? -1;
        if (idx2 >= 0 && pair.z2) {
          usedI2.add(idx2);
          allIssues.push({ type: "both", h: i1.heuristic, i1, i2: pair.z2.issues[idx2], zone: pair.displayName });
        } else {
          allIssues.push({ type: "v1only", h: i1.heuristic, i1, zone: pair.displayName });
        }
      }
    }
    if (pair.z2) {
      pair.z2.issues.forEach((i2, idx) => {
        if (!usedI2.has(idx)) allIssues.push({ type: "v2only", h: i2.heuristic, i2, zone: pair.displayName });
      });
    }
  }

  // ── Draw single table ──────────────────────────────────────────────────────
  let currentY = y;
  const addPage = () => { doc.addPage(); currentY = M; };
  const drawTH = () => { currentY = drawCompareTableHeader(doc, M, CW, v1.context.version, v2.context.version, currentY); };

  drawTH();

  let lastZone = "";
  for (const row of allIssues) {
    // Pre-calculate row height
    doc.setFontSize(7.5);
    const hL  = doc.splitTextToSize(row.h, CC.item.w - 3);
    const d1L = row.type !== "v2only" ? doc.splitTextToSize((row as { i1: Issue }).i1.description, CC.v1Det.w - 3) : ["—"];
    const d2L = row.type !== "v1only" ? doc.splitTextToSize((row as { i2: Issue }).i2.description, CC.v2Det.w - 3) : ["—"];

    let analysisText = "";
    if (row.type === "both") {
      const s1 = (row as { i1: Issue }).i1.severity, s2 = (row as { i2: Issue }).i2.severity;
      if (s2 < s1)      analysisText = `Mejoró: ${SEVERITY_LABEL[s1]} → ${SEVERITY_LABEL[s2]}`;
      else if (s2 > s1) analysisText = `Empeoró: ${SEVERITY_LABEL[s1]} → ${SEVERITY_LABEL[s2]}`;
      else              analysisText = `Persiste como ${SEVERITY_LABEL[s1]}`;
    } else if (row.type === "v1only") {
      analysisText = `Resuelto en ${v2.context.version}`;
    } else {
      analysisText = `Nuevo en ${v2.context.version}`;
    }
    const aL = doc.splitTextToSize(analysisText, CC.analisis.w - 3);

    const measText = row.type !== "v1only"
      ? (row as { i2: Issue }).i2.recommendation
      : (row as { i1: Issue }).i1.recommendation;
    const mL = doc.splitTextToSize(measText, CC.medidas.w - 3);

    const rowH = Math.max(hL.length, d1L.length, d2L.length, aL.length, mL.length) * 4 + 8;
    const zoneChanged = row.zone !== lastZone;
    const sepH = zoneChanged ? 7 : 0;

    if (currentY + sepH + rowH > PH - 14) {
      addPage(); drawTH(); lastZone = "";
    }

    // Zone separator row
    if (row.zone !== lastZone) {
      lastZone = row.zone;
      const zp = zonePairs.find(p => p.displayName === row.zone);
      const s1 = zp?.z1?.score, s2 = zp?.z2?.score;
      doc.setFillColor(225, 232, 250);
      doc.rect(M, currentY, CW, 7, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(27, 63, 143);
      let zLabel = row.zone;
      if (s1 !== undefined && s2 !== undefined) {
        const delta = s2 - s1;
        zLabel += `   ${s1} → ${s2}  (${delta > 0 ? "+" : ""}${delta})`;
      } else if (s1 !== undefined) { zLabel += `   ${v1.context.version}: ${s1}`; }
      else if (s2 !== undefined)   { zLabel += `   ${v2.context.version}: ${s2}`; }
      doc.text(zLabel, M + 3, currentY + 5);
      currentY += 7;
    }

    // Row background
    if (row.type === "v1only")      doc.setFillColor(249, 252, 249);
    else if (row.type === "v2only") doc.setFillColor(240, 249, 255);
    else                            doc.setFillColor(250, 251, 252);
    doc.rect(M, currentY, CW, rowH, "F");
    doc.setDrawColor(220, 225, 235);
    doc.line(M, currentY + rowH, M + CW, currentY + rowH);

    const ty = currentY + 5;

    // ITEM
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(27, 63, 143);
    doc.text(hL, M + CC.item.x + 2, ty);

    // V1 columns
    if (row.type !== "v2only") {
      const i1 = (row as { i1: Issue }).i1;
      severityBadge(doc, M + CC.v1Crit.x + 2, ty, i1.severity);
      effortBadge(doc, M + CC.v1Esf.x + 2, ty, i1.effort);
      doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
      doc.text(d1L, M + CC.v1Det.x + 2, ty);
    } else {
      doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(180, 180, 180);
      doc.text("—", M + CC.v1Crit.x + 5, ty);
    }

    // V2 columns
    if (row.type !== "v1only") {
      const i2 = (row as { i2: Issue }).i2;
      severityBadge(doc, M + CC.v2Crit.x + 2, ty, i2.severity);
      effortBadge(doc, M + CC.v2Esf.x + 2, ty, i2.effort);
      doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
      doc.text(d2L, M + CC.v2Det.x + 2, ty);
    } else {
      drawBadge(doc, M + CC.v2Crit.x + 2, ty, "Resuelto", [220, 252, 231], [21, 128, 61]);
    }

    // Análisis
    doc.setFontSize(7); doc.setFont("helvetica", "italic");
    if (row.type === "v1only") {
      doc.setTextColor(21, 128, 61);
    } else if (row.type === "v2only") {
      doc.setTextColor(29, 78, 216);
    } else {
      const s1 = (row as { i1: Issue }).i1.severity, s2 = (row as { i2: Issue }).i2.severity;
      if (s2 < s1)      doc.setTextColor(21, 128, 61);
      else if (s2 > s1) doc.setTextColor(153, 27, 27);
      else              doc.setTextColor(80, 80, 80);
    }
    doc.text(aL, M + CC.analisis.x + 2, ty);

    // Medidas
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(60, 60, 60);
    doc.text(mL, M + CC.medidas.x + 2, ty);

    currentY += rowH;
  }

  // Footer on all pages
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(170, 170, 170);
    doc.text(
      `Audix  ·  ${v1.context.product}  ·  ${v1.context.version} vs ${v2.context.version}  ·  Página ${p} de ${total}`,
      PW / 2, PH - 6, { align: "center" }
    );
  }
  doc.save(`audix-${(v1.context.product || "reporte").toLowerCase().replace(/\s+/g, "-")}-comparativa.pdf`);
}
