import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { clearSession, useAuth } from "../auth";
import { useNavigate } from "react-router-dom";

type Proyecto = {
  id: number;
  nombre: string;
  cliente: string | null;
  estado: string;
  creado: string;
  actualizado: string;
};

const ETAPAS: Record<string, { label: string; badge: string }> = {
  PREPARAR: { label: "Preparar", badge: "bg-blue-950 text-blue-300 border-blue-900" },
  COTIZAR: { label: "Cotizar", badge: "bg-yellow-950 text-yellow-300 border-yellow-900" },
  PRODUCIR: { label: "Producir", badge: "bg-green-950 text-green-300 border-green-900" },
};

export default function Dashboard() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listarProyectos();
      setProyectos(rows);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crearProyecto(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    try {
      await api.crearProyecto(nombre.trim(), cliente.trim() || null);
      setNombre("");
      setCliente("");
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el proyecto");
    }
  }

  function salir() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-900 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-black">O</div>
          <div>
            <div className="font-bold leading-tight">OrangeFactory</div>
            <div className="text-xs text-neutral-500">{usuario?.taller_nombre}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{usuario?.nombre}</div>
            <div className="text-xs text-neutral-500">{usuario?.rol}</div>
          </div>
          <button onClick={salir} className="btn-ghost">
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Proyectos</h1>
        </div>

        <div className="card mb-8">
          <h2 className="font-semibold mb-4">Nuevo proyecto</h2>
          <form onSubmit={crearProyecto} className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
            <input
              className="input"
              placeholder="Nombre del proyecto"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Cliente (opcional)"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
            <button type="submit" className="btn-primary">
              Crear
            </button>
          </form>
        </div>

        {error && (
          <div className="rounded-lg bg-red-950/60 border border-red-900 text-red-300 text-sm px-4 py-3 mb-6">{error}</div>
        )}

        {loading ? (
          <div className="text-neutral-500">Cargando...</div>
        ) : proyectos.length === 0 ? (
          <div className="card text-center text-neutral-500 py-12">
            <p className="mb-1">Todavia no hay proyectos.</p>
            <p className="text-sm">Crea el primero con el formulario de arriba.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {proyectos.map((p) => {
              const etapa = ETAPAS[p.estado] ?? { label: p.estado, badge: "bg-neutral-800 text-neutral-300 border-neutral-700" };
              return (
                <div key={p.id} className="card hover:border-orange-600 transition-colors cursor-pointer"
                     onClick={() => navigate(`/app/proyecto/${p.id}`)}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-lg leading-tight">{p.nombre}</h3>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${etapa.badge}`}>
                      {etapa.label}
                    </span>
                  </div>
                  {p.cliente && <div className="text-sm text-neutral-400 mb-2">Cliente: {p.cliente}</div>}
                  <div className="text-xs text-neutral-600">
                    Actualizado: {new Date(p.actualizado).toLocaleString("es-CL")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
