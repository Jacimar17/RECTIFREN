# 🛞 RECTIFREN

> *"Si frena, es porque alguien lo rectificó bien."* 😎

Sistema web de **RECTIFREN**, un taller de frenos, embragues y repuestos mecánicos. Tiene dos caras: una **página pública** para que los clientes vean qué trabajamos, y un **inventario privado** para que el taller sepa qué hay en el estante sin revolver cajas. 📦

---

## 🧰 ¿Qué hay adentro?

### 🌐 Página pública
- 🏠 **Inicio** con banner, categorías y un carrusel de marcas que se mueve solo (no se queda quieto ni para la foto).
- 🔍 **Productos**: catálogo para que cualquiera busque por código. *(en obras 🚧)*
- 💬 Botón flotante de **WhatsApp**, porque acá se resuelve todo por mensaje.
- 📍 Contacto y mapa para que nadie diga "no sabía dónde quedaba".
- ⚠️ Aviso de *"página en producción"*: todavía estamos con los guantes puestos.

### 🔒 Inventario privado
Se entra por el botón **Inventario** (arriba a la derecha) y pide login. Adentro:
- 📋 Stock con filtros, ventana de detalle y campos editables.
- 🕓 Historial por producto.
- 📤 Exportar a CSV.
- 🧪 **Buscador de proveedores (beta)**: pone un código de pastilla de Litton y busca equivalencias en **Aimar** y **ATONOR**, con precios e imágenes. Un lujo. 💅

---

## 🏷️ Marcas con las que trabajamos

Frasle · Litton · Litton Ultra · Fri-ma · LPR · TRW · Wagner · AF · Fremec · Braext · Imbasa · BRK-HQ · Mazacamp · Raybestos · IKE · Varga · Mazfren · Freno Silent

---

## 🏗️ Cómo está armado

| Parte | Con qué |
|-------|---------|
| 🎨 Frontend | HTML, CSS y JavaScript puro (sin frameworks, como en los viejos tiempos) |
| 🌍 Hosting del frontend | GitHub Pages |
| 🗄️ Base de datos | MongoDB Atlas |
| ⚙️ Backend | Carpeta `backend/` (hay un `render.yaml` para el deploy) |

```
RECTIFREN/
├── assets/     🖼️  logo e imágenes
├── backend/    ⚙️  API y conexión a la base
├── css/        🎨  estilos
├── js/         🧠  la lógica
├── index.html  🏠  página pública
└── manifest.json
```

---

## 🚀 Probarlo en tu compu

1. Cloná el repo:
```bash
   git clone https://github.com/Jacimar17/RECTIFREN.git
```
2. Abrilo en VS Code y levantá el frontend con la extensión **Live Server**.
   > ⚠️ No lo abras con doble clic en el HTML: usa módulos de JS y el navegador se enoja si no hay servidor.
3. Para el backend, mirá la carpeta `backend/` y cargá tus propias variables de entorno.

---

## 🔐 Ojo con los secretos

Este repo es **público**. Por eso:
- ❌ Nada de contraseñas, tokens ni cadenas de conexión en el código.
- ✅ Todo eso va en variables de entorno.

Si alguna vez se te escapa una clave, cambiala enseguida. Borrar el commit no alcanza: Git tiene memoria de elefante. 🐘

---

## 🗺️ Próximamente

- [x] 🏠 Página pública
- [ ] 📚 Catálogo público conectado a la base
- [ ] 🔑 Login real del inventario, validado en el backend
- [ ] 🛒 Conexión con **Mercado Libre** para vender online

---

## 👷 Autor

Hecho con café, grasa de frenos y mucho `git push` por **[Jacimar17](https://github.com/Jacimar17)** 🛠️

*¿Consultas? Por WhatsApp, como Dios manda.* 📱
