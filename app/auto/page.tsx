"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_AUDIX_API_URL || "https://audix-agent-production.up.railway.app";

type Status = "idle" | "loading" | "processing" | "completed" | "failed";

interface Finding {
  id?: string;
  finding_id: string;
  category: string;
  heuristic: string;
  severity: string;
  impact: string;
  location: string;
  scroll_y?: number;
  current_state?: string;
  expected_state?: string;
}

interface Recommendation {
  finding_id?: string;
  priority: number;
  action: string;
  effort: string;
  impact: string;
  code_snippet?: string;
}

interface Screenshot {
  public_url: string;
  viewport_config: { width: number; height: number };
}

interface Results {
  executive_summary: {
    score: number;
    critical_issues: number;
    estimated_impact: string;
    quick_wins: number;
  };
  findings: Finding[];
  recommendations: Recommendation[];
  screenshots?: Screenshot[];
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

const STEPS = [
  "Iniciando análisis...",
  "Capturando screenshot...",
  "Analizando accesibilidad WCAG...",
  "Evaluando jerarquía visual...",
  "Analizando performance...",
  "Revisando contenido y copy...",
  "Consolidando hallazgos...",
  "Generando recomendaciones...",
];

export default function AutoAuditPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function downloadPDF() {
    if (!results) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210;
      const margin = 16;
      const maxW = W - margin * 2;
      let y = margin;

      function checkPage(needed = 10) {
        if (y + needed > 277) { pdf.addPage(); y = margin; }
      }

      function text(str: string, x: number, size: number, style: "normal" | "bold" = "normal", color = "#111111") {
        pdf.setFontSize(size);
        pdf.setFont("helvetica", style);
        pdf.setTextColor(color);
        const lines = pdf.splitTextToSize(str, maxW - (x - margin));
        checkPage(lines.length * size * 0.4 + 2);
        pdf.text(lines, x, y);
        y += lines.length * size * 0.4 + 2;
      }

      // Header
      pdf.setFillColor("#0F2156");
      pdf.rect(0, 0, W, 22, "F");
      pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.setTextColor("#FFFFFF");
      pdf.text("Audix — Informe de auditoría UX", margin, 14);
      y = 30;

      text(url, margin, 9, "normal", "#555555");
      text(new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }), margin, 9, "normal", "#555555");
      y += 4;

      // Summary
      text("Resumen ejecutivo", margin, 13, "bold");
      y += 1;
      const s = results.executive_summary;
      text(`Puntuación: ${s.score}/100   |   Críticos: ${s.critical_issues}   |   Hallazgos: ${results.findings.length}   |   Quick wins: ${s.quick_wins}`, margin, 10);
      y += 5;

      // Pre-load screenshot for cropping
      const screenshotUrl = results.screenshots?.[0]?.public_url;
      let screenshotImg: HTMLImageElement | null = null;
      if (screenshotUrl) {
        screenshotImg = await new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null as any);
          img.src = screenshotUrl;
        });
      }

      function cropScreenshot(scrollY: number): string | null {
        if (!screenshotImg || screenshotImg.naturalWidth === 0) return null;
        const imgW = screenshotImg.naturalWidth;
        const imgH = screenshotImg.naturalHeight;
        const pdfImgW = maxW;
        const pdfImgH = 35;
        const aspectRatio = pdfImgW / pdfImgH;
        const cropH = Math.round(imgW / aspectRatio);
        const cropY = Math.round((scrollY / 100) * Math.max(0, imgH - cropH));
        const canvas = document.createElement("canvas");
        canvas.width = imgW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(screenshotImg, 0, cropY, imgW, cropH, 0, 0, imgW, cropH);
        return canvas.toDataURL("image/jpeg", 0.85);
      }

      // Findings
      text("Hallazgos", margin, 13, "bold");
      y += 1;
      const severityLabel: Record<string, string> = { critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo" };
      results.findings.forEach((f, i) => {
        checkPage(55);
        const crop = cropScreenshot(f.scroll_y ?? 0);
        if (crop) {
          pdf.addImage(crop, "JPEG", margin, y, maxW, 35);
          y += 37;
        }
        const linkedRecs = results.recommendations.filter(r => r.finding_id === f.id);
        const isQuickWin = f.severity === "high" && linkedRecs.some(r => r.effort === "low");
        const recNums = linkedRecs.map(r => r.priority).join(", ");

        text(`${i + 1}. ${f.heuristic}`, margin, 10, "bold");
        const meta = [
          `Severidad: ${severityLabel[f.severity] || f.severity}`,
          `Categoria: ${f.category}`,
          recNums ? `Rec. ${recNums}` : ""
        ].filter(Boolean).join("  |  ");
        text(meta, margin + 3, 9, "normal", "#555555");
        if (isQuickWin) text("Quick win: implementacion rapida, alto impacto", margin + 3, 9, "bold", "#059669");
        text(f.impact, margin + 3, 9, "normal", "#333333");
        if (f.location) text(`Ubicacion: ${f.location}`, margin + 3, 8, "normal", "#777777");
        if (f.current_state) text(`Actual: ${f.current_state}`, margin + 3, 8, "normal", "#CC0000");
        if (f.expected_state) text(`Esperado: ${f.expected_state}`, margin + 3, 8, "normal", "#007700");
        y += 5;
      });

      // Recommendations
      y += 2;
      text("Recomendaciones", margin, 13, "bold");
      y += 1;
      results.recommendations
        .sort((a, b) => a.priority - b.priority)
        .forEach((r) => {
          checkPage(16);
          text(`${r.priority}. ${r.action}`, margin, 10, "bold");
          text(`Esfuerzo: ${r.effort}  |  Impacto: ${r.impact}`, margin + 3, 9, "normal", "#555555");
          y += 3;
        });

      const domain = url.replace(/https?:\/\//, "").replace(/\//g, "-").slice(0, 40);
      pdf.save(`audix-${domain}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  async function startAudit() {
    if (!url) return;
    setStatus("loading");
    setError("");
    setResults(null);
    setStepIndex(0);

    try {
      const res = await fetch(`${API_URL}/api/audit/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          scope: ["usability", "accessibility", "visual_consistency", "performance", "content"],
          heuristics: ["nielsen_1", "nielsen_2", "nielsen_3", "nielsen_4"],
          wcag_level: "AA",
          viewport: { width: 1440, height: 900 },
          include_mobile: false,
        }),
      });

      const data = await res.json();
      if (!data.audit_id) throw new Error("No se pudo crear la auditoría");

      setStatus("processing");
      pollStatus(data.audit_id);
    } catch (e: any) {
      setError(e.message);
      setStatus("failed");
    }
  }

  async function pollStatus(auditId: string) {
    let attempts = 0;
    let stepCycle = 0;

    const interval = setInterval(async () => {
      attempts++;
      stepCycle++;
      setStepIndex(Math.min(stepCycle, STEPS.length - 1));

      if (attempts > 60) {
        clearInterval(interval);
        setError("La auditoría tardó demasiado. Intentá de nuevo.");
        setStatus("failed");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/audit/${auditId}`);
        const data = await res.json();

        if (data.status === "completed") {
          clearInterval(interval);
          const [resResults, resScreenshots] = await Promise.all([
            fetch(`${API_URL}/api/audit/${auditId}/results`),
            fetch(`${API_URL}/api/audit/${auditId}/screenshots`)
          ]);
          const resultsData = await resResults.json();
          const screenshotsData = await resScreenshots.json();
          setResults({
            ...resultsData,
            findings: resultsData.findings || [],
            recommendations: resultsData.recommendations || [],
            screenshots: Array.isArray(screenshotsData) ? screenshotsData : []
          });
          setStatus("completed");
        } else if (data.status === "failed") {
          clearInterval(interval);
          setError(data.error_message || "La auditoría falló");
          setStatus("failed");
        }
      } catch {
        // keep polling
      }
    }, 5000);
  }

  function ScoreRing({ score }: { score: number }) {
    const size = 96;
    const r = size * 0.38;
    const circ = 2 * Math.PI * r;
    const color = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
    return (
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          fontSize={22} fontWeight="bold" fill={color}>
          {score}
        </text>
      </svg>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Auditoría automática</h1>
        </div>
        <p className="text-gray-500 mt-1 text-sm pl-8">
          Ingresa una URL y el agente analiza usabilidad, accesibilidad, performance y contenido.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-8">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && startAudit()}
          placeholder="https://tusitio.com"
          disabled={status === "loading" || status === "processing"}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2156] disabled:bg-gray-100"
        />
        <button
          onClick={startAudit}
          disabled={!url || status === "loading" || status === "processing"}
          className="bg-[#0F2156] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#1a3270] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Analizar
        </button>
      </div>

      {/* Loading */}
      {(status === "loading" || status === "processing") && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <div className="w-10 h-10 border-4 border-[#0F2156] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-gray-700">{STEPS[stepIndex]}</p>
          <p className="text-xs text-gray-400 mt-1">Esto puede tardar 1-2 minutos</p>
        </div>
      )}

      {/* Error */}
      {status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {status === "completed" && results && (
        <div className="space-y-6">
          <div className="space-y-6">

          {/* Summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-6">
            <ScoreRing score={results.executive_summary.score} />
            <div className="flex-1 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {results.executive_summary.critical_issues}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Críticos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">
                  {results.findings.length}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Hallazgos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {results.executive_summary.quick_wins}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Quick wins</div>
              </div>
            </div>
          </div>

          {/* Screenshots */}
          {results.screenshots && results.screenshots.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Capturas</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {results.screenshots.map((s, i) => (
                  <div key={i} className="flex-shrink-0">
                    <a href={s.public_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={s.public_url}
                        alt={`Screenshot ${s.viewport_config.width}x${s.viewport_config.height}`}
                        className="rounded-xl border border-gray-200 h-48 object-cover object-top hover:opacity-90 transition-opacity"
                      />
                    </a>
                    <p className="text-xs text-gray-400 mt-1 text-center">
                      {s.viewport_config.width}×{s.viewport_config.height}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Hallazgos</h2>
            <div className="space-y-3">
              {results.findings.map((f, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {results.screenshots && results.screenshots.length > 0 && (
                    <div className="relative h-28 overflow-hidden bg-gray-100">
                      <img
                        src={results.screenshots[0].public_url}
                        alt="Sección referenciada"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: `50% ${f.scroll_y ?? 0}%`,
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                    </div>
                  )}
                  <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {(() => {
                        const linkedRecs = results.recommendations.filter(r => r.finding_id === f.id);
                        const isQuickWin = f.severity === "high" && linkedRecs.some(r => r.effort === "low");
                        return (
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_COLOR[f.severity] || "bg-gray-100 text-gray-600"}`}>
                              {SEVERITY_LABEL[f.severity] || f.severity}
                            </span>
                            <span className="text-xs text-gray-400">{f.finding_id}</span>
                            {isQuickWin && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                ⚡ Quick win
                              </span>
                            )}
                            {linkedRecs.length > 0 && (
                              <span className="text-xs text-gray-400">
                                → Rec. {linkedRecs.map(r => r.priority).join(", ")}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-sm font-medium text-gray-800 mt-1">{f.heuristic}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{f.impact}</p>
                      <p className="text-xs text-gray-400 mt-1">📍 {f.location}</p>
                    </div>
                  </div>
                  {(f.current_state || f.expected_state) && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {f.current_state && (
                        <div className="bg-red-50 rounded-lg p-2">
                          <div className="text-xs text-red-500 font-medium mb-0.5">Actual</div>
                          <div className="text-xs text-red-700">{f.current_state}</div>
                        </div>
                      )}
                      {f.expected_state && (
                        <div className="bg-green-50 rounded-lg p-2">
                          <div className="text-xs text-green-500 font-medium mb-0.5">Esperado</div>
                          <div className="text-xs text-green-700">{f.expected_state}</div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>{/* end p-4 */}
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Recomendaciones</h2>
            <div className="space-y-3">
              {results.recommendations
                .sort((a, b) => a.priority - b.priority)
                .map((r, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-[#0F2156] text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {r.priority}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{r.action}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            Esfuerzo: {r.effort}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                            Impacto: {r.impact}
                          </span>
                        </div>
                        {r.code_snippet && (
                          <pre className="mt-2 bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto">
                            {r.code_snippet}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          </div>{/* end resultsRef */}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={downloadPDF}
              disabled={downloading}
              className="flex-1 py-3 bg-[#0F2156] text-white rounded-xl text-sm font-medium hover:bg-[#1a3270] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? "Generando PDF..." : "Descargar informe PDF"}
            </button>
            <button
              onClick={() => { setStatus("idle"); setResults(null); setUrl(""); }}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Nueva auditoría
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
