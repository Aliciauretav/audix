import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  const apiKey = getApiKey();
  const client = new Anthropic({ apiKey });

  try {
    const body = await request.json();
    const { image, imageType, zones, context } = body;

    if (!image || !zones?.length || !context?.product) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    const zonesText = zones
      .map(
        (z: { name: string; x: number; y: number; width: number; height: number }, i: number) =>
          `${i + 1}. "${z.name}" — x: ${z.x.toFixed(1)}%, y: ${z.y.toFixed(1)}%, ancho: ${z.width.toFixed(1)}%, alto: ${z.height.toFixed(1)}%`
      )
      .join("\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: `Eres un experto en evaluación heurística de interfaces de usuario con profundo conocimiento de las 10 heurísticas de Nielsen y los criterios de accesibilidad WCAG 2.1 AA. Evalúas interfaces de forma estructurada, objetiva y accionable. Siempre respondes en español y únicamente con JSON válido, sin texto adicional fuera del JSON.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: image,
              },
            },
            {
              type: "text",
              text: `Analiza esta interfaz usando las 10 heurísticas de Nielsen y WCAG 2.1 AA.

CONTEXTO:
- Producto: ${context.product}
- Usuario objetivo: ${context.user || "No especificado"}
- Pantalla / flujo: ${context.flow || "No especificado"}
- Versión: ${context.version || "v1"}

ZONAS A EVALUAR (coordenadas como % de las dimensiones totales de la imagen, origen en esquina superior izquierda):
${zonesText}

Evalúa cada zona de forma independiente. Limita a máximo 4 issues por zona. Sé breve: máximo 15 palabras por campo description y recommendation. Asigna un score de 0 a 100 donde 100 es perfecto.

Responde ÚNICAMENTE con este JSON (sin texto antes ni después):
{
  "overallScore": <número 0-100>,
  "zones": [
    {
      "id": "<id exacto de la zona como aparece en la lista>",
      "name": "<nombre exacto de la zona>",
      "score": <número 0-100>,
      "summary": "<resumen de 1-2 oraciones sobre el estado de la zona>",
      "issues": [
        {
          "heuristic": "<nombre de la heurística Nielsen o criterio WCAG>",
          "description": "<problema específico observado en esta zona>",
          "severity": <1=cosmético, 2=menor, 3=mayor, 4=crítico>,
          "effort": "<bajo|medio|alto>",
          "recommendation": "<acción concreta para resolverlo>"
        }
      ]
    }
  ]
}`,
            },
          ],
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La respuesta no contiene JSON válido");
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analyze error:", error);
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
