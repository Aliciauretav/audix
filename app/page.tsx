"use client";

import { useState, useCallback, useRef, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import ZoneEditor, { Zone } from "@/components/ZoneEditor";

// ─── Types ────────────────────────────────────────────────

interface Context {
  product: string;
  user: string;
  flow: string;
  version: string;
}
interface Issue {
  heuristic: string;
  description: string;
  severity: number;
  effort: string;
  recommendation: string;
}
interface ZoneResult {
  id: string;
  name: string;
  score: number;
  summary: string;
  issues: Issue[];
}
interface AnalysisResult {
  overallScore: number;
  zones: ZoneResult[];
}
interface EvalData {
  imageBase64: string;
  imageMime: string;
  zones: Zone[];
  context: Context;
  results: AnalysisResult;
}

// ─── Constants ────────────────────────────────────────────

const SEVERITY_LABEL = ["", "Cosmético", "Menor", "Mayor", "Crítico"];
const SEVERITY_CLASS = [
  "",
  "bg-gray-100 text-gray-600",
  "bg-yellow-100 text-yellow-700",
  "bg-orange-100 text-orange-700",
  "bg-red-100 text-red-700",
];
const EFFORT_CLASS: Record<string, string> = {
  bajo: "bg-green-100 text-green-700",
  medio: "bg-yellow-100 text-yellow-700",
  alto: "bg-red-100 text-red-700",
};

// ─── Small helpers ────────────────────────────────────────

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={size*0.07}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={size*0.07} strokeDasharray={circ}
        strokeDashoffset={circ - (score/100)*circ}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em"
        fontSize={size*0.22} fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

function Delta({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-green-600 font-semibold">+{Math.abs(delta)}</span>;
  if (delta < 0) return <span className="text-red-500 font-semibold">−{Math.abs(delta)}</span>;
  return <span className="text-gray-400">0</span>;
}

function normalizeName(n: string) {
  return n.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Read-only canvas that renders image + zones
function ZonedImageDisplay({ imageBase64, imageMime, zones }: {
  imageBase64: string; imageMime: string; zones: Zone[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBase64) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      zones.forEach((zone, i) => {
        const color = COLORS[i % COLORS.length];
        const lw = Math.max(3, img.naturalWidth * 0.003);
        ctx.lineWidth = lw;
        ctx.strokeStyle = color;
        ctx.fillStyle = color + "22";
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
        const fs = Math.max(14, img.naturalWidth * 0.015);
        ctx.font = `bold ${fs}px Arial`;
        const tw = ctx.measureText(zone.name).width;
        ctx.fillStyle = color;
        ctx.fillRect(zone.x, zone.y - fs - 6, tw + 12, fs + 6);
        ctx.fillStyle = "#fff";
        ctx.fillText(zone.name, zone.x + 6, zone.y - 4);
      });
    };
    img.src = `data:${imageMime};base64,${imageBase64}`;
  }, [imageBase64, imageMime, zones]);

  return <canvas ref={canvasRef} className="w-full h-auto rounded-lg border border-gray-200" />;
}

// ─── SetupPanel ───────────────────────────────────────────

function SetupPanel({ title, subtitle, defaultVersion, zoneHints, onComplete, onBack }: {
  title: string;
  subtitle?: string;
  defaultVersion?: string;
  zoneHints?: string[];
  onComplete: (data: EvalData) => void;
  onBack: () => void;
}) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState("");
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [zones, setZones] = useState<Zone[]>([]);
  const [context, setContext] = useState<Context>({
    product: "", user: "", flow: "", version: defaultVersion ?? "v1",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = useCallback((file: File | null) => {
    setImageFile(file);
    setZones([]);
    setError(null);
    if (!file) { setImageBase64(""); return; }
    setImageMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (e) => setImageBase64((e.target?.result as string).split(",")[1]);
    reader.readAsDataURL(file);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!imageBase64 || zones.length === 0 || !context.product) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          imageType: imageMime,
          zones: zones.map((z) => ({
            id: z.id, name: z.name,
            x: (z.x / z.imgWidth) * 100,
            y: (z.y / z.imgHeight) * 100,
            width: (z.width / z.imgWidth) * 100,
            height: (z.height / z.imgHeight) * 100,
          })),
          context,
        }),
      });
      if (!res.ok) throw new Error("Error en el servidor");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onComplete({ imageBase64, imageMime, zones, context, results: data });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al analizar");
    } finally {
      setLoading(false);
    }
  }, [imageBase64, imageMime, zones, context, onComplete]);

  const canAnalyze = !!imageBase64 && zones.length > 0 && !!context.product && !loading;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 className="font-semibold text-gray-800">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 space-y-6">
          {/* Step 1 — Image & zones */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              1 · Imagen y zonas
            </p>
            {zoneHints && zoneHints.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1 items-center">
                <span className="text-xs text-gray-400">Zonas de v1:</span>
                {zoneHints.map((h) => (
                  <span key={h} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{h}</span>
                ))}
              </div>
            )}
            <ZoneEditor zones={zones} onChange={setZones} imageFile={imageFile} onImageChange={handleImageChange}/>
          </section>

          {/* Step 2 — Context */}
          {imageFile && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                2 · Contexto
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  ["product", "Producto *", "ej. App de banca móvil"],
                  ["user", "Usuario objetivo", "ej. Cliente adulto"],
                  ["flow", "Pantalla / flujo", "ej. Pantalla de inicio"],
                  ["version", "Versión", "ej. v1"],
                ] as const).map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input type="text" value={context[key]}
                      onChange={(e) => setContext((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Analyze */}
          {imageFile && (
            <section>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}
              <button onClick={handleAnalyze} disabled={!canAnalyze}
                className="w-full bg-[#1B3F8F] text-white rounded-xl py-3 font-medium hover:bg-[#163375] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Analizando con Claude…
                  </>
                ) : zones.length === 0 ? "Define al menos una zona para analizar"
                  : !context.product ? "Completa el campo Producto"
                  : "Analizar con IA"}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── IndividualResults ────────────────────────────────────

function IndividualResults({ data, onBack }: { data: EvalData; onBack: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { generatePDF } = await import("@/lib/generatePDF");
      await generatePDF(data.imageBase64, data.imageMime, data.zones, data.context, data.results);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 className="font-semibold text-gray-800">Resultados</h1>
      </div>

      {/* Score card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              {data.context.flow || data.context.product} · {data.context.version}
            </h2>
            {data.context.user && <p className="text-sm text-gray-500 mt-0.5">{data.context.user}</p>}
          </div>
          <div className="flex items-center gap-3">
            <ScoreRing score={data.results.overallScore} size={72}/>
            <button onClick={handleDownload} disabled={downloading}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
              {downloading ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>Generando…</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>Descargar PDF</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Zone tables */}
      <ZoneResultsTable results={data.results}/>
    </div>
  );
}

// ─── ZoneResultsTable ─────────────────────────────────────

function ZoneResultsTable({ results }: { results: AnalysisResult }) {
  return (
    <div className="space-y-3">
      {results.zones.map((zone) => (
        <div key={zone.id} className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
            <ScoreRing score={zone.score} size={52}/>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-800">{zone.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{zone.summary}</p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {zone.issues.length} hallazgo{zone.issues.length !== 1 ? "s" : ""}
            </span>
          </div>

          {zone.issues.length > 0 && (
            <>
              {/* Desktop: tabla */}
              <div className="hidden sm:block overflow-x-auto rounded-b-2xl">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {["Item", "Criticidad", "Esfuerzo", "Detalle", "Medida"].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${i === 0 ? "w-[22%]" : i <= 2 ? "w-[11%]" : "w-[28%]"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {zone.issues.map((issue, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 align-top">
                          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-md">{issue.heuristic}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`text-xs font-medium px-2 py-1 rounded-md ${SEVERITY_CLASS[issue.severity] || SEVERITY_CLASS[1]}`}>
                            {SEVERITY_LABEL[issue.severity] || "Cosmético"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`text-xs font-medium px-2 py-1 rounded-md ${EFFORT_CLASS[issue.effort] || "bg-gray-100 text-gray-600"}`}>
                            {issue.effort}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-gray-700 leading-relaxed">{issue.description}</td>
                        <td className="px-4 py-3 align-top text-xs text-gray-500 leading-relaxed">{issue.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {zone.issues.map((issue, i) => (
                  <div key={i} className="px-4 py-4 space-y-2">
                    <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-md inline-block">{issue.heuristic}</span>
                    <div className="flex gap-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded-md ${SEVERITY_CLASS[issue.severity] || SEVERITY_CLASS[1]}`}>
                        {SEVERITY_LABEL[issue.severity] || "Cosmético"}
                      </span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-md ${EFFORT_CLASS[issue.effort] || "bg-gray-100 text-gray-600"}`}>
                        {issue.effort}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{issue.description}</p>
                    <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-200 pl-2">{issue.recommendation}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── CompareResults ───────────────────────────────────────

function CompareResults({ v1, v2, onBack }: { v1: EvalData; v2: EvalData; onBack: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { generateComparePDF } = await import("@/lib/generatePDF");
      await generateComparePDF(v1, v2);
    } finally {
      setDownloading(false);
    }
  };

  // Build zone pairs
  type ZonePair = { displayName: string; z1?: ZoneResult; z2?: ZoneResult };
  const zonePairs: ZonePair[] = [];
  const usedV2Keys = new Set<string>();
  for (const z1 of v1.results.zones) {
    const key = normalizeName(z1.name);
    const z2 = v2.results.zones.find((z) => normalizeName(z.name) === key);
    if (z2) usedV2Keys.add(normalizeName(z2.name));
    zonePairs.push({ displayName: z1.name, z1, z2 });
  }
  for (const z2 of v2.results.zones) {
    if (!usedV2Keys.has(normalizeName(z2.name))) zonePairs.push({ displayName: z2.name, z2 });
  }

  // Match issues per zone by heuristic name
  type MatchedIssue =
    | { type: "both";   h: string; i1: Issue; i2: Issue }
    | { type: "v1only"; h: string; i1: Issue }
    | { type: "v2only"; h: string; i2: Issue };

  const zoneIssues = zonePairs.map((pair) => {
    const usedI2 = new Set<number>();
    const matched: MatchedIssue[] = [];
    if (pair.z1) {
      for (const i1 of pair.z1.issues) {
        const key = normalizeName(i1.heuristic);
        const idx2 = pair.z2?.issues.findIndex((i2, idx) => !usedI2.has(idx) && normalizeName(i2.heuristic) === key) ?? -1;
        if (idx2 >= 0 && pair.z2) {
          usedI2.add(idx2);
          matched.push({ type: "both", h: i1.heuristic, i1, i2: pair.z2.issues[idx2] });
        } else {
          matched.push({ type: "v1only", h: i1.heuristic, i1 });
        }
      }
    }
    if (pair.z2) {
      pair.z2.issues.forEach((i2, idx) => {
        if (!usedI2.has(idx)) matched.push({ type: "v2only", h: i2.heuristic, i2 });
      });
    }
    return { pair, matched };
  });

  const overallDelta = v2.results.overallScore - v1.results.overallScore;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 className="font-semibold text-gray-800">Comparativa de versiones</h1>
        </div>
        <button onClick={handleDownload} disabled={downloading}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
          {downloading ? "Generando…" : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>Descargar PDF</>
          )}
        </button>
      </div>

      {/* Images + overall scores */}
      <div className="grid grid-cols-2 gap-4">
        {([v1, v2] as EvalData[]).map((d, idx) => (
          <div key={d.context.version} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800 text-sm">{d.context.version}</span>
                {idx === 1 && overallDelta !== 0 && (
                  <span className={`text-xs font-semibold ${overallDelta > 0 ? "text-green-600" : "text-red-500"}`}>
                    {overallDelta > 0 ? `+${overallDelta}` : `−${Math.abs(overallDelta)}`}
                  </span>
                )}
              </div>
              <ScoreRing score={d.results.overallScore} size={44}/>
            </div>
            <div className="p-3">
              <ZonedImageDisplay imageBase64={d.imageBase64} imageMime={d.imageMime} zones={d.zones}/>
            </div>
          </div>
        ))}
      </div>

      {/* Unified comparative table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700">
            {v1.context.product} · {v1.context.version} vs {v2.context.version}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead>
              <tr>
                <th rowSpan={2} className="bg-gray-50 px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[13%] align-bottom">
                  Item
                </th>
                <th colSpan={3} className="bg-blue-50 px-3 py-2 text-center font-bold text-blue-700 uppercase tracking-wide border-b border-blue-200">
                  {v1.context.version}
                </th>
                <th colSpan={3} className="bg-emerald-50 px-3 py-2 text-center font-bold text-emerald-700 uppercase tracking-wide border-b border-emerald-200">
                  {v2.context.version}
                </th>
                <th rowSpan={2} className="bg-gray-50 px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[13%] align-bottom">
                  Análisis
                </th>
                <th rowSpan={2} className="bg-gray-50 px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[14%] align-bottom">
                  Medidas
                </th>
              </tr>
              <tr>
                <th className="bg-blue-50/60 px-3 py-2 text-left font-medium text-blue-600 border-b border-blue-100 w-[9%]">Criticidad</th>
                <th className="bg-blue-50/60 px-3 py-2 text-left font-medium text-blue-600 border-b border-blue-100 w-[8%]">Esfuerzo</th>
                <th className="bg-blue-50/60 px-3 py-2 text-left font-medium text-blue-600 border-b border-blue-100 w-[14%]">Detalle</th>
                <th className="bg-emerald-50/60 px-3 py-2 text-left font-medium text-emerald-600 border-b border-emerald-100 w-[9%]">Criticidad</th>
                <th className="bg-emerald-50/60 px-3 py-2 text-left font-medium text-emerald-600 border-b border-emerald-100 w-[8%]">Esfuerzo</th>
                <th className="bg-emerald-50/60 px-3 py-2 text-left font-medium text-emerald-600 border-b border-emerald-100 w-[14%]">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {zoneIssues.flatMap(({ pair, matched }) => {
                const s1 = pair.z1?.score, s2 = pair.z2?.score;
                const zoneDelta = s1 !== undefined && s2 !== undefined ? s2 - s1 : null;

                const zoneRow = (
                  <tr key={`zone-${pair.displayName}`} className="bg-indigo-50 border-t border-indigo-100">
                    <td colSpan={9} className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-indigo-800">{pair.displayName}</span>
                        {s1 !== undefined && s2 !== undefined && (
                          <span className="text-indigo-400">
                            {s1} → {s2}
                            <span className={`ml-1.5 font-semibold ${zoneDelta! > 0 ? "text-green-600" : zoneDelta! < 0 ? "text-red-500" : "text-gray-400"}`}>
                              ({zoneDelta! > 0 ? "+" : ""}{zoneDelta})
                            </span>
                          </span>
                        )}
                        {s1 !== undefined && s2 === undefined && <span className="text-indigo-400">{v1.context.version}: {s1}</span>}
                        {s1 === undefined && s2 !== undefined && <span className="text-indigo-400">{v2.context.version}: {s2}</span>}
                        <span className="ml-auto text-indigo-300">{matched.length} hallazgo{matched.length !== 1 ? "s" : ""}</span>
                      </div>
                    </td>
                  </tr>
                );

                const issueRows = matched.length === 0
                  ? [<tr key={`${pair.displayName}-empty`}><td colSpan={9} className="px-3 py-2 text-gray-400 italic">Sin hallazgos</td></tr>]
                  : matched.map((row, i) => {
                      const i1 = "i1" in row ? row.i1 : null;
                      const i2 = "i2" in row ? row.i2 : null;

                      let analysisText = "";
                      let analysisClass = "text-gray-500 italic";
                      if (row.type === "both") {
                        if (i2!.severity < i1!.severity) { analysisText = `Mejoró: ${SEVERITY_LABEL[i1!.severity]} → ${SEVERITY_LABEL[i2!.severity]}`; analysisClass = "text-green-700 font-medium"; }
                        else if (i2!.severity > i1!.severity) { analysisText = `Empeoró: ${SEVERITY_LABEL[i1!.severity]} → ${SEVERITY_LABEL[i2!.severity]}`; analysisClass = "text-red-600 font-medium"; }
                        else { analysisText = `Persiste como ${SEVERITY_LABEL[i1!.severity]}`; analysisClass = "text-gray-500 italic"; }
                      } else if (row.type === "v1only") {
                        analysisText = `Resuelto en ${v2.context.version}`;
                        analysisClass = "text-green-700 font-semibold";
                      } else {
                        analysisText = `Nuevo en ${v2.context.version}`;
                        analysisClass = "text-blue-700 font-semibold";
                      }

                      const measText = i2 ? i2.recommendation : i1!.recommendation;
                      const rowBg = row.type === "v1only" ? "bg-green-50/40" : row.type === "v2only" ? "bg-blue-50/40" : "";

                      return (
                        <tr key={`${pair.displayName}-${i}`} className={`border-t border-gray-50 hover:bg-gray-50/80 ${rowBg}`}>
                          {/* Item */}
                          <td className="px-3 py-2.5 align-top">
                            <span className="font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded leading-relaxed">{row.h}</span>
                          </td>
                          {/* V1 */}
                          {i1 ? (
                            <>
                              <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                <span className={`font-medium px-1.5 py-0.5 rounded ${SEVERITY_CLASS[i1.severity] || SEVERITY_CLASS[1]}`}>
                                  {SEVERITY_LABEL[i1.severity] || "Cosmético"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                <span className={`font-medium px-1.5 py-0.5 rounded ${EFFORT_CLASS[i1.effort] || "bg-gray-100 text-gray-600"}`}>
                                  {i1.effort}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 align-top text-gray-700 leading-relaxed">{i1.description}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="px-3 py-2.5 text-center text-gray-300 align-middle">—</td>
                          )}
                          {/* V2 */}
                          {i2 ? (
                            <>
                              <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                <span className={`font-medium px-1.5 py-0.5 rounded ${SEVERITY_CLASS[i2.severity] || SEVERITY_CLASS[1]}`}>
                                  {SEVERITY_LABEL[i2.severity] || "Cosmético"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                <span className={`font-medium px-1.5 py-0.5 rounded ${EFFORT_CLASS[i2.effort] || "bg-gray-100 text-gray-600"}`}>
                                  {i2.effort}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 align-top text-gray-700 leading-relaxed">{i2.description}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="px-3 py-2.5 align-middle">
                              <span className="font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Resuelto</span>
                            </td>
                          )}
                          {/* Análisis */}
                          <td className={`px-3 py-2.5 align-top leading-relaxed ${analysisClass}`}>{analysisText}</td>
                          {/* Medidas */}
                          <td className="px-3 py-2.5 align-top text-gray-500 leading-relaxed">{measText}</td>
                        </tr>
                      );
                    });

                return [zoneRow, ...issueRows];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SelectScreen ─────────────────────────────────────────

function SelectScreen({ onSelect }: { onSelect: (mode: "individual" | "comparative") => void }) {
  const router = useRouter();
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-gray-800">¿Qué quieres evaluar?</h1>
        <p className="text-gray-500 mt-2 text-sm">Elige el tipo de pantalla para comenzar</p>
      </div>

      {/* Pantallas diseñadas */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
          Pantallas diseñadas
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={() => onSelect("individual")}
            className="bg-white rounded-2xl border border-gray-200 p-6 text-left hover:border-[#1B3F8F] hover:shadow-md transition-all group">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <svg className="w-5 h-5 text-[#1B3F8F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">Evaluación individual</h3>
            <p className="text-sm text-gray-500">Analiza una pantalla con heurísticas de Nielsen y WCAG 2.1 AA</p>
          </button>

          <button onClick={() => onSelect("comparative")}
            className="bg-white rounded-2xl border border-gray-200 p-6 text-left hover:border-[#1B3F8F] hover:shadow-md transition-all group">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <svg className="w-5 h-5 text-[#1B3F8F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">Evaluación comparativa</h3>
            <p className="text-sm text-gray-500">Compara dos versiones y mide el impacto de los cambios</p>
          </button>
        </div>
      </div>

      {/* Sitio existente */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
          Sitio existente en la web
        </p>
        <button onClick={() => router.push("/auto")}
          className="w-full bg-white rounded-2xl border border-gray-200 p-6 text-left hover:border-[#1B3F8F] hover:shadow-md transition-all group">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
              <svg className="w-5 h-5 text-[#1B3F8F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Auditoría automática por URL</h3>
              <p className="text-sm text-gray-500">Ingresa una URL y el agente captura, analiza accesibilidad, performance y contenido automáticamente</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────

type Screen =
  | { type: "select" }
  | { type: "individual-setup" }
  | { type: "individual-results"; data: EvalData }
  | { type: "compare-v1" }
  | { type: "compare-v2"; v1: EvalData }
  | { type: "compare-results"; v1: EvalData; v2: EvalData };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ type: "select" });

  if (screen.type === "select") {
    return (
      <SelectScreen
        onSelect={(mode) =>
          setScreen(mode === "individual" ? { type: "individual-setup" } : { type: "compare-v1" })
        }
      />
    );
  }

  if (screen.type === "individual-setup") {
    return (
      <SetupPanel
        title="Evaluación individual"
        subtitle="Sube una imagen, define las zonas y analiza"
        defaultVersion="v1"
        onBack={() => setScreen({ type: "select" })}
        onComplete={(data) => setScreen({ type: "individual-results", data })}
      />
    );
  }

  if (screen.type === "individual-results") {
    return (
      <IndividualResults
        data={screen.data}
        onBack={() => setScreen({ type: "select" })}
      />
    );
  }

  if (screen.type === "compare-v1") {
    return (
      <SetupPanel
        key="compare-v1"
        title="Evaluación comparativa — versión 1"
        subtitle="Sube la primera versión de la interfaz"
        defaultVersion="v1"
        onBack={() => setScreen({ type: "select" })}
        onComplete={(v1) => setScreen({ type: "compare-v2", v1 })}
      />
    );
  }

  if (screen.type === "compare-v2") {
    return (
      <SetupPanel
        key="compare-v2"
        title="Evaluación comparativa — versión 2"
        subtitle="Sube la versión rediseñada"
        defaultVersion="v2"
        zoneHints={screen.v1.zones.map((z) => z.name)}
        onBack={() => setScreen({ type: "compare-v1" })}
        onComplete={(v2) => setScreen({ type: "compare-results", v1: screen.v1, v2 })}
      />
    );
  }

  if (screen.type === "compare-results") {
    return (
      <CompareResults
        v1={screen.v1}
        v2={screen.v2}
        onBack={() => setScreen({ type: "select" })}
      />
    );
  }
}
