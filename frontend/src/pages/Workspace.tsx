/**
 * Workspace — Pagina principal del Modo Preparar.
 *
 * Canvas UNIFICADO: todos los archivos del proyecto se muestran juntos
 * en un solo canvas. El usuario puede mover, escalar, rotar, etc.
 * las piezas de todos los archivos en un solo entorno.
 *
 * Features:
 * - Workspace unificado (todos los archivos combinados)
 * - Drag-to-move entidades
 * - Undo/Redo (Ctrl+Z / Ctrl+Y)
 * - Ventana de seleccion
 * - Dimensiones visibles
 * - Grips en bounding box
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth, clearSession } from "../auth";
import DxfCanvas from "../components/DxfCanvas";
import EditToolbar from "../components/EditToolbar";

type ArchivoInfo = {
  id: number;
  nombre: string;
  estado: string;
  entidad_ids: number[];
};

type WorkspaceData = {
  proyecto_id: number;
  entidades: any[];
  problemas: any[];
  bounds: number[];
  longitud_total_mm: number;
  ancho_mm: number;
  alto_mm: number;
  total_entidades: number;
  cerradas: number;
  abiertas: number;
  errores_criticos: number;
  puede_avanzar: boolean;
  jerarquia: Record<string, string>;
  archivos: ArchivoInfo[];
};

type Archivo = {
  id: number;
  nombre_original: string;
  formato_original: string;
  tamano_bytes: number;
  estado: string;
  entidades_total: number | null;
  longitud_total_mm: number | null;
  ancho_mm: number | null;
  alto_mm: number | null;
  entidades_cerradas: number | null;
  entidades_abiertas: number | null;
  problemas: any;
};

const ESTADO_LABEL: Record<string, { text: string; color: string }> = {
  subido: { text: "Subido", color: "bg-gray-700 text-gray-300" },
  convirtiendo: { text: "Convirtiendo...", color: "bg-yellow-900 text-yellow-300" },
  convertido: { text: "Convertido", color: "bg-blue-900 text-blue-300" },
  validado: { text: "Con problemas", color: "bg-red-900 text-red-300" },
  listo: { text: "Listo", color: "bg-green-900 text-green-300" },
  error: { text: "Error", color: "bg-red-900 text-red-300" },
};

// Undo/Redo history
type HistoryEntry = {
  workspace: WorkspaceData;
  seleccionadas: number[];
};

const MAX_HISTORY = 50;

export default function Workspace() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const [proyecto, setProyecto] = useState<any>(null);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"archivos" | "propiedades" | "problemas">("archivos");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pid = Number(proyectoId);

  function pushHistory(ws: WorkspaceData, sel: number[]) {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ workspace: ws, seleccionadas: sel });
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }

  function undo() {
    if (historyIndex <= 0) return;
    const entry = history[historyIndex - 1];
    if (entry) {
      setWorkspace(entry.workspace);
      setSeleccionadas(entry.seleccionadas);
      setHistoryIndex(prev => prev - 1);
    }
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const entry = history[historyIndex + 1];
    if (entry) {
      setWorkspace(entry.workspace);
      setSeleccionadas(entry.seleccionadas);
      setHistoryIndex(prev => prev + 1);
    }
  }

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Delete key
      if (e.key === "Delete" && seleccionadas.length > 0) {
        e.preventDefault();
        handleOperar("eliminar", {});
      }
      // Arrow keys
      if (seleccionadas.length > 0 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        if (e.key === "ArrowUp") dy = step;
        if (e.key === "ArrowDown") dy = -step;
        handleOperar("mover", { dx, dy });
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [historyIndex, history, seleccionadas]);

  // Cargar proyecto, archivos y workspace
  const cargar = useCallback(async () => {
    try {
      const [proy, archs, ws] = await Promise.all([
        api.obtenerProyecto(pid),
        api.listarArchivos(pid),
        api.obtenerWorkspace(pid),
      ]);
      setProyecto(proy);
      setArchivos(archs);
      setWorkspace(ws);
      setSeleccionadas([]);
      // Init history
      setHistory([{ workspace: ws, seleccionadas: [] }]);
      setHistoryIndex(0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Error cargando proyecto");
    }
  }, [pid]);

  useEffect(() => { cargar(); }, [cargar]);

  // Upload
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await api.subirArchivo(pid, file);
      }
      // Recargar todo
      const [archs, ws] = await Promise.all([
        api.listarArchivos(pid),
        api.obtenerWorkspace(pid),
      ]);
      setArchivos(archs);
      setWorkspace(ws);
      pushHistory(ws, []);
      setSeleccionadas([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Eliminar archivo
  async function handleEliminarArchivo(archivoId: number) {
    try {
      await api.eliminarArchivo(archivoId);
      const [archs, ws] = await Promise.all([
        api.listarArchivos(pid),
        api.obtenerWorkspace(pid),
      ]);
      setArchivos(archs);
      setWorkspace(ws);
      pushHistory(ws, []);
      setSeleccionadas([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando");
    }
  }

  // Reparar archivo
  async function handleReparar(archivoId: number) {
    try {
      await api.repararArchivo(archivoId);
      const [archs, ws] = await Promise.all([
        api.listarArchivos(pid),
        api.obtenerWorkspace(pid),
      ]);
      setArchivos(archs);
      setWorkspace(ws);
      pushHistory(ws, seleccionadas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reparando");
    }
  }

  // Seleccion
  function handleSelect(id: number | null, shift?: boolean) {
    if (id === null) {
      if (!shift) setSeleccionadas([]);
      return;
    }
    setSeleccionadas(prev => {
      if (shift) {
        return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      }
      return prev.length === 1 && prev[0] === id ? [] : [id];
    });
  }

  function handleWindowSelect(ids: number[]) {
    setSeleccionadas(ids);
  }

  // Drag-to-move
  async function handleDragMove(ids: number[], dx: number, dy: number) {
    if (!workspace) return;
    setEditando(true);
    setError(null);
    try {
      const ws = await api.editarWorkspace(pid, "mover", ids, { dx, dy });
      setWorkspace(ws);
      pushHistory(ws, seleccionadas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error moviendo");
    } finally {
      setEditando(false);
    }
  }

  // Editar vectores (toolbar)
  async function handleOperar(operacion: string, params: Record<string, any>) {
    if (!workspace || seleccionadas.length === 0) return;
    setEditando(true);
    setError(null);
    try {
      const ws = await api.editarWorkspace(pid, operacion, seleccionadas, params);
      setWorkspace(ws);
      if (operacion === "eliminar") {
        pushHistory(ws, []);
        setSeleccionadas([]);
      } else {
        pushHistory(ws, seleccionadas);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error editando");
    } finally {
      setEditando(false);
    }
  }

  function salir() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const hasEntidades = workspace && workspace.total_entidades > 0;

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/app")} className="text-neutral-400 hover:text-white transition-colors" title="Volver a proyectos">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="w-7 h-7 rounded-md bg-orange-600 flex items-center justify-center font-black text-sm">O</div>
          <div>
            <div className="font-semibold text-sm leading-tight">{proyecto?.nombre || "..."}</div>
            <div className="text-xs text-neutral-500">{proyecto?.cliente || "Sin cliente"} — Modo Preparar</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Undo/Redo buttons */}
          <div className="flex items-center gap-1">
            <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30" title="Deshacer (Ctrl+Z)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h8a3 3 0 010 6H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 5L2 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30" title="Rehacer (Ctrl+Y)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 8H5a3 3 0 000 6h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <span className="text-xs text-neutral-500">{usuario?.nombre}</span>
          <button onClick={salir} className="text-xs text-neutral-500 hover:text-white">Salir</button>
        </div>
      </header>

      {/* Toolbar */}
      {hasEntidades && (
        <EditToolbar
          seleccionadas={seleccionadas}
          totalEntidades={workspace!.total_entidades}
          onSelectAll={() => setSeleccionadas(workspace!.entidades.map((e: any) => e.id))}
          onSelectNone={() => setSeleccionadas([])}
          onOperar={handleOperar}
          disabled={editando}
        />
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative">
          {hasEntidades ? (
            <DxfCanvas
              entidades={workspace!.entidades}
              problemas={workspace!.problemas}
              bounds={workspace!.bounds}
              jerarquia={workspace!.jerarquia}
              seleccionadas={seleccionadas}
              onSelect={handleSelect}
              onWindowSelect={handleWindowSelect}
              onDragMove={handleDragMove}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4 opacity-20">+</div>
                <p className="text-neutral-500 mb-4">
                  {archivos.length === 0 ? "Sube archivos DXF o AI para comenzar" : "Procesando archivos..."}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium"
                  disabled={uploading}
                >
                  {uploading ? "Subiendo..." : "Subir archivos"}
                </button>
              </div>
            </div>
          )}

          {/* Barra de estado inferior */}
          {workspace && (
            <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/90 border-t border-neutral-800 px-4 py-2 flex gap-6 text-xs text-neutral-400">
              <span>Entidades: {workspace.total_entidades}</span>
              <span>Cerradas: {workspace.cerradas}</span>
              <span>Abiertas: {workspace.abiertas}</span>
              <span>Dimension: {workspace.ancho_mm.toFixed(1)} x {workspace.alto_mm.toFixed(1)} mm</span>
              <span>Long. corte: {(workspace.longitud_total_mm / 1000).toFixed(2)} m</span>
              {seleccionadas.length > 0 && <span className="text-orange-400">{seleccionadas.length} seleccionada(s)</span>}
              <span className="ml-auto text-neutral-600">{archivos.length} archivo(s)</span>
            </div>
          )}

        </div>

        {/* Panel lateral derecho con tabs */}
        <div className="w-72 border-l border-neutral-800 bg-neutral-900 flex flex-col shrink-0">
          {/* Upload button */}
          <div className="p-3 border-b border-neutral-800">
            <input ref={fileInputRef} type="file" accept=".dxf,.ai,.svg,.pdf,.eps" onChange={handleUpload} className="hidden" multiple />
            <button onClick={() => fileInputRef.current?.click()} className="w-full px-3 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium" disabled={uploading}>
              {uploading ? "Subiendo..." : "+ Subir archivos"}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-neutral-800">
            {(["archivos", "propiedades", "problemas"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${activeTab === tab ? "text-orange-400 border-b-2 border-orange-400" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {tab}{tab === "problemas" && workspace && workspace.errores_criticos > 0 ? ` (${workspace.errores_criticos})` : ""}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Archivos tab */}
            {activeTab === "archivos" && (
              <div className="space-y-2">
                {archivos.length === 0 && (
                  <p className="text-xs text-neutral-500 text-center py-4">Sin archivos</p>
                )}
                {archivos.map(a => {
                  const est = ESTADO_LABEL[a.estado] || { text: a.estado, color: "bg-neutral-700" };
                  return (
                    <div key={a.id} className="p-2 rounded-md bg-neutral-800 border border-neutral-700">
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate max-w-[160px]">{a.nombre_original}</span>
                        <button onClick={() => handleEliminarArchivo(a.id)} className="text-neutral-500 hover:text-red-400 text-xs" title="Eliminar">✕</button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${est.color}`}>{est.text}</span>
                        <span className="text-xs text-neutral-500">{(a.tamano_bytes / 1024).toFixed(0)} KB</span>
                        {a.entidades_total && <span className="text-xs text-neutral-500">{a.entidades_total} ent.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Propiedades tab */}
            {activeTab === "propiedades" && workspace && (
              <div className="space-y-3">
                <div className="space-y-1 text-xs text-neutral-400">
                  <div className="flex justify-between"><span>Entidades:</span><span className="text-white">{workspace.total_entidades}</span></div>
                  <div className="flex justify-between"><span>Cerradas:</span><span className="text-blue-400">{workspace.cerradas}</span></div>
                  <div className="flex justify-between"><span>Abiertas:</span><span className="text-red-400">{workspace.abiertas}</span></div>
                  <div className="flex justify-between"><span>Ancho total:</span><span className="text-white">{workspace.ancho_mm.toFixed(1)} mm</span></div>
                  <div className="flex justify-between"><span>Alto total:</span><span className="text-white">{workspace.alto_mm.toFixed(1)} mm</span></div>
                  <div className="flex justify-between"><span>Long. corte:</span><span className="text-white">{(workspace.longitud_total_mm / 1000).toFixed(2)} m</span></div>
                  <div className="flex justify-between"><span>Archivos:</span><span className="text-white">{workspace.archivos.length}</span></div>
                </div>

                {/* Seleccion info */}
                {seleccionadas.length > 0 && (
                  <div className="pt-3 border-t border-neutral-800">
                    <h4 className="text-xs font-semibold text-orange-400 mb-1">Seleccion ({seleccionadas.length})</h4>
                    {(() => {
                      const selEnts = workspace.entidades.filter((e: any) => seleccionadas.includes(e.id));
                      const allPts: number[][] = [];
                      selEnts.forEach((e: any) => allPts.push(...e.puntos));
                      if (allPts.length === 0) return null;
                      const xs = allPts.map(p => p[0]);
                      const ys = allPts.map(p => p[1]);
                      const w = Math.max(...xs) - Math.min(...xs);
                      const h = Math.max(...ys) - Math.min(...ys);
                      const len = selEnts.reduce((s: number, e: any) => s + (e.longitud || 0), 0);
                      return (
                        <div className="space-y-1 text-xs text-neutral-400">
                          <div className="flex justify-between"><span>Ancho:</span><span className="text-orange-300">{w.toFixed(1)} mm</span></div>
                          <div className="flex justify-between"><span>Alto:</span><span className="text-orange-300">{h.toFixed(1)} mm</span></div>
                          <div className="flex justify-between"><span>Long.:</span><span className="text-orange-300">{(len / 1000).toFixed(2)} m</span></div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Estado */}
                <div className="pt-3 border-t border-neutral-800">
                  {workspace.puede_avanzar ? (
                    <div className="text-green-400 text-sm font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                      Listo para Cotizar
                    </div>
                  ) : (
                    <div className="text-red-400 text-sm font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                      {workspace.errores_criticos} error(es) critico(s)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Problemas tab */}
            {activeTab === "problemas" && workspace && (
              <div className="space-y-2">
                {workspace.problemas.length === 0 && (
                  <p className="text-xs text-neutral-500 text-center py-4">Sin problemas detectados</p>
                )}
                {workspace.problemas.map((p: any, i: number) => (
                  <div
                    key={i}
                    className={`p-2 rounded text-xs cursor-pointer hover:bg-neutral-700 ${
                      p.severidad === "critico" ? "bg-red-950/50 border border-red-900" : "bg-yellow-950/50 border border-yellow-900"
                    }`}
                    onClick={() => setSeleccionadas([p.entidad_id])}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.severidad === "critico" ? "bg-red-500" : "bg-yellow-500"}`} />
                      <span>{p.descripcion}</span>
                    </div>
                  </div>
                ))}

                {/* Auto-reparar por archivo */}
                {workspace.problemas.some((p: any) => p.reparable) && archivos.length > 0 && (
                  <button
                    onClick={() => {
                      // Reparar todos los archivos que tengan problemas
                      archivos.forEach(a => {
                        if (a.estado === "validado") handleReparar(a.id);
                      });
                    }}
                    className="w-full mt-2 px-3 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium"
                  >
                    Auto-reparar todo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Errores */}
          {error && (
            <div className="p-3 border-t border-neutral-800">
              <div className="rounded-md bg-red-950 border border-red-900 text-red-300 text-xs p-2">
                {error}
                <button onClick={() => setError(null)} className="ml-2 underline">cerrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
