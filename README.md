# FlightLog

Diario personal de vuelos para Android. Incluye registro e inicio de sesión, listado, alta rápida con número y fecha, sugerencias de ruta y edición manual de los detalles. Cada usuario ve solo sus vuelos.

## Puesta en marcha

FlightLog necesita un proyecto **independiente** de Supabase. El plan gratuito admite hasta dos proyectos activos por cuenta, siempre que quede una plaza libre. No reutilices el proyecto, la base de datos ni las claves de ExpenseTracker.

1. Crea `FlightLog` en [Supabase](https://supabase.com/dashboard) con el plan Free.
2. En el editor SQL de **ese** proyecto, ejecuta [`supabase/migrations/202609130001_create_flights.sql`](supabase/migrations/202609130001_create_flights.sql). La tabla tiene políticas de acceso por usuario.
3. Copia `.env.example` a `.env` y escribe la URL del proyecto y su clave **publishable**. Nunca pongas `service_role` ni una clave secreta en `.env` o en la aplicación.
4. La búsqueda actual consulta páginas públicas de vuelos y permite aceptar o corregir los datos encontrados. La función `supabase/functions/flight-lookup/index.ts` queda versionada como alternativa de servidor, pero la app **no la invoca actualmente**. La clave `AIRLABS_API_KEY` guardada en Supabase tampoco se usa en esta versión. Nunca incluyas claves privadas en `.env` ni en el código móvil.
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

`flight_date` es el día **local de salida**. Las horas se guardan como horas locales y la fecha de llegada puede diferir. Los campos opcionales de zona horaria, instantes UTC, distancia y procedencia por campo permiten importar datos contrastados más adelante y calcular estadísticas y tarjetas compartibles. El asiento, la clase y los comentarios son privados y siempre manuales.

La búsqueda solo ofrece un vuelo fechado si coincide con el número y el día de salida. Para vuelos recientes intenta completar modelo y matrícula cuando encuentra una aeronave asociada a la misma fecha y ruta. Estas consultas dependen del contenido de páginas externas y pueden fallar o quedar incompletas. El número y la fecha siguen bastando para guardar un viaje; todos los demás datos se pueden añadir o corregir después. Consulta [las limitaciones de datos](docs/fuentes-de-datos.md).

## Comprobaciones

```powershell
Set-Location 'C:\Users\ruben\FlightLog'
npm run check
npx expo-doctor
```

No se hace push desde este flujo. Los commits se crearán por funcionalidad tras tu prueba en el móvil.
