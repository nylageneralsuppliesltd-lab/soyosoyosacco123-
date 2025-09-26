import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

// Remove conflicting multer setup - handle in routes only
app.use((req, res, next) => {
  console.log(`DEBUG: ${req.method} ${req.url}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
// ✅ REMOVED: app.use(upload.any()); // This was causing upload conflicts
app.use(express.static(path.resolve(__dirname, '..', 'public')));

async function initializeServer() {
  console.log("DEBUG: Starting server...");
  const PORT = Number(process.env.PORT) || 5000;
  console.log(`DEBUG: NODE_ENV=${process.env.NODE_ENV || "production"}`);
  console.log(`DEBUG: DATABASE_URL=${process.env.DATABASE_URL ? "set" : "not set"}`);
  console.log(`DEBUG: OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? "set" : "not set"}`);

  try {
    await registerRoutes(app);
    console.log("✅ Routes registered");

    const distPath = path.resolve(__dirname, "..", "dist", "public");
    if (process.env.NODE_ENV === "production") {
      const exists = await fs.access(distPath).then(() => true).catch(() => false);
      if (exists) {
        app.use(express.static(distPath));
        app.get("*", (req, res, next) => {
          if (req.originalUrl.match(/^(\/api\/|\/health|\/@|\/src\/|\.(js|css|tsx|ts|png|jpg|svg|html)$)/)) {
            return next();
          }
          res.sendFile(path.resolve(distPath, "index.html"), (err) => {
            if (err) {
              console.error(`❌ Failed to serve index.html: ${err}`);
              next();
            }
          });
        });
        console.log(`📁 Serving static files from: ${distPath}`);
      } else {
        console.warn(`⚠️ dist/public not found`);
      }
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`❌ Server failed: ${error}`);
    process.exit(1);
  }
}

initializeServer();
