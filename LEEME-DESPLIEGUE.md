# Carpeta lista para subir por FTP a Hostinger (Fase 7)

Contenido de esta carpeta = exactamente lo que necesita el servidor Node en
producción. No incluye: Electron, datos reales, el .env real, ni el código
fuente sin compilar de web/.

## Pasos en Hostinger

1. Sube todo el CONTENIDO de esta carpeta (no la carpeta "deploy" en sí) a la
   raíz de tu Web App Node.js por FTP.
2. En hPanel, en el gestor de Web Apps Node.js:
   - Fichero de arranque: server/server.js
   - Pulsa "Run NPM Install" (instala better-sqlite3, express, etc. en el
     servidor; no se suben node_modules ni package-lock.json, se genera ahí mismo).
   - Variables de entorno (nunca en un fichero subido):
     - ANTHROPIC_API_KEY = tu clave real
     - RCP_DATA_DIR = la ruta persistente que te indique Hostinger (fuera de
       la carpeta pública de la app)
     - RCP_TRUST_PROXY = 1
     - RCP_COOKIE_SECURE = 1
     - PORT = el que te indique el propio panel (normalmente ya lo define él)
3. Copia tu data.sqlite real (ver Fase 7, paso 3 del plan) a RCP_DATA_DIR
   ANTES del primer arranque, y ejecuta scripts/verify-migration.js contra
   esa copia antes de dar el despliegue por bueno.
4. Reinicia la Web App desde hPanel.

Ver plan.md (Fase 7) para el resto de pasos (hardening ya aplicado en el
código, migración de datos, validación final).
