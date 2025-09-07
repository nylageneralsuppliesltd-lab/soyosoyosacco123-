import express from 'express';
import { registerRoutes } from '../server/routes.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Enable CORS for all routes to support embedding in Google Sites
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.resolve(__dirname, '..', 'public')));

// Initialize database schema in production
async function initializeDatabase() {
  if (process.env.DATABASE_URL) {
    try {
      console.log("🗃️ Initializing database schema...");
      const { execSync } = await import("child_process");
      execSync('npx drizzle-kit push', { stdio: 'inherit' });
      console.log("✅ Database schema updated!");
    } catch (error) {
      console.error("❌ Database initialization failed:", error instanceof Error ? error.message : String(error));
      console.log("🔄 Continuing with app startup...");
    }
  }
}

// Initialize routes
let routesInitialized = false;

export default async function handler(req: any, res: any) {
  if (!routesInitialized) {
    await registerRoutes(app);
    await initializeDatabase();
    routesInitialized = true;
  }
  
  return app(req, res);
}