/**
 * DxfCanvas — Visor 2D de entidades DXF sobre canvas HTML5.
 *
 * Funcionalidades:
 * - Renderizado de entidades (lineas, polilineas, circulos, arcos, splines)
 * - Pan: Space+drag o boton medio
 * - Zoom: rueda con scale factor 1.15
 * - Colores segun jerarquia: azul=exterior, rojo=interior, gris=abierta
 * - Seleccion: click, shift+click, ventana de seleccion (drag rectangulo)
 * - Drag-to-move: arrastrar entidades seleccionadas
 * - Dimensiones: muestra ancho x alto de entidades seleccionadas
 * - Grips: puntos en esquinas del bounding box de seleccion
 * - Doble-click medio: zoom fit
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
  archivo_id?: number;
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
  seleccionadas: number[];
  onSelect: (id: number | null, shift?: boolean) => void;
  onWindowSelect: (ids: number[]) => void;
  onDragMove: (ids: number[], dx: number, dy: number) => void;
  onCtrlDragDuplicate?: (ids: number[], dx: number, dy: number) => void;
};

const COLORES: Record<string, string> = {
  exterior: "#3b82f6",
  interior: "#ef4444",
  abierta: "#6b7280",
  seleccionada: "#f97316",
};

type DragState =
  | { type: "none" }
  | { type: "pan"; startX: number; startY: number; viewX: number; viewY: number }
  | { type: "drag"; startWorldX: number; startWorldY: number; lastWorldX: number; lastWorldY: number; ctrlKey: boolean }
  | { type: "window"; startX: number; startY: number; endX: number; endY: number };

export default function DxfCanvas({ entidades, problemas, bounds, jerarquia, seleccionadas, onSelect, onWindowSelect, onDragMove, onCtrlDragDuplicate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [dragState, setDragState] = useState<DragState>({ type: "none" });
  const [spaceDown, setSpaceDown] = useState(false);
  const [cursor, setCursor] = useState("crosshair");
  const viewRef = useRef(view);
  viewRef.current = view;

  // Fit-to-view al cargar
  useEffect(() => {
    if (!canvasRef.current || !bounds || bounds.length < 4) return;
    const canvas = canvasRef.current;
    const [xmin, ymin, xmax, ymax] = bounds;
    const dw = xmax - xmin;
    const dh = ymax - ymin;
    if (dw < 0.01 && dh < 0.01) return;

    const padding = 60;
    const scaleX = (canvas.width - padding * 2) / dw;
    const scaleY = (canvas.height - padding * 2) / dh;
    const scale = Math.min(scaleX, scaleY);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    setView({
      x: canvas.width / 2 - cx * scale,
      y: canvas.height / 2 + cy * scale,
      scale,
    });
  }, [bounds, entidades.length]);

  // Dibujar
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const { x: vx, y: vy, scale } = view;

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    _drawGrid(ctx, canvas.width, canvas.height, vx, vy, scale);

    // Entidades
    for (const e of entidades) {
      const esSel = seleccionadas.includes(e.id);
      const tipo = jerarquia[String(e.id)] || "abierta";
      ctx.strokeStyle = esSel ? COLORES.seleccionada : (COLORES[tipo] || COLORES.abierta);
      ctx.lineWidth = esSel ? 2.5 : 1.5;

      if (e.puntos.length < 2) continue;

      ctx.beginPath();
      const first = _toScreen(e.puntos[0][0], e.puntos[0][1], vx, vy, scale);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < e.puntos.length; i++) {
        const p = _toScreen(e.puntos[i][0], e.puntos[i][1], vx, vy, scale);
        ctx.lineTo(p.x, p.y);
      }
      if (e.cerrada) ctx.closePath();
      ctx.stroke();
    }

    // Dimensiones y grips para entidades seleccionadas
    if (seleccionadas.length > 0) {
      const selEnts = entidades.filter(e => seleccionadas.includes(e.id));
      const allPts: number[][] = [];
      selEnts.forEach(e => allPts.push(...e.puntos));

      if (allPts.length > 0) {
        const xs = allPts.map(p => p[0]);
        const ys = allPts.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        const tl = _toScreen(minX, maxY, vx, vy, scale);
        const br = _toScreen(maxX, minY, vx, vy, scale);

        // Bounding box punteado
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.setLineDash([]);

        // Grips (esquinas)
        const gripSize = 5;
        ctx.fillStyle = "#f97316";
        const corners = [
          { x: tl.x, y: tl.y }, { x: br.x, y: tl.y },
          { x: tl.x, y: br.y }, { x: br.x, y: br.y },
          { x: (tl.x + br.x) / 2, y: tl.y }, { x: (tl.x + br.x) / 2, y: br.y },
          { x: tl.x, y: (tl.y + br.y) / 2 }, { x: br.x, y: (tl.y + br.y) / 2 },
        ];
        for (const c of corners) {
          ctx.fillRect(c.x - gripSize, c.y - gripSize, gripSize * 2, gripSize * 2);
        }

        // Dimension labels
        const w = maxX - minX;
        const h = maxY - minY;
        ctx.font = "11px monospace";
        ctx.fillStyle = "#f97316";
        ctx.textAlign = "center";
        // Ancho arriba
        ctx.fillText(`${w.toFixed(1)} mm`, (tl.x + br.x) / 2, tl.y - 8);
        // Alto a la derecha
        ctx.save();
        ctx.translate(br.x + 14, (tl.y + br.y) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${h.toFixed(1)} mm`, 0, 0);
        ctx.restore();
      }
    }

    // Ghost preview during Ctrl+drag (duplicate)
    if (dragState.type === "drag" && dragState.ctrlKey) {
      const ddx = dragState.lastWorldX - dragState.startWorldX;
      const ddy = dragState.lastWorldY - dragState.startWorldY;
      if (Math.abs(ddx) > 0.01 || Math.abs(ddy) > 0.01) {
        ctx.globalAlpha = 0.4;
        const selEnts = entidades.filter(e => seleccionadas.includes(e.id));
        for (const e of selEnts) {
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 1.5;
          if (e.puntos.length < 2) continue;
          ctx.beginPath();
          const first = _toScreen(e.puntos[0][0] + ddx, e.puntos[0][1] + ddy, vx, vy, scale);
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < e.puntos.length; i++) {
            const p = _toScreen(e.puntos[i][0] + ddx, e.puntos[i][1] + ddy, vx, vy, scale);
            ctx.lineTo(p.x, p.y);
          }
          if (e.cerrada) ctx.closePath();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
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

    // Ventana de seleccion
    if (dragState.type === "window") {
      const { startX, startY, endX, endY } = dragState;
      const isLeftToRight = endX > startX;
      ctx.strokeStyle = isLeftToRight ? "#3b82f6" : "#22c55e";
      ctx.lineWidth = 1;
      ctx.setLineDash(isLeftToRight ? [] : [6, 3]);
      ctx.fillStyle = isLeftToRight ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)";
      ctx.fillRect(startX, startY, endX - startX, endY - startY);
      ctx.strokeRect(startX, startY, endX - startX, endY - startY);
      ctx.setLineDash([]);
    }
  }, [entidades, problemas, jerarquia, view, seleccionadas, dragState]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, [draw]);

  // --- Helpers ---

  function findEntityAtScreen(mx: number, my: number): number | null {
    const v = viewRef.current;
    const worldPt = _toWorld(mx, my, v.x, v.y, v.scale);
    let closest: number | null = null;
    let closestDist = 10 / v.scale;
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
    return closest;
  }

  function isPointOnSelectedEntity(mx: number, my: number): boolean {
    const id = findEntityAtScreen(mx, my);
    return id !== null && seleccionadas.includes(id);
  }

  function getEntitiesInRect(x1: number, y1: number, x2: number, y2: number): number[] {
    const v = viewRef.current;
    const w1 = _toWorld(Math.min(x1, x2), Math.min(y1, y2), v.x, v.y, v.scale);
    const w2 = _toWorld(Math.max(x1, x2), Math.max(y1, y2), v.x, v.y, v.scale);
    const wMinX = Math.min(w1.x, w2.x), wMaxX = Math.max(w1.x, w2.x);
    const wMinY = Math.min(w1.y, w2.y), wMaxY = Math.max(w1.y, w2.y);

    const isLeftToRight = x2 > x1;

    return entidades.filter(e => {
      if (!e.bounds) return false;
      const [bx1, by1, bx2, by2] = e.bounds;
      if (isLeftToRight) {
        // Window: entity must be fully contained
        return bx1 >= wMinX && bx2 <= wMaxX && by1 >= wMinY && by2 <= wMaxY;
      } else {
        // Crossing: entity just needs to intersect
        return bx2 >= wMinX && bx1 <= wMaxX && by2 >= wMinY && by1 <= wMaxY;
      }
    }).map(e => e.id);
  }

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Middle button or space: pan
    if (e.button === 1 || spaceDown) {
      setDragState({ type: "pan", startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y });
      setCursor("grabbing");
      e.preventDefault();
      return;
    }

    // Double-click middle: zoom fit
    if (e.button === 1 && e.detail === 2) {
      fitToView();
      return;
    }

    if (e.button !== 0) return;

    // Left click on selected entity: start drag (Ctrl = duplicate)
    if (seleccionadas.length > 0 && isPointOnSelectedEntity(mx, my)) {
      const v = viewRef.current;
      const wp = _toWorld(mx, my, v.x, v.y, v.scale);
      setDragState({ type: "drag", startWorldX: wp.x, startWorldY: wp.y, lastWorldX: wp.x, lastWorldY: wp.y, ctrlKey: e.ctrlKey || e.metaKey });
      setCursor(e.ctrlKey || e.metaKey ? "copy" : "move");
      return;
    }

    // Left click on entity: select it
    const id = findEntityAtScreen(mx, my);
    if (id !== null) {
      onSelect(id, e.shiftKey);
      return;
    }

    // Left click on empty space: start window selection
    if (!e.shiftKey) {
      setDragState({ type: "window", startX: mx, startY: my, endX: mx, endY: my });
    } else {
      // Shift+click on empty: don't deselect
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragState.type === "pan") {
      setView({
        x: dragState.viewX + (e.clientX - dragState.startX),
        y: dragState.viewY + (e.clientY - dragState.startY),
        scale: view.scale,
      });
      return;
    }

    if (dragState.type === "window") {
      setDragState({ ...dragState, endX: mx, endY: my });
      return;
    }

    if (dragState.type === "drag") {
      // Visual feedback handled by cursor, actual move on mouseup
      const v = viewRef.current;
      const wp = _toWorld(mx, my, v.x, v.y, v.scale);
      setDragState({ ...dragState, lastWorldX: wp.x, lastWorldY: wp.y });
      return;
    }

    // Update cursor
    if (spaceDown) {
      setCursor("grab");
    } else if (seleccionadas.length > 0 && isPointOnSelectedEntity(mx, my)) {
      setCursor("move");
    } else {
      setCursor("crosshair");
    }
  }

  function handleMouseUp(_e: React.MouseEvent) {
    if (dragState.type === "pan") {
      setDragState({ type: "none" });
      setCursor(spaceDown ? "grab" : "crosshair");
      return;
    }

    if (dragState.type === "window") {
      const { startX, startY, endX, endY } = dragState;
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);
      if (w > 5 || h > 5) {
        const ids = getEntitiesInRect(startX, startY, endX, endY);
        onWindowSelect(ids);
      } else {
        onSelect(null);
      }
      setDragState({ type: "none" });
      return;
    }

    if (dragState.type === "drag") {
      const dx = dragState.lastWorldX - dragState.startWorldX;
      const dy = dragState.lastWorldY - dragState.startWorldY;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        if (dragState.ctrlKey && onCtrlDragDuplicate) {
          onCtrlDragDuplicate(seleccionadas, dx, dy);
        } else {
          onDragMove(seleccionadas, dx, dy);
        }
      }
      setDragState({ type: "none" });
      setCursor("crosshair");
      return;
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (e.button === 1) {
      fitToView();
    }
  }

  function fitToView() {
    if (!canvasRef.current || !bounds || bounds.length < 4) return;
    const canvas = canvasRef.current;
    const [xmin, ymin, xmax, ymax] = bounds;
    const dw = xmax - xmin;
    const dh = ymax - ymin;
    if (dw < 0.01 && dh < 0.01) return;
    const padding = 60;
    const scaleX = (canvas.width - padding * 2) / dw;
    const scaleY = (canvas.height - padding * 2) / dh;
    const scale = Math.min(scaleX, scaleY);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    setView({ x: canvas.width / 2 - cx * scale, y: canvas.height / 2 + cy * scale, scale });
  }

  // Keyboard events
  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.code === "Space") { setSpaceDown(true); e.preventDefault(); }
    }
    function ku(e: KeyboardEvent) {
      if (e.code === "Space") { setSpaceDown(false); }
    }
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  const btnZoom = "w-8 h-8 rounded bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center border border-neutral-700";

  return (
    <div className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDragState({ type: "none" }); }}
        onDoubleClick={handleDoubleClick}
      />
      {/* Zoom buttons */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button onClick={() => setView(v => ({ ...v, scale: v.scale * 1.3 }))} className={btnZoom} title="Zoom in">+</button>
        <button onClick={() => setView(v => ({ ...v, scale: v.scale / 1.3 }))} className={btnZoom} title="Zoom out">−</button>
        <button onClick={fitToView} className={btnZoom + " text-xs"} title="Zoom fit">⊡</button>
      </div>
    </div>
  );
}

