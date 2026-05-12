"use client";

import { useRef, useState, useEffect, useCallback } from "react";

export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imgWidth: number;
  imgHeight: number;
}

interface Props {
  zones: Zone[];
  onChange: (zones: Zone[]) => void;
  imageFile: File | null;
  onImageChange: (file: File | null) => void;
}

const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

export default function ZoneEditor({
  zones,
  onChange,
  imageFile,
  onImageChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [currentRect, setCurrentRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [pendingZone, setPendingZone] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [nameInputPos, setNameInputPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    if (!imageFile) {
      setImageSrc(null);
      setNaturalSize(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImageSrc(e.target?.result as string);
    reader.readAsDataURL(imageFile);
  }, [imageFile]);

  const drawCanvas = useCallback(
    (
      zonesToDraw: Zone[],
      activeRect: { x: number; y: number; w: number; h: number } | null
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      zonesToDraw.forEach((zone, i) => {
        const color = COLORS[i % COLORS.length];
        ctx.fillStyle = color + "20";
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);

        ctx.font = `bold ${Math.max(12, canvas.width * 0.014)}px Arial`;
        const textW = ctx.measureText(zone.name).width;
        ctx.fillStyle = color;
        ctx.fillRect(zone.x, zone.y - 24, textW + 14, 24);
        ctx.fillStyle = "#fff";
        ctx.fillText(zone.name, zone.x + 7, zone.y - 7);
      });

      if (activeRect) {
        ctx.strokeStyle = "#1B3F8F";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.fillStyle = "#1B3F8F15";
        ctx.fillRect(activeRect.x, activeRect.y, activeRect.w, activeRect.h);
        ctx.strokeRect(activeRect.x, activeRect.y, activeRect.w, activeRect.h);
        ctx.setLineDash([]);
      }
    },
    []
  );

  useEffect(() => {
    drawCanvas(zones, currentRect);
  }, [zones, currentRect, drawCanvas]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    drawCanvas(zones, null);
  }, [zones, drawCanvas]);

  const getCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (pendingZone) return;
      const { x, y } = getCoords(e);
      setIsDrawing(true);
      setDrawStart({ x, y });
      setCurrentRect({ x, y, w: 0, h: 0 });
    },
    [pendingZone, getCoords]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !drawStart) return;
      const { x, y } = getCoords(e);
      const rect = {
        x: Math.min(drawStart.x, x),
        y: Math.min(drawStart.y, y),
        w: Math.abs(x - drawStart.x),
        h: Math.abs(y - drawStart.y),
      };
      setCurrentRect(rect);
      drawCanvas(zones, rect);
    },
    [isDrawing, drawStart, getCoords, zones, drawCanvas]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !drawStart) return;
      setIsDrawing(false);
      const { x, y } = getCoords(e);
      const rect = {
        x: Math.min(drawStart.x, x),
        y: Math.min(drawStart.y, y),
        w: Math.abs(x - drawStart.x),
        h: Math.abs(y - drawStart.y),
      };
      setCurrentRect(null);
      setDrawStart(null);

      if (rect.w < 20 || rect.h < 20) return;

      setPendingZone(rect);
      setNameInput("");

      const canvas = canvasRef.current;
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        setNameInputPos({
          left: rect.x * scaleX,
          top: Math.max(4, rect.y * scaleY - 48),
        });
      }
      setTimeout(() => nameInputRef.current?.focus(), 50);
    },
    [isDrawing, drawStart, getCoords]
  );

  const handleNameSubmit = useCallback(() => {
    if (!pendingZone || !nameInput.trim() || !naturalSize) return;
    const newZone: Zone = {
      id: Date.now().toString(),
      name: nameInput.trim(),
      x: pendingZone.x,
      y: pendingZone.y,
      width: pendingZone.w,
      height: pendingZone.h,
      imgWidth: naturalSize.w,
      imgHeight: naturalSize.h,
    };
    onChange([...zones, newZone]);
    setPendingZone(null);
    setNameInputPos(null);
    setNameInput("");
  }, [pendingZone, nameInput, naturalSize, zones, onChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) onImageChange(file);
    },
    [onImageChange]
  );

  if (!imageFile) {
    return (
      <label
        className="flex flex-col items-center justify-center w-full h-60 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImageChange(f);
          }}
        />
        <svg
          className="w-10 h-10 text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-gray-600 font-medium text-sm">
          Sube una imagen o arrástrala aquí
        </p>
        <p className="text-gray-400 text-xs mt-1">PNG, JPG, WebP</p>
      </label>
    );
  }

  if (!imageSrc) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-gray-400">
        Cargando imagen…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative inline-block w-full">
        <img
          ref={imageRef}
          src={imageSrc}
          alt="Interfaz a evaluar"
          className="w-full h-auto block rounded-lg border border-gray-200"
          onLoad={handleImageLoad}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full rounded-lg"
          style={{ cursor: pendingZone ? "default" : "crosshair" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        {pendingZone && nameInputPos && (
          <div
            className="absolute z-20 bg-white shadow-lg rounded-lg p-2 flex gap-2 border border-gray-200"
            style={{ left: nameInputPos.left, top: nameInputPos.top }}
          >
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSubmit();
                if (e.key === "Escape") {
                  setPendingZone(null);
                  setNameInputPos(null);
                }
              }}
              placeholder="Nombre de la zona"
              className="border border-gray-300 rounded px-2 py-1 text-sm w-40 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleNameSubmit}
              className="bg-[#1B3F8F] text-white rounded px-3 py-1 text-sm hover:bg-[#163375]"
            >
              OK
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <p className="text-xs text-gray-500">
          {zones.length === 0
            ? "Dibuja zonas arrastrando sobre la imagen ↑"
            : `${zones.length} zona${zones.length !== 1 ? "s" : ""} definida${zones.length !== 1 ? "s" : ""}`}
        </p>
        {zones.map((zone, i) => (
          <span
            key={zone.id}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium"
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
          >
            {zone.name}
            <button
              onClick={() => onChange(zones.filter((z) => z.id !== zone.id))}
              className="hover:opacity-70 ml-0.5 leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => {
            onImageChange(null);
            onChange([]);
          }}
          className="text-xs text-gray-400 hover:text-red-500 ml-auto transition-colors"
        >
          Cambiar imagen
        </button>
      </div>
    </div>
  );
}
