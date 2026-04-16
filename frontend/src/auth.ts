// Gestion minima de sesion en memoria.
// Deliberadamente NO usamos localStorage: cada recarga obliga a relogin en fase alpha,
// lo cual es aceptable mientras somos 2 usuarios (Gonzalo y Monica) y da seguridad extra.
// Cuando tengamos mas usuarios se migrara a httpOnly cookies.

import { useSyncExternalStore } from "react";

type Usuario = {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  taller_id: number;
  taller_nombre: string;
};

type AuthState = {
  token: string | null;
  usuario: Usuario | null;
};

let state: AuthState = { token: null, usuario: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setSession(token: string, usuario: Usuario) {
  state = { token, usuario };
  emit();
}

export function clearSession() {
  state = { token: null, usuario: null };
  emit();
}

export function getToken(): string | null {
  return state.token;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}
