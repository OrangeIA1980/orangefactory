/**
 * Workspace — Pagina principal del Modo Preparar.
 *
 * Layout:
 * - Header con nombre proyecto y navegacion
 * - Area central: Canvas DXF (el area mas grande)
 * - Panel lateral derecho: info del archivo, problemas, acciones
 * - Zona de upload si no hay archivos
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth, clearSession } from "../auth";
import DxfCanvas from "../components/DxfCanvas";
import EditToolbar from "../components/EditToolbar";

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

type Geometria = {
  archivo_id: number;
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
};

const ESTADO_LABEL: Record<string, { text: string; color: string }> = {
  subido: { text: "Subido", color: "bg-gray-700 text-gray-300" },
  convirtiendo: { text: "Convirtiendo...", color: "bg-yellow-900 text-yellow-300" },
  convertido: { text: "Convertido", color: "bg-blue-900 text-blue-300" },
  validado: { text: "Con problemas", color: "bg-red-900 text-red-300" },
  listo: { text: "Listo", color: "bg-green-900 text-green-300" },
  error: { text: "Error", color: "bg-red-900 text-red-300" },
};

export default function Workspace() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const [proyecto, setProyecto] = useState<any>(null);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [archivoActivo, setArchivoActivo] = useState<Archivo | null>(null);
  const [geometria, setGeometria] = useState<Geometria | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reparando, setReparando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pid = Number(proyectoId);

  // Cargar proyecto y archivos
  const cargar = useCallback(async () => {
    try {
      const [proy, archs] = await Promise.all([
        api.obtenerProyecto(pid),
        api.listarArchivos(pid),
      ]);
      setProyecto(proy);
      setArchivos(archs);
      // Auto-seleccionar el primer archivo si no hay uno activo
      if (archs.length > 0 && !archivoActivo) {
        seleccionarArchivo(archs[0]);
      }
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

  // Seleccionar archivo y cargar geometria
  async function seleccionarArchivo(archivo: Archivo) {
    setArchivoActivo(archivo);
    setSeleccionadas([]);
    if (archivo.estado !== "subido" && archivo.estado !== "error" && archivo.estado !== "convirtiendo") {
      try {
        const geo = await api.obtenerGeometria(archivo.id);
        setGeometria(geo);
      } catch {
        setGeometria(null);
      }
    } else {
      setGeometria(null);
    }
  }

  // Upload
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const nuevo = await api.subirArchivo(pid, file);
        setArchivos((prev) => [nuevo, ...prev]);
        await seleccionarArchivo(nuevo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Reparar
  async function handleReparar() {
    if (!archivoActivo) return;
    setReparando(true);
    setError(null);
    try {
      const result = await api.repararArchivo(archivoActivo.id);
      // Recargar geometria
      const geo = await api.obtenerGeometria(archivoActivo.id);
      setGeometria(geo);
      // Actualizar archivo en la lista
      setArchivos((prev) => prev.map((a) =>
        a.id === archivoActivo.id
          ? { ...a, estado: result.estado, entidades_total: result.entidades_total,
              cerradas: result.cerradas, abiertas: result.abiertas, problemas: { lista: result.problemas, errores_criticos: result.errores_criticos, puede_avanzar: result.puede_avanzar } }
          : a
      ));
      setArchivoActivo((prev) => prev ? { ...prev, estado: result.estado } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reparando");
    } finally {
      setReparando(false);
    }
  }

  // Eliminar
  async function handleEliminar(archivoId: number) {
    try {
      await api.eliminarArchivo(archivoId);
      setArchivos((prev) => prev.filter((a) => a.id !== archivoId));
      if (archivoActivo?.id === archivoId) {
        setArchivoActivo(null);
        setGeometria(null);
        setSeleccionadas([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando");
    }
  }

  // Seleccion con soporte shift (multi)
  function handleSelect(id: number | null, shift?: boolean) {
    if (id === null) {
      if (!shift) setSeleccionadas([]);
      return;
    }
    setSeleccionadas((prev) => {
      if (shift) {
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      }
      return prev.length === 1 && prev[0] === id ? [] : [id];
    });
  }

  // Editar vectores
  async function handleOperar(operacion: string, params: Record<string, any>) {
    if (!archivoActivo || seleccionadas.length === 0) return;
    setEditando(true);
    setError(null);
    try {
      const geo = await api.editarArchivo(archivoActivo.id, operacion, seleccionadas, params);
      setGeometria(geo);
      // Actualizar archivo en la lista con nuevos totales
      setArchivos((prev) => prev.map((a) =>
        a.id === archivoActivo.id
          ? { ...a, entidades_total: geo.total_entidades, longitud_total_mm: geo.longitud_total_mm, ancho_mm: geo.ancho_mm, alto_mm: geo.alto_mm, entidades_cerradas: geo.cerradas, entidades_abiertas: geo.abiertas }
          : a
      ));
      // Si la operacion fue eliminar, limpiar seleccion
      if (operacion === "eliminar") {
        setSeleccionadas([]);
      }
      // Si duplicar o multiplicar, seleccionadas originales siguen validas
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

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between shrink-0">
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{usuario?.nombre}</span>
          <button onClick={salir} className="text-xs text-neutral-500 hover:text-white">Salir</button>
        </div>
      </header>

      {/* Toolbar */}
      {geometria && (
        <EditToolbar
          seleccionadas={seleccionadas}
          totalEntidades={geometria.total_entidades}
          onSelectAll={() => setSeleccionadas(geometria.entidades.map((e: any) => e.id))}
          onSelectNone={() => setSeleccionadas([])}
          onOperar={handleOperar}
          disabled={editando}
        />
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative">
          {geometria ? (
            <DxfCanvas
              entidades={geometria.entidades}
              problemas={geometria.problemas}
              bounds={geometria.bounds}
              jerarquia={geometria.jerarquia}
              seleccionadas={seleccionadas}
              onSelect={handleSelect}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4 opacity-20">+</div>
                <p className="text-neutral-500 mb-4">
                  {archivos.length === 0 ? "Sube un archivo DXF para comenzar" : "Selecciona un archivo para ver"}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-primary"
                  disabled={uploading}
                >
                  {uploading ? "Subiendo..." : "Subir archivo"}
                </button>
              </div>
            </div>
          )}

          {/* Barra de info inferior */}
          {geometria && (
            <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/90 border-t border-neutral-800 px-4 py-2 flex gap-6 text-xs text-neutral-400">
              <span>Entidades: {geometria.total_entidades}</span>
              <span>Cerradas: {geometria.cerradas}</span>
              <span>Abiertas: {geometria.abiertas}</span>
              <span>Dimension: {geometria.ancho_mm.toFixed(1)} x {geometria.alto_mm.toFixed(1)} mm</span>
              <span>Long. total: {(geometria.longitud_total_mm / 1000).toFixed(2)} m</span>
              {seleccionadas.length > 0 && <span className="text-orange-400">{seleccionadas.length} entidad(es) seleccionada(s)</span>}
            </div>
          )}
        </div>

        {/* Panel lateral derecho */}
        <div className="w-80 border-l border-neutral-800 bg-neutral-900 overflow-y-auto shrink-0">
          {/* Boton subir */}
          <div className="p-4 border-b border-neutral-800">
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf,.svg,.ai,.pdf,.eps,.png,.jpg,.jpeg"
              onChange={handleUpload}
              className="hidden"
              multiple
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full btn-primary text-sm"
              disabled={uploading}
            >
              {uploading ? "Subiendo..." : "+ Subir archivo"}
            </button>
          </div>

          {/* Lista de archivos */}
          {archivos.length > 0 && (
            <div className="p-4 border-b border-neutral-800">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Archivos ({archivos.length})</h3>
              <div className="space-y-2">
                {archivos.map((a) => {
                  const est = ESTADO_LABEL[a.estado] || { text: a.estado, color: "bg-neutral-700" };
                  const activo = archivoActivo?.id === a.id;
                  return (
                    <div
                      key={a.id}
                      onClick={() => seleccionarArchivo(a)}
                      className={`p-2 rounded-md cursor-pointer transition-colors ${activo ? "bg-neutral-700 border border-orange-600" : "bg-neutral-800 hover:bg-neutral-750 border border-transparent"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate max-w-[180px]">{a.nombre_original}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEliminar(a.id); }}
                          className="text-neutral-500 hover:text-red-400 text-xs"
                          title="Eliminar"
                        >
                          x
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${est.color}`}>{est.text}</span>
                        <span className="text-xs text-neutral-500">{(a.tamano_bytes / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Panel de problemas */}
          {geometria && geometria.problemas.length > 0 && (
            <div className="p-4 border-b border-neutral-800">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-2">
                Problemas ({geometria.problemas.length})
                {geometria.errores_criticos > 0 && (
                  <span className="ml-2 text-red-400">{geometria.errores_criticos} criticos</span>
                )}
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {geometria.problemas.map((p: any, i: number) => (
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
              </div>

              {/* Boton auto-reparar */}
              {geometria.problemas.some((p: any) => p.reparable) && (
                <button
                  onClick={handleReparar}
                  disabled={reparando}
                  className="w-full mt-3 px-3 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {reparando ? "Reparando..." : "Auto-reparar"}
                </button>
              )}
            </div>
          )}

          {/* Info del archivo activo */}
          {geometria && (
            <div className="p-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Informacion</h3>
              <div className="space-y-1 text-xs text-neutral-400">
                <div className="flex justify-between"><span>Entidades:</span><span className="text-white">{geometria.total_entidades}</span></div>
                <div className="flex justify-between"><span>Cerradas:</span><span className="text-blue-400">{geometria.cerradas}</span></div>
                <div className="flex justify-between"><span>Abiertas:</span><span className="text-red-400">{geometria.abiertas}</span></div>
                <div className="flex justify-between"><span>Ancho:</span><span className="text-white">{geometria.ancho_mm.toFixed(1)} mm</span></div>
                <div className="flex justify-between"><span>Alto:</span><span className="text-white">{geometria.alto_mm.toFixed(1)} mm</span></div>
                <div className="flex justify-between"><span>Long. corte:</span><span className="text-white">{(geometria.longitud_total_mm / 1000).toFixed(2)} m</span></div>
              </div>

              {/* Estado */}
              <div className="mt-4 pt-3 border-t border-neutral-800">
                {geometria.puede_avanzar ? (
                  <div className="text-green-400 text-sm font-medium flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    Listo para Cotizar
                  </div>
                ) : (
                  <div className="text-red-400 text-sm font-medium flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                    Tiene {geometria.errores_criticos} error(es) critico(s)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Errores */}
          {error && (
            <div className="p-4">
              <div className="rounded-md bg-red-950 border border-red-900 text-red-300 text-xs p-3">
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
