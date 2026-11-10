# Proyecto 7 · Galería administrable (fase 1)

## Estado
Código de galería y panel integrado en la rama `main`. **No implica que esté desplegado o activado**: GitHub Pages es estático y no ejecuta Node ni MongoDB. La página pública solo solicita fotos cuando puede alcanzar la API de producción configurada.

## Arquitectura
- Panel privado: `https://TU-SERVIDOR/admin/fotos`
- Login existente: `https://TU-SERVIDOR/login` (rol `admin`).
- Backend Express: rutas `/api/galeria`.
- Almacenamiento: MongoDB Atlas GridFS `fotos_proyecto7.files/chunks` y metadatos en `fotos_p7`.
- Las fotos se crean como **borradores**. Solo `published: true` se enumera y entrega al público.
- JPEG, PNG, WebP por cabecera verificada; máximo 5 MiB por foto y 80 fotos.
- Datos accesibles públicamente: título, alt, categoría, orden, estado publicado, URL; las fotos ocultas solo pueden ser leídas por administradores autenticados.
- La galería se renderiza con `textContent` para los textos de los metadatos, evitando HTML arbitrario.

## Configuración necesaria del servidor (Node 18+)
1. Desplegar este repositorio en hosting Node que admita Express y acceso a MongoDB Atlas.
2. Configurar `MONGO_URI`, `MONGO_DB`, `JWT_SECRET` aleatorio (mínimo 32 caracteres), `ADMIN_USER` y `ADMIN_PASSWORD`. **Nunca** subir contraseñas ni URL de Mongo a GitHub.
3. Para una base totalmente nueva, definir contraseñas individuales para `SEED_ELIAS_PASSWORD`, `SEED_AURORA_PASSWORD`, `SEED_RULO_PASSWORD` (mínimo 12 caracteres). En bases existentes verificar y rotar las credenciales heredadas: cambiar estas variables NO modifica hashes existentes.
4. Desplegar en HTTPS. Revisar en servidor `/api/galeria`: debe responder `[]` al inicio.
5. Iniciar sesión en `/login` con usuario administrador y visitar `/admin/fotos`.
6. Subir foto, revisar título y alt, elegir categoría, guardar como borrador, verificar que no aparezca en `/api/galeria`, y después publicar.
7. En `index.html` y `public/index.html` de GitHub Pages configurar:
   `<meta name="proyecto7-galeria-api" content="https://TU-SERVIDOR">`
   (sin slash final). **No poner credenciales en este meta**.
8. Verificar la galería pública en GitHub Pages y probar desde móvil.
9. Crear política de respaldo y restauración en Atlas y activar monitoreo de cuota/consumo.

## Rutas
- `GET /api/galeria` — lista pública de fotos publicadas.
- `GET /api/galeria/:id/archivo` — foto publicada.
- `GET /api/galeria/admin` — lista completa, token admin.
- `GET /api/galeria/:id/privado` — vista previa privada, token admin.
- `POST /api/galeria` — cargar base64 data URL, token admin.
- `PATCH /api/galeria/:id` — editar título, descripción, categoría, posición, destacada, publicada, token admin.
- `DELETE /api/galeria/:id` — eliminar metadatos y archivo, token admin.

## Validación antes de publicar
- [ ] Usuario sin sesión: `POST/PATCH/DELETE` devuelve 401.
- [ ] Integrante normal: `POST/PATCH/DELETE` devuelve 403.
- [ ] Subir JPEG, PNG, WebP válidos de menos de 5 MiB.
- [ ] Rechazar archivos de tamaño excesivo y MIME falso.
- [ ] Borrador no aparece en lista pública y archivo devuelve 404.
- [ ] Publicar lo hace visible; ocultar lo retira.
- [ ] Editar título/alt, orden y categoría.
- [ ] Eliminar lo retira y deja de ser recuperable.
- [ ] Recargar página: foto y metadatos persisten en MongoDB.
- [ ] Desktop/móvil: miniaturas sin distorsión.
- [ ] Ante caída de la API, el sitio continúa mostrando su contenido comercial, sin errores visibles.
- [ ] Revisar límites de almacenamiento y backup.
- [ ] Sustituir credenciales heredadas si las cuentas vienen de un entorno anterior.

## Decisión pendiente
La URL de hosting Node con MongoDB Atlas para conectar GitHub Pages a la galería. No hay un backend en vivo verificado en este cambio. Para operaciones sensibles, una auditoría de sesión/autorización y HTTPS sigue siendo obligatoria antes de abrir el sistema a usuarios reales.
