"""Servicio de conversion de archivos vectoriales a DXF.

Usa Inkscape headless para convertir .ai, .svg, .pdf, .eps -> .dxf
"""
import logging
import subprocess
import os
from pathlib import Path

logger = logging.getLogger(__name__)


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

    # Verify source exists
    if not os.path.exists(ruta_origen):
        logger.error("Archivo origen no existe: %s", ruta_origen)
        return False

    if os.path.getsize(ruta_origen) == 0:
        logger.error("Archivo origen esta vacio: %s", ruta_origen)
        return False

    # Ensure destination directory exists
    dest_dir = os.path.dirname(ruta_destino)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)

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
            timeout=120,
        )

        if result.returncode != 0:
            logger.error(
                "Inkscape retorno codigo %d para %s.\nstdout: %s\nstderr: %s",
                result.returncode, ruta_origen,
                result.stdout[:500] if result.stdout else "",
                result.stderr[:500] if result.stderr else "",
            )

        if os.path.exists(ruta_destino) and os.path.getsize(ruta_destino) > 0:
            logger.info("Conversion exitosa: %s -> %s", ruta_origen, ruta_destino)
            return True

        logger.error(
            "Conversion fallo (archivo destino no generado): %s -> %s\nstderr: %s",
            ruta_origen, ruta_destino,
            result.stderr[:500] if result.stderr else "sin stderr",
        )
        return False

    except subprocess.TimeoutExpired:
        logger.error("Timeout convirtiendo %s (>120s)", ruta_origen)
        return False
    except FileNotFoundError:
        logger.error("Inkscape no encontrado en PATH. Instalar con: apt-get install inkscape")
        return False
    except Exception as e:
        logger.error("Error inesperado convirtiendo %s: %s", ruta_origen, e)
        return False
