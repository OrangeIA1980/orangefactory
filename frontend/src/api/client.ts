// Cliente minimo de la API de OrangeFactory.
// En dev Vite proxea /api -> backend:8000 (ver vite.config.ts).
// En prod nginx hace lo mismo apuntando al servicio backend del compose.

import { clearSession, getToken } from "../auth";

const BASE = "/api";

class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    throw new ApiError(401, "Sesion expirada, vuelve a iniciar sesion.");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{
      access_token: string;
      usuario: {
        id: number;
        email: string;
        nombre: string;
        rol: string;
        taller_id: number;
        taller_nombre: string;
      };
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ id: number; email: string; nombre: string; rol: string; taller_id: number; taller_nombre: string }>("/auth/me"),

  listarProyectos: () =>
    request<Array<{ id: number; nombre: string; cliente: string | null; estado: string; creado: string; actualizado: string }>>(
      "/proyectos",
    ),

  crearProyecto: (nombre: string, cliente: string | null) =>
    request<{ id: number; nombre: string; cliente: string | null; estado: string; creado: string; actualizado: string }>(
      "/proyectos",
      {
        method: "POST",
        body: JSON.stringify({ nombre, cliente }),
      },
    ),

  obtenerProyecto: (id: number) =>
    request<{ id: number; nombre: string; cliente: string | null; estado: string; creado: string; actualizado: string }>(
      `/proyectos/${id}`,
    ),

  // --- Archivos (Modo Preparar) ---

  subirArchivo: async (proyectoId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    // No Content-Type — el browser lo pone con boundary
    const res = await fetch(`${BASE}/proyectos/${proyectoId}/archivos`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch {}
      throw new ApiError(res.status, detail);
    }
    return res.json();
  },

  listarArchivos: (proyectoId: number) =>
    request<Array<any>>(`/proyectos/${proyectoId}/archivos`),

  obtenerGeometria: (archivoId: number) =>
    request<any>(`/archivos/${archivoId}/geometria`),

  validarArchivo: (archivoId: number) =>
    request<any>(`/archivos/${archivoId}/validar`, { method: "POST" }),

  repararArchivo: (archivoId: number) =>
    request<any>(`/archivos/${archivoId}/reparar`, { method: "POST" }),

  eliminarArchivo: (archivoId: number) =>
    request<void>(`/archivos/${archivoId}`, { method: "DELETE" }),
};

export { ApiError };
