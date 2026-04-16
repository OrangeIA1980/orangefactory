import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { setSession } from "../auth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setSession(res.access_token, res.usuario);
      navigate("/app", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center font-black">O</div>
          <span className="font-bold text-xl">OrangeFactory</span>
        </Link>

        <div className="card">
          <h1 className="text-2xl font-bold mb-1">Iniciar sesion</h1>
          <p className="text-neutral-400 text-sm mb-6">Ingresa a tu taller.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@taller.cl"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Contrasena
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-950/60 border border-red-900 text-red-300 text-sm px-4 py-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-neutral-600 mt-6">
          Problemas para entrar? Avisa a tu administrador de taller.
        </p>
      </div>
    </div>
  );
}
