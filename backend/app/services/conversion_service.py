"""Servicio de conversion de archivos vectoriales a DXF.

Usa Inkscape headless para convertir .ai, .svg, .pdf, .eps -> .dxf
"""
import subprocess
import os
from pathlib import Path


def convertir_a_dxf(ruta_origen: str, ruta_destino: str) -> bool:
    """Convierte un archivo vectorial a DXF usando Inkscape.

    Args:
        ruta_origen: Path al archivo .ai/.svg/.pdf/.eps
        ruta_destino: Path donde guardar el .dxf resultante

    Returns:
        True si la conversion fue exitosa
    """
    ruta_origen = str(ruta_origen)
    ruta_destino = str(ruta_destino)

    # Inkscape can export to DXF directly
    try:
        result = subprocess.run(
            [
                "inkscape",
                ruta_origen,
                "--export-type=dxf",
                f"--export-filename={ruta_destino}",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return os.path.exists(ruta_destino) and os.path.getsize(ruta_destino) > 0
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"Error convirtiendo {ruta_origen}: {e}")
        return False