// --- Helpers ---

function _toScreen(wx: number, wy: number, vx: number, vy: number, scale: number) {
  return { x: wx * scale + vx, y: -wy * scale + vy };
}

function _toWorld(sx: number, sy: number, vx: number, vy: number, scale: number) {
  return { x: (sx - vx) / scale, y: -(sy - vy) / scale };
}

function _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number,
                   vx: number, vy: number, scale: number) {
  let gridSize = 10;
  while (gridSize * scale < 20) gridSize *= 5;
  while (gridSize * scale > 200) gridSize /= 5;

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 0.5;

  const world0 = _toWorld(0, 0, vx, vy, scale);
  const world1 = _toWorld(w, h, vx, vy, scale);
  const xmin = Math.floor(Math.min(world0.x, world1.x) / gridSize) * gridSize;
  const xmax = Math.ceil(Math.max(world0.x, world1.x) / gridSize) * gridSize;
  const ymin = Math.floor(Math.min(world0.y, world1.y) / gridSize) * gridSize;
  const ymax = Math.ceil(Math.max(world0.y, world1.y) / gridSize) * gridSize;

  for (let x = xmin; x <= xmax; x += gridSize) {
    const sp = _toScreen(x, 0, vx, vy, scale);
    ctx.beginPath(); ctx.moveTo(sp.x, 0); ctx.lineTo(sp.x, h); ctx.stroke();
  }
  for (let y = ymin; y <= ymax; y += gridSize) {
    const sp = _toScreen(0, y, vx, vy, scale);
    ctx.beginPath(); ctx.moveTo(0, sp.y); ctx.lineTo(w, sp.y); ctx.stroke();
  }

  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  const ox = _toScreen(0, 0, vx, vy, scale);
  ctx.beginPath(); ctx.moveTo(ox.x, 0); ctx.lineTo(ox.x, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, ox.y); ctx.lineTo(w, ox.y); ctx.stroke();
}
