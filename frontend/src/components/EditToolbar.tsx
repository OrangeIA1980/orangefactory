/**
 * EditToolbar — Barra de herramientas de edicion de vectores.
 *
 * Se muestra debajo del header cuando hay geometria cargada.
 * Cada boton ejecuta una operacion sobre las entidades seleccionadas.
 * Operaciones que necesitan parametros abren un mini-modal inline.
 */
import { useState } from "react";

type Props = {
  seleccionadas: number[];
  totalEntidades: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onOperar: (operacion: string, params: Record<string, any>) => Promise<void>;
  disabled?: boolean;
};

type ModalState = {
  operacion: string;
  titulo: string;
  campos: { key: string; label: string; tipo: "number"; default: number }[];
} | null;

const MODALES: Record<string, { titulo: string; campos: { key: string; label: string; tipo: "number"; default: number }[] }> = {
  mover: {
    titulo: "Mover",
    campos: [
      { key: "dx", label: "X (mm)", tipo: "number", default: 0 },
      { key: "dy", label: "Y (mm)", tipo: "number", default: 0 },
    ],
  },
  escalar: {
    titulo: "Escalar %",
    campos: [
      { key: "factor", label: "Factor (ej: 1.5 = 150%)", tipo: "number", default: 1 },
    ],
  },
  escalar_medida: {
    titulo: "Escalar a medida",
    campos: [
      { key: "ancho", label: "Ancho (mm, 0=auto)", tipo: "number", default: 0 },
      { key: "alto", label: "Alto (mm, 0=auto)", tipo: "number", default: 0 },
    ],
  },
  rotar: {
    titulo: "Rotar",
    campos: [
      { key: "angulo", label: "Angulo (grados, + = CCW)", tipo: "number", default: 90 },
    ],
  },
  duplicar: {
    titulo: "Duplicar",
    campos: [
      { key: "dx", label: "Offset X (mm)", tipo: "number", default: 10 },
      { key: "dy", label: "Offset Y (mm)", tipo: "number", default: 10 },
    ],
  },
  multiplicar: {
    titulo: "Multiplicar en grilla",
    campos: [
      { key: "filas", label: "Filas", tipo: "number", default: 2 },
      { key: "columnas", label: "Columnas", tipo: "number", default: 2 },
      { key: "dx", label: "Espacio X (mm)", tipo: "number", default: 50 },
      { key: "dy", label: "Espacio Y (mm)", tipo: "number", default: 50 },
    ],
  },
};

export default function EditToolbar({ seleccionadas, totalEntidades, onSelectAll, onSelectNone, onOperar, disabled }: Props) {
  const [modal, setModal] = useState<ModalState>(null);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const haySel = seleccionadas.length > 0;

  function abrirModal(operacion: string) {
    const m = MODALES[operacion];
    if (m) {
      const defaults: Record<string, number> = {};
      m.campos.forEach((c) => (defaults[c.key] = c.default));
      setValores(defaults);
      setModal({ operacion, ...m });
    }
  }

  async function ejecutarDirecto(operacion: string) {
    setLoading(true);
    try {
      await onOperar(operacion, {});
    } finally {
      setLoading(false);
    }
  }

  async function ejecutarModal() {
    if (!modal) return;
    setLoading(true);
    try {
      // Limpiar ceros de escalar_medida
      const params = { ...valores };
      if (modal.operacion === "escalar_medida") {
        if (params.ancho === 0) delete params.ancho;
        if (params.alto === 0) delete params.alto;
      }
      await onOperar(modal.operacion, params);
      setModal(null);
    } finally {
      setLoading(false);
    }
  }

  const btnBase = "px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
  const btnTool = `${btnBase} bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200`;
  const btnDanger = `${btnBase} bg-red-900/60 hover:bg-red-800 border border-red-800 text-red-300`;
  const btnAccent = `${btnBase} bg-orange-600 hover:bg-orange-500 text-white`;

  return (
    <div className="border-b border-neutral-800 bg-neutral-900/80 px-4 py-2 flex items-center gap-1.5 flex-wrap shrink-0">
      {/* Seleccion */}
      <div className="flex items-center gap-1 mr-2 border-r border-neutral-700 pr-3">
        <button onClick={onSelectAll} className={btnTool} title="Seleccionar todo">
          <span className="text-xs">Sel. todo</span>
        </button>
        <button onClick={onSelectNone} className={btnTool} disabled={!haySel} title="Deseleccionar">
          <span className="text-xs">Ninguna</span>
        </button>
        <span className="text-xs text-neutral-500 ml-1">
          {seleccionadas.length}/{totalEntidades}
        </span>
      </div>

      {/* Transformaciones */}
      <button onClick={() => abrirModal("mover")} disabled={!haySel || disabled} className={btnTool} title="Mover">
        Mover
      </button>
      <button onClick={() => abrirModal("escalar")} disabled={!haySel || disabled} className={btnTool} title="Escalar %">
        Escalar
      </button>
      <button onClick={() => abrirModal("escalar_medida")} disabled={!haySel || disabled} className={btnTool} title="Escalar a medida">
        A medida
      </button>
      <button onClick={() => abrirModal("rotar")} disabled={!haySel || disabled} className={btnTool} title="Rotar">
        Rotar
      </button>

      <div className="w-px h-5 bg-neutral-700 mx-1" />

      {/* Espejos */}
      <button onClick={() => ejecutarDirecto("espejar_h")} disabled={!haySel || disabled} className={btnTool} title="Espejar horizontal">
        Espejar H
      </button>
      <button onClick={() => ejecutarDirecto("espejar_v")} disabled={!haySel || disabled} className={btnTool} title="Espejar vertical">
        Espejar V
      </button>

      <div className="w-px h-5 bg-neutral-700 mx-1" />

      {/* Copiar */}
      <button onClick={() => abrirModal("duplicar")} disabled={!haySel || disabled} className={btnTool} title="Duplicar">
        Duplicar
      </button>
      <button onClick={() => abrirModal("multiplicar")} disabled={!haySel || disabled} className={btnTool} title="Multiplicar en grilla">
        Multiplicar
      </button>

      <div className="w-px h-5 bg-neutral-700 mx-1" />

      {/* Utilidades */}
      <button onClick={() => ejecutarDirecto("mover_origen")} disabled={!haySel || disabled} className={btnTool} title="Mover al origen (0,0)">
        Origen
      </button>
      <button onClick={() => ejecutarDirecto("cerrar")} disabled={seleccionadas.length !== 1 || disabled} className={btnTool} title="Cerrar polilinea abierta">
        Cerrar
      </button>

      <div className="w-px h-5 bg-neutral-700 mx-1" />

      {/* Eliminar */}
      <button onClick={() => ejecutarDirecto("eliminar")} disabled={!haySel || disabled} className={btnDanger} title="Eliminar seleccionadas">
        Eliminar
      </button>

      {/* Mini-modal de parametros */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setModal(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">{modal.titulo}</h3>
            <div className="space-y-3">
              {modal.campos.map((c) => (
                <div key={c.key}>
                  <label className="text-xs text-neutral-400 block mb-1">{c.label}</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-orange-500"
                    value={valores[c.key] ?? c.default}
                    onChange={(e) => setValores((v) => ({ ...v, [c.key]: parseFloat(e.target.value) || 0 }))}
                    autoFocus={c === modal.campos[0]}
                    onKeyDown={(e) => { if (e.key === "Enter") ejecutarModal(); }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModal(null)} className={btnTool + " flex-1"}>Cancelar</button>
              <button onClick={ejecutarModal} disabled={loading} className={btnAccent + " flex-1"}>
                {loading ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
