# Integración de Proyecto 7 Manager (Lovable) con galería pública

## Estado verificado el 10 de noviembre de 2026
- Lovable proyecto `1e31c23a-d414-4fbe-a6b9-4cc19157b3cf` publicado, usa TanStack Start/React + Supabase Auth.
- Su módulo `useAuth` obtiene permiso de administrador de `public.user_roles` con `role = 'admin'`.
- El workspace Lovable no tiene créditos: no acepta solicitudes de edición por chat.
- El repositorio GitHub administrable desde esta conexión es `betovaladara85/Eliasreyesysuproyecto7`, que es el sitio público/servidor Express; **no es el código de Manager**.
- El proyecto Supabase de Manager **no figura entre los proyectos accesibles por esta conexión**. No seleccionar otro Supabase ni ejecutar migraciones en una base no identificada.
- Los componentes de galería Express/MongoDB del sitio público son independientes y todavía no están conectados a Manager. No mezclar identificaciones JWT de Express y Supabase.

## Diseño de integración propuesto
1. Conectar el proyecto Lovable Manager a un repositorio GitHub con permisos de escritura para el desarrollador, o habilitar créditos de Lovable.
2. Dar acceso al proyecto Supabase exacto que usa Manager. Identificarlo por `SUPABASE_URL`/referencia (sin compartir claves).
3. Crear bucket privado `proyecto7-media`, limitado a JPG/PNG/WebP de 5MB. No usar bucket público para borradores.
4. Crear tabla `public.proyecto7_photos`: `id uuid`, `storage_path text unique`, `title text`, `alt text`, `category text`, `position integer`, `featured boolean`, `published boolean default false`, `created_at timestamptz`, `created_by uuid`.
5. Aplicar RLS: SELECT para todo visitante solamente si `published=true` y para administradores; INSERT/UPDATE/DELETE solo para administradores verificados a través de `public.user_roles`. Restringir storage.objects de `proyecto7-media` a los mismos administradores; lectura pública **solo para objetos de filas publicadas**; mantener objetos no publicados privados.
6. Integrar ruta `/galeria` en AppShell y navegación, con subida y revisión por administradores y lectura pública por separado.
7. Consumir lista pública desde GitHub Pages con `supabase-js` y clave publishable (NO service role) o mediante endpoint de solo lectura. Evitar duplicar el almacenamiento MongoDB si Manager será la fuente principal.
8. Probar acceso anónimo/no administrador/administrador, borradores privados, publicación/revocación, eliminación y persistencia. Implementar compensación ante errores de carga y limpieza de archivos huérfanos.

## Próximo desbloqueo
- En el editor de Lovable de Proyecto 7 Manager, localizar GitHub → Connect y enlazar un repositorio de código (nuevo o existente) al que esta conexión GitHub pueda acceder.
- En Supabase, verificar cuál es el proyecto asociado a Manager y permitir su acceso desde la conexión Supabase de ChatGPT.
- No se ha modificado ningún dato, cuenta ni permiso de Manager.
