import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ============================================
   MIDDLEWARE
============================================ */
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

/* ============================================
   MONGODB CONNECTION (VERCEL SAFE)
============================================ */
const MONGODB_URI = process.env.MONGODB_URI;
let isMongoConnected = false;

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (!MONGODB_URI) return false;
  if (cached.conn) {
    isMongoConnected = true;
    return true;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI);
  }

  try {
    cached.conn = await cached.promise;
    isMongoConnected = true;
    return true;
  } catch (err) {
    cached.promise = null;
    console.error("Mongo error:", err.message);
    return false;
  }
}

/* ============================================
   IN-MEMORY FALLBACK
============================================ */
const memoryStore = {};

/* ============================================
   SCHEMA LOADING (SAFE)
============================================ */
let currentSchema = {
  record: {
    users: {
      route: "/api/users",
      backend: {
        schema: {
          name: { type: "String", required: true },
          email: { type: "String", required: true },
        },
      },
    },
  },
};

try {
  const schemaPath = path.join(__dirname, "schemaConfig.json");
  if (fs.existsSync(schemaPath)) {
    currentSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  }
} catch (err) {
  console.warn("Schema load skipped:", err.message);
}

/* ============================================
   DYNAMIC MODEL CREATOR
============================================ */
const modelCache = {};

function createModel(entityName, config) {
  const modelName = entityName.charAt(0).toUpperCase() + entityName.slice(1);

  if (modelCache[modelName]) return modelCache[modelName];

  if (mongoose.models[modelName]) {
    delete mongoose.models[modelName];
  }

  const fields = {};
  for (const [key, val] of Object.entries(config.schema)) {
    const map = {
      String,
      Number,
      Boolean,
      Date,
      Array,
    };
    fields[key] = {
      type: map[val.type] || String,
      required: !!val.required,
    };
  }

  const schema = new mongoose.Schema(fields, { timestamps: true });
  const model = mongoose.model(modelName, schema);
  modelCache[modelName] = model;
  return model;
}

/* ============================================
   ROUTES
============================================ */
function createRoutes(entity, config, Model) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    if (isMongoConnected && Model) {
      const data = await Model.find().lean();
      return res.json({ success: true, data });
    }
    res.json({ success: true, data: memoryStore[entity] || [] });
  });

  router.post("/", async (req, res) => {
    if (isMongoConnected && Model) {
      const doc = await Model.create(req.body);
      return res.status(201).json({ success: true, data: doc });
    }
    const item = { _id: Date.now().toString(), ...req.body };
    memoryStore[entity] = [...(memoryStore[entity] || []), item];
    res.status(201).json({ success: true, data: item });
  });

  return router;
}

/* ============================================
   MAIN HANDLER (VERCEL ENTRY)
============================================ */
export default async function handler(req, res) {
  await connectDB();

  for (const [entity, config] of Object.entries(currentSchema.record)) {
    const Model = isMongoConnected ? createModel(entity, config.backend) : null;

    app.use(config.route, createRoutes(entity, config.backend, Model));
  }

  return app(req, res);
}
