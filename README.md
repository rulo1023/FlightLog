# FlightLog

Diario personal de vuelos para Android. Incluye registro e inicio de sesión, alta rápida desde el botón central, navegación horizontal entre secciones, búsqueda de datos, ficha visual del vuelo, mapa personalizado de cada ruta, mapa global interactivo, catálogo local de aeropuertos, edición manual protegida, ordenación, identidad visual de aerolíneas y aviones, resumen del historial, sección de aeronaves y modo noche. Cada usuario ve solo sus vuelos.

Los mapas se dibujan dentro de la aplicación con las coordenadas del catálogo local y costas simplificadas de Natural Earth. No descargan teselas, no envían el historial a un proveedor cartográfico y siguen disponibles sin conexión una vez cargados los vuelos. El mapa global encuadra las regiones visitadas, permite ampliar hasta el nivel regional y muestra progresivamente los puntos, códigos y nombres de los aeropuertos. Una ruta solo aparece cuando sus dos códigos de aeropuerto existen en el catálogo.

La sección Aviones agrupa los vuelos por familia de modelo y permite abrir una galería con cada matrícula diferente utilizada. Las portadas rotan entre las matrículas que tienen fotografía; dentro de una galería aparecen primero los aviones con foto, ordenados por número de vuelos. Las fichas de ruta reúnen la primera y última fecha, las aerolíneas, los vuelos guardados y los aviones identificados. Ambas galerías buscan una miniatura pública por matrícula primero en Planespotters.net y después en Wikimedia Commons. La imagen conserva autor, fuente, licencia disponible y enlace a la publicación original. No se guarda en Supabase ni se garantiza que exista para todas las matrículas; cuando falta, la aplicación mantiene una tarjeta visual con la matrícula. La fotografía identifica la aeronave por matrícula, pero puede corresponder a otra fecha o librea.

## Puesta en marcha

FlightLog necesita un proyecto **independiente** de Supabase. El plan gratuito admite hasta dos proyectos activos por cuenta, siempre que quede una plaza libre. No reutilices el proyecto, la base de datos ni las claves de ExpenseTracker.

1. Crea `FlightLog` en [Supabase](https://supabase.com/dashboard) con el plan Free.
2. En el editor SQL de **ese** proyecto, ejecuta [`supabase/migrations/202609130001_create_flights.sql`](supabase/migrations/202609130001_create_flights.sql). Si la tabla ya existía, ejecuta después [`supabase/migrations/202609170001_allow_manual_flights.sql`](supabase/migrations/202609170001_allow_manual_flights.sql) para permitir viajes sin número. La tabla mantiene sus políticas de acceso por usuario.
3. Copia `.env.example` a `.env` y escribe la URL del proyecto y su clave **publishable**. Nunca pongas `service_role` ni una clave secreta en `.env` o en la aplicación.
4. La búsqueda invoca la función autenticada `flight-lookup`: usa AirLabs para rutas y horarios futuros y Flightera como fuente complementaria. Publica en Supabase el contenido de `supabase/functions/flight-lookup/index.ts` y guarda `AIRLABS_API_KEY` como secreto de la función. Nunca incluyas esa clave privada en `.env` ni en el código móvil.
5. Instala y ejecuta desde PowerShell:

   ```powershell
   Set-Location 'C:\Users\ruben\FlightLog'
   npm install
   npx expo start --dev-client
   ```

   Para crear una development build instalable en el móvil, inicia sesión en Expo (`npx eas-cli login`) y ejecuta:

   ```powershell
   Set-Location 'C:\Users\ruben\FlightLog'
   npx eas-cli build --platform android --profile development
   ```

   Después instala el APK de desarrollo, abre la app en el móvil y conecta con el servidor iniciado en tu PC. Teléfono y PC deben estar en la misma red; si la conexión local falla, prueba `npx expo start --dev-client --tunnel`.

6. Cuando quieras un **APK autónomo**, sin Metro, ejecuta tú personalmente:

   ```powershell
   Set-Location 'C:\Users\ruben\FlightLog'
   npx eas-cli build --platform android --profile preview
   ```

   El perfil `preview` no incluye el cliente de desarrollo e incorpora el código de la app. Necesita internet para hablar con Supabase, pero no necesita Metro.

Las variables `EXPO_PUBLIC_` se incluyen en el paquete de la app; por eso solo se usan URL y clave pública. La protección real depende de la autenticación y las políticas de la base de datos.

## Datos y evolución

`flight_date` es el día **local de salida**. Las horas se guardan como horas locales y la fecha de llegada puede diferir. Cuando salida y llegada pertenecen a la misma zona horaria, la aplicación puede calcular la llegada sumando la duración a la hora de salida; el resultado sigue siendo editable y también contempla el cambio de día. Los campos opcionales de zona horaria, instantes UTC, distancia y procedencia por campo permiten importar datos contrastados más adelante y calcular estadísticas y tarjetas compartibles. El asiento, la clase y los comentarios son privados y siempre manuales.

La búsqueda solo ofrece un vuelo fechado si coincide con el número y el día de salida. Para vuelos recientes intenta completar modelo y matrícula cuando encuentra una aeronave asociada a la misma fecha y ruta. Estas consultas dependen del contenido de páginas externas y pueden fallar o quedar incompletas. También se puede guardar un viaje sin número y completar sus datos manualmente. Consulta [los flujos de alta](docs/flujos-de-alta.md) y [las limitaciones de datos](docs/fuentes-de-datos.md).

## Comprobaciones

```powershell
Set-Location 'C:\Users\ruben\FlightLog'
npm run check
npx expo-doctor
```

No se hace push desde este flujo. Los commits se crearán por funcionalidad tras tu prueba en el móvil.
