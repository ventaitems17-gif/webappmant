# WebAppMant: análisis de desempeño de mantenimiento

Aplicación web estática (HTML, CSS y JavaScript, sin servidor ni compilación) que lee datos de un CMMS (SAP PM, Maximo u otro), los depura, calcula indicadores de mantenimiento con gráficas interactivas y exporta un informe PDF con estructura académica.

Todo el procesamiento ocurre en el navegador: ningún archivo sale del equipo del usuario.

## Qué hace

| Sección | Contenido |
|---|---|
| 1. Resumen ejecutivo | Índice IDM-7 (0–100) con escala de madurez de 5 niveles, radar de dimensiones, 12 KPI con semáforo, hallazgos y recomendaciones generados desde los datos |
| 2. Calidad de datos | Índice DQI en cinco dimensiones (completitud, validez, consistencia, unicidad y plausibilidad), reglas lógicas, correcciones automáticas y detección de subregistro |
| 3. Disponibilidad y confiabilidad | Disponibilidad, MTBF, MTTR, reincidencia y Weibull por tipo de equipo (rangos ajustados de Johnson con suspensiones), papel de Weibull y curvas R(t) |
| 4. Análisis de fallas | Pareto de modos y causas (frecuencia, detención o costo), diagrama Jack-knife (Knights, 2001), malos actores, matrices de calor |
| 5. Gestión del trabajo | Mix proactivo y correctivo, trabajo planificado, cumplimiento de plazo, backlog y su antigüedad, HH por puesto |
| 6. Costos | Componentes (repuestos, servicios externos y mano de obra), costo por tipo, por unidad y por equipo |
| 7. Comparación | Mismo modelo y mismas metas aplicados a varios datasets |
| 8. Registros | Tabla depurada con banderas de calidad y descarga en CSV |
| 9. Metodología y metas | Fórmulas, metas, umbrales y pesos editables (se guardan en el navegador), supuestos y referencias |

Los gráficos son dinámicos: tienen filtros por período, unidad, criticidad, tipo de equipo, tipo de mantenimiento y puesto. Además, un clic en barras, puntos o filas aplica un filtro cruzado.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `webappmant`.
2. Sube **el contenido de esta carpeta** a la raíz del repositorio, con `index.html` en la raíz. Incluye el archivo `.nojekyll`.
3. En el repositorio entra a **Settings → Pages**. En *Build and deployment* elige *Deploy from a branch*, la rama `main` y la carpeta `/ (root)`, y guarda.
4. Unos minutos después la app queda disponible en `https://<tu-usuario>.github.io/webappmant/`.

Si prefieres mantener la carpeta `webappmant/` dentro de otro repositorio, la URL será `https://<tu-usuario>.github.io/<repositorio>/webappmant/`.

Al actualizar los archivos JS o CSS, cambia el número de versión `?v=` en `index.html` y en las importaciones de `js/*.js` para que los navegadores no usen copias antiguas.

## Usarla en el computador

Haz doble clic en `ABRIR-APP.bat`. Enciende un servidor local en `http://localhost:5610` y abre el navegador; necesita Python instalado. Si abres `index.html` directamente, el navegador bloquea la lectura de los datasets incluidos, aunque igual puedes cargar un archivo propio.

## Cargar un dataset nuevo

Usa el botón **Cargar dataset** o arrastra el archivo a la ventana. Se aceptan CSV con separador `,`, `;`, tabulación o `|`, además de Excel `.xlsx`. La app reconoce las columnas por su nombre (con o sin tildes, en español o inglés) y muestra una pantalla para confirmar o corregir la asignación.

- **Campos requeridos:** OT, fecha de inicio, equipo y tipo de mantenimiento (o la clase de orden PM01, PM02 o PM03).
- **Campos recomendados:** fecha de creación, fecha de fin, fecha de necesidad, unidad, tipo de equipo, criticidad, puesto de trabajo, planificado, prioridad, modo de falla, causa, estado, horas de detención, HH, costos (repuestos, externo y total), tiempo de espera y tiempo de reparación.
- La plantilla `plantilla/plantilla_dataset_CMMS.csv` muestra el formato esperado.

La depuración es automática y queda documentada en la sección 2:

- quita el apóstrofo de exportación;
- convierte comas decimales y separadores de miles;
- unifica las variantes de escritura de las categorías;
- elimina duplicados;
- infiere la tarifa de mano de obra;
- marca inconsistencias y valores atípicos extremos.

Los datasets cargados quedan guardados en el navegador (IndexedDB) hasta que los quites.

## Modelo IDM-7

Cada indicador se convierte en un puntaje de 0 a 100. Vale 0 en el umbral crítico, 100 al alcanzar la meta, y se interpola linealmente entre ambos; el backlog usa una banda de 2 a 4 semanas. Las dimensiones promedian sus indicadores y el IDM-7 es su promedio ponderado:

| Dimensión | Indicadores | Peso |
|---|---|---|
| Disponibilidad | Disponibilidad operacional | 15 % |
| Confiabilidad | MTBF, reincidencia | 20 % |
| Mantenibilidad | MTTR, tiempo medio de espera | 15 % |
| Estrategia proactiva | % proactivo, % predictivo | 15 % |
| Planificación y control | % planificado, cumplimiento de plazo, backlog | 15 % |
| Eficiencia de costos | % de costo correctivo | 10 % |
| Calidad de datos | Índice DQI | 10 % |

| Nivel | IDM-7 | Interpretación |
|---|---|---|
| 1 Reactivo | < 40 | Se responde a las fallas; predomina el trabajo no planificado |
| 2 En desarrollo | 40 a 55 | Hay planes preventivos, pero la ejecución sigue siendo reactiva |
| 3 Sistemático | 55 a 70 | Plan preventivo establecido y controlado con indicadores |
| 4 Proactivo | 70 a 85 | Predominan las estrategias por condición y el análisis de fallas |
| 5 Excelencia | ≥ 85 | Desempeño de clase mundial sostenido |

Referencias principales: EN 13306:2017, EN 15341:2019, ISO 14224:2016, ISO 55000, ISO 8000-8, SMRP Best Practices, Knights (2001), Abernethy (2006) y Moubray (1997).

## Estructura

```
webappmant/
├── index.html            Interfaz
├── css/app.css           Estilos (tema claro y oscuro, adaptable a celular)
├── js/app.js             Estado, filtros, vistas y eventos
├── js/etl.js             Lectura, mapeo de columnas, depuración y calidad de datos
├── js/kpi.js             Indicadores, Weibull, Jack-knife, modelo IDM-7 y narrativa
├── js/charts.js          Gráficos (Apache ECharts)
├── js/report.js          Informe PDF (jsPDF + AutoTable)
├── js/util.js            Formato es-CL, estadística y fechas
├── data/                 Datasets incluidos (CMMS grupos A–D) y manifest.json
├── plantilla/            Plantilla CSV
├── assets/favicon.svg
├── ABRIR-APP.bat         Servidor local para Windows
└── .nojekyll             Evita el procesamiento Jekyll en GitHub Pages
```

Para agregar otro dataset incluido, copia el CSV en `data/` y añádelo a `data/manifest.json`.

Librerías (CDN jsDelivr, versiones fijas): Apache ECharts 5.5.1, PapaParse 5.4.1, jsPDF 2.5.1, jsPDF-AutoTable 3.8.2 y SheetJS 0.18.5 (esta última solo se carga al abrir un Excel). Tipografía: IBM Plex Sans (Google Fonts).
