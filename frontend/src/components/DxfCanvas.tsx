/**
 * DxfCanvas — Visor 2D de entidades DXF sobre canvas HTML5.
 *
 * Funcionalidades:
 * - Renderizado de entidades (lineas, polilineas, circulos, arcos, splines)
 * - Pan (Space+drag o boton medio)
 * - Zoom (rueda)
 * - Colores segun jerarquia: azul=exterior, rojo=interior, gris=abierta
 * - Marcadores de problemas: puntos rojos (abierta), amarillos (casi cerrada)
 * - Click en entidad para seleccionar (naranja)
 * - Fit-to-view automatico
 */
import { useRef, useEffect, useCallback, useState } from "react";

type Entidad = {
  id: number;
  tipo: string;
  puntos: number[][];
  cerrada: boolean;
  radio: number;
  centro: number[] | null;
  longitud: number;
  bounds: number[] | null;
};

type Problema = {
  tipo: string;
  severidad: string;
  entidad_id: number;
  descripcion: string;
  posicion: number[] | null;
  reparable: boolean;
};

type Props = {
  entidades: Entidad[];
  problemas: Problema[];
  bounds: number[];
  jerarquia: Record<string, string>;
  seleccionada: number | null;
  onSelect: (id: number | null) => void;
};

const COLORES = {
  exterior: "#3b82f6",    // azul
  interior: "#ef4444",    // rojo
  abierta: "#6b7280",     // gris
  seleccionada: "#f97316", // naranja
};

export default function DxfCanvas({ entidades, problemas, bounds, jerarquia, seleccionada, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);

  // Fit-to-view al cargar
  useEffect(() => {
    if (!canvasRef.current || !bounds || bounds.length < 4) return;
    const canvas = canvasRef.current;
    const [xmin, ymin, xmax, ymax] = bounds;
    const dw = xmax - xmin;
    const dh = ymax - ymin;
    if (dw < 0.01 && dh < 0.01) return;

    const padding = 40;
    const scaleX = (canvas.width - padding * 2) / dw;
    const scaleY = (canvas.height - padding * 2) / dh;
    const scale = Math.min(scaleX, scaleY);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    setView({
      x: canvas.width / 2 - cx * scale,
      y: canvas.height / 2 + cy * scale, // Y invertido
      scale,
    });
  }, [bounds, entidades]);

  // Dibujar
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Ajustar tamanio del canvas al contenedor
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const { x: vx, y: vy, scale } = view;

    // Limpiar
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grilla
    _drawGrid(ctx, canvas.width, canvas.height, vx, vy, scale);

    // Entidades
    for (const e of entidades) {
      const esSeleccionada = e.id === seleccionada;
      const tipo = jerarquia[String(e.id)] || "abierta";
      ctx.strokeStyle = esSeleccionada ? COLORES.seleccionada : (COLORES[tipo as keyof typeof COLORES] || COLORES.abierta);
      ctx.lineWidth = esSeleccionada ? 2.5 : 1.5;

      if (e.puntos.length < 2) continue;

      ctx.beginPath();
      const first = _toScreen(e.puntos[0][0], e.puntos[0][1], vx, vy, scale);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < e.puntos.length; i++) {
        const p = _toScreen(e.puntos[i][0], e.puntos[i][1], vx, vy, scale);
        ctx.lineTo(p.x, p.y);
      }
      if (e.cerrada) {
        ctx.closePath();
      }
      ctx.stroke();
    }

    // Marcadores de problemas
    for (const p of problemas) {
      if (!p.posicion) continue;
      const sp = _toScreen(p.posicion[0], p.posicion[1], vx, vy, scale);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.severidad === "critico" ? "#ef4444" : "#eab308";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [entidades, problemas, jerarquia, view, seleccionada]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, [draw]);

  // --- Event handlers ---

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => ({
      x: mx - (mx - v.x) * factor,
      y: my - (my - v.y) * factor,
      scale: v.scale * factor,
    }));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || spaceDown) {
      // Middle button or space
      setIsPanning(true);
      setPanStart({ x: e.clientX - view.x, y: e.clientY - view.y });
      e.preventDefault();
    } else if (e.button === 0 && !spaceDown) {
      // Click izquierdo — seleccionar entidad
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldPt = _toWorld(mx, my, view.x, view.y, view.scale);

      // Buscar entidad cercana
      let closest: number | null = null;
      let closestDist = 10 / view.scale; // 10px de tolerancia

      for (const ent of entidades) {
        for (const pt of ent.puntos) {
          const dx = pt[0] - worldPt.x;
          const dy = pt[1] - worldPt.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < closestDist) {
            closestDist = d;
            closest = ent.id;
          }
        }
      }
      onSelect(closest);
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning) {
      setView((v) => ({ ...v, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
    }
  }

  function handleMouseUp() {
    setIsPanning(false);
  }

  useEffect(() => {
    function kd(e: KeyboardEvent) { if (e.code === "Space") { setSpaceDown(true); e.preventDefault(); } }
    function ku(e: KeyboardEvent) { if (e.code === "Space") { setSpaceDown(false); } }
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ cursor: isPanning || spaceDown ? "grab" : "crosshair" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}

// --- Helpers ---

function _toScreen(wx: number, wy: number, vx: number, vy: number, scale: number) {
  return { x: wx * scale + vx, y: -wy * scale + vy }; // Y invertido
}

function _toWorld(sx: number, sy: number, vx: number, vy: number, scale: number) {
  return { x: (sx - vx) / scale, y: -(sy - vy) / scale };
}

function _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number,
                   vx: number, vy: number, scale: number) {
  // Grid adaptativa
  let gridSize = 10; // mm
  while (gridSize * scale < 20) gridSize *= 5;
  while (gridSize * scale > 200) gridSize /= 5;

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 0.5;

  // Calcular rango visible en coordenadas mundo
  const world0 = _toWorld(0, 0, vx, vy, scale);
  const world1 = _toWorld(w, h, vx, vy, scale);
  const xmin = Math.floor(Math.min(world0.x, world1.x) / gridSize) * gridSize;
  const xmax = Math.ceil(Math.max(world0.x, world1.x) / gridSize) * gridSize;
  const ymin = Math.floor(Math.min(world0.y, world1.y) / gridSize) * gridSize;
  const ymax = Math.ceil(Math.max(world0.y, world1.y) / gridSize) * gridSize;

  for (let x = xmin; x <= xmax; x += gridSize) {
    const sp = _toScreen(x, 0, vx, vy, scale);
    ctx.beginPath();
    ctx.moveTo(sp.x, 0);
    ctx.lineTo(sp.x, h);
    ctx.stroke();
  }
  for (let y = ymin; y <= ymax; y += gridSize) {
    const sp = _toScreen(0, y, vx, vy, scale);
    ctx.beginPath();
    ctx.moveTo(0, sp.y);
    ctx.lineTo(w, sp.y);
    ctx.stroke();
  }

  // Ejes X e Y
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  const ox = _toScreen(0, 0, vx, vy, scale);
  ctx.beginPath(); ctx.moveTo(ox.x, 0); ctx.lineTo(ox.x, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, ox.y); ctx.lineTo(w, ox.y); ctx.stroke();
}
