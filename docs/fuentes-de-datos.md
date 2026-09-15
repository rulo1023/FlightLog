# Búsqueda automática: alcance realista

Revisión: 15 de septiembre de 2026. La búsqueda de esta versión lee páginas públicas de Flightera desde la app; una función de Supabase con el mismo propósito está en el repositorio como alternativa, pero la app no la invoca. No es una API oficial: un cambio de página, un bloqueo o la falta de cobertura puede dejar la búsqueda sin resultado. Los datos se presentan como sugerencias y siempre se pueden completar o corregir manualmente.

La ruta, los aeropuertos, los horarios previstos y la distancia solo se aceptan como vuelo concreto cuando coinciden **número de vuelo y día local de salida**. Para horarios reales se consulta el detalle de la página cuando está disponible. Plane Finder puede mostrar modelo y matrícula de algunos vuelos recientes; FlightLog comprueba fecha y aeropuertos antes de usarla. La asignación del avión puede cambiar, y no hay garantía de matrícula para vuelos históricos o futuros.

La clave gratuita de AirLabs que se haya guardado en Supabase no se utiliza actualmente. [AirLabs Flight](https://airlabs.co/docs/flight) documenta una matrícula en su ejemplo, aunque no la marca como campo del plan Free. [AirLabs Routes](https://airlabs.co/docs/routes) describe rutas habituales, que tampoco identifican el avión de una fecha concreta. Un servicio de pago necesitaría aprobación explícita antes de incorporarse.

Asiento, clase y comentarios permanecen manuales. La procedencia de los campos aceptados se guarda en `field_sources`; al corregir un campo se elimina su marca. Más adelante se puede usar el catálogo abierto de [OurAirports](https://ourairports.com/data/) para validar nombres y códigos sin depender de una página de vuelos.
