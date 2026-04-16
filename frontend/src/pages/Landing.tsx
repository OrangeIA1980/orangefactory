import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between border-b border-neutral-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-black">O</div>
          <span className="font-bold text-lg">OrangeFactory</span>
        </div>
        <Link to="/login" className="btn-ghost">
          Iniciar sesion
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-3xl text-center">
          <p className="text-orange-500 font-semibold uppercase tracking-wider text-sm mb-4">El software que corre tu fabrica.</p>
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
            De archivo del cliente a corte en Mach3,
            <br />
            <span className="text-orange-500">sin perder el hilo.</span>
          </h1>
          <p className="text-neutral-400 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
            Preparar, cotizar y producir: los tres modos de tu taller CNC en una sola aplicacion web. Sin instaladores,
            sin archivos perdidos, sin pasos manuales olvidados.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <Link to="/login" className="btn-primary">
              Entrar a la app
            </Link>
            <a href="#modos" className="btn-ghost">
              Como funciona
            </a>
          </div>

          <div id="modos" className="grid md:grid-cols-3 gap-4 text-left">
            <div className="card">
              <div className="text-orange-500 font-bold mb-1">Modo 1</div>
              <div className="font-semibold text-lg mb-2">Preparar</div>
              <p className="text-sm text-neutral-400">
                Recibe el archivo del cliente en cualquier formato, conviertelo a DXF, limpia y repara.
              </p>
            </div>
            <div className="card">
              <div className="text-orange-500 font-bold mb-1">Modo 2</div>
              <div className="font-semibold text-lg mb-2">Cotizar</div>
              <p className="text-sm text-neutral-400">
                Cubica en el material, estima tiempo de corte y entrega el presupuesto al cliente.
              </p>
            </div>
            <div className="card">
              <div className="text-orange-500 font-bold mb-1">Modo 3</div>
              <div className="font-semibold text-lg mb-2">Producir</div>
              <p className="text-sm text-neutral-400">
                Al aprobar, genera la ruta de corte ordenada y el G-code listo para Mach3.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 text-center text-sm text-neutral-600 border-t border-neutral-900">
        OrangeFactory &copy; {new Date().getFullYear()} &middot; Hecho en Chile por Orange Fabrica Digital.
      </footer>
    </div>
  );
}
