# Central de Deudores · BCRA

Sitio estático para consultar, por CUIT/CUIL/CDI, las **deudas** y los **cheques rechazados**
informados al Banco Central de la República Argentina.

**Sitio:** https://gariglioalejo.github.io/deudores/

## Qué muestra

- **Denominación** y número consultado.
- **Deuda total** del último período y **situación crediticia** (1 a 6) de cada entidad.
- **Días de atraso**, monto y observaciones (refinanciación, proceso judicial, revisión, etc.).
- **Cheques rechazados** agrupados por causal, con entidad, número, monto, fecha y estado de la multa.
- Enlace directo a una consulta: `?cuit=30500010912`.

## Fuente de datos

| Dato | Detalle |
| --- | --- |
| Deudas | `GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{cuit}` |
| Cheques rechazados | `GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/{cuit}` |
| Nombres de entidades | `GET https://api.bcra.gob.ar/cheques/v1.0/entidades` |
| Autenticación | No requerida (según el manual del BCRA) |
| Formato | JSON (`text/plain`) |

La consulta se hace **directo desde el navegador**: el sitio no tiene backend ni guarda las
búsquedas. Los montos están expresados en pesos argentinos y corresponden a la información
remitida por las entidades al BCRA. La API responde `Access-Control-Allow-Origin: *`, así que
no hace falta ningún proxy.

Si el navegador no puede acceder a la API (por una caída del servicio o por una red que la
bloquee), el sitio muestra un mensaje de error con la opción de reintentar.

## Estructura

```
index.html      estructura y textos
styles.css      estilos (claro, responsive, sin dependencias)
app.js          consulta a la API, formateo y render
robots.txt      pide a los buscadores que no indexen el sitio
.nojekyll       evita el procesado Jekyll en GitHub Pages
scripts/deploy_github.py  publica en GitHub usando la API REST (sin git ni gh)
```

## Desarrollo local

```bash
python3 -m http.server 8080
# http://localhost:8080
```

## Publicación

El sitio se publica con **GitHub Pages** desde la rama `main` (raíz del repositorio).

```bash
GITHUB_TOKEN=<token> python3 scripts/deploy_github.py deudores
```

El token (PAT clásico) necesita los scopes `repo` y `workflow`. El script crea el repositorio
si no existe, sube los archivos en un commit, habilita Pages y espera la compilación.

## Situaciones

| Código | Significado |
| --- | --- |
| 1 | Normal |
| 2 | Riesgo bajo |
| 3 | Riesgo medio |
| 4 | Riesgo alto |
| 5 | Irrecuperable |
| 6 | Irrecuperable por disposición técnica |

## Descargo

Sitio **no oficial**. Los datos provienen de la API pública del BCRA, pueden tener demoras o
modificaciones sin aviso y no constituyen asesoramiento financiero. La difusión de la Central
de Deudores no implica conformidad por parte del BCRA.
