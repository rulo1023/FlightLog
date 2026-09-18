# Búsqueda automática: alcance realista

Revisión: 17 de septiembre de 2026. La aplicación envía el número y la fecha a la función autenticada `flight-lookup` de Supabase. La clave de AirLabs vive únicamente en los secretos de esa función y nunca se incluye en la aplicación.

Para vuelos futuros, la función consulta primero la base de rutas de AirLabs. Esta fuente permite recuperar ruta, días habituales, horas, duración y el último tipo de avión conocido. Una coincidencia de ruta se presenta expresamente como **horario habitual**: no confirma que la aerolínea mantenga ese vuelo en la fecha elegida ni que asigne ese modelo. El usuario siempre puede corregir o completar los campos.

Para vuelos ya realizados se intenta obtener una coincidencia exacta de fecha en la página pública de Flightera. Después de elegir un resultado, una vista web invisible puede completar horas reales, modelo o matrícula si Flightera los muestra en esa página. Flightera no ofrece una API pública para este uso y puede cambiar su web o bloquear una consulta; por eso nunca es la única vía para guardar un vuelo.

[AirLabs Flight](https://www.airlabs.co/docs/flight) devuelve el vuelo más próximo al número consultado y puede incluir matrícula y modelo. [AirLabs Routes](https://airlabs.co/docs/routes) está pensada para rutas y horarios lejanos; su campo de aeronave representa el último tipo usado, no una asignación confirmada. El tipo ICAO está documentado para el plan gratuito, mientras que la disponibilidad de la matrícula depende de la cobertura y del vuelo. Una matrícula futura casi nunca está asignada con suficiente antelación.

Plane Finder se mantiene como fuente complementaria para modelo y matrícula de algunos vuelos recientes. La app comprueba número, fecha y aeropuertos antes de aceptar esos datos. Asiento, clase y comentarios permanecen manuales. La procedencia de cada dato automático se guarda en `field_sources`; al corregirlo manualmente se elimina su marca.
