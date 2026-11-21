# Despliegue de Proyecto 7

Este archivo registra la preparación del primer despliegue desde la rama `main` del repositorio conectado a Vercel.

El servidor Express se detecta desde `server.js`. La galería requiere `MONGO_URI`, `MONGO_DB`, `JWT_SECRET`, `NODE_ENV` y las variables de credenciales iniciales para una base nueva. El panel y la galería usan la misma sesión JWT del usuario administrador.

Nunca incorporar valores secretos a este repositorio. Confirmar un despliegue `READY` y probar la API antes de activar la publicación de fotografías en GitHub Pages.
