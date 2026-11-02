const mongoose   = require("mongoose");

const crearApp = require("./app");
const migrarUbicacionesFaltantes = require("./migrations/ubicaciones");

const app = crearApp();
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ Conectado a MongoDB Atlas");
    try {
      const migrados = await migrarUbicacionesFaltantes();
      if (migrados) console.log(`✅ Ubicaciones iniciales asignadas a ${migrados} productos`);
    } catch (err) {
      console.error("❌ Error al completar ubicaciones del inventario:", err.message);
      process.exit(1);
    }
    app.listen(PORT, () => console.log(`🚀 API en puerto ${PORT}`));
  })
  .catch((err) => { console.error("❌ Error MongoDB:", err.message); process.exit(1); });
