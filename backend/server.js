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

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* ============================================
   MONGODB CONNECTION (SERVERLESS SAFE)
============================================ */
const MONGODB_URI = process.env.MONGODB_URI;
let isMongoConnected = false;

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (!MONGODB_URI) {
    console.warn("⚠️ MONGODB_URI not set");
    return false;
  }

  if (cached.conn) {
    isMongoConnected = true;
    return true;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  }

  try {
    cached.conn = await cached.promise;
    isMongoConnected = true;
    console.log("✅ MongoDB Connected");
    return true;
  } catch (err) {
    cached.promise = null;
    console.warn("⚠️ MongoDB unavailable:", err.message);
    return false;
  }
};

await connectDB();

/* ============================================
   IN-MEMORY STORAGE
============================================ */
const memoryStore = {};

/* ============================================
   SCHEMA LOADING
============================================ */
let currentSchema = {
  record: {
    users: {
      route: "/api/users",
      backend: {
        schema: {
          name: { type: "String", required: true },
          email: { type: "String", required: true },
          phone: { type: "String" },
        },
      },
    },
  },
};

const loadSchema = () => {
  try {
    const schemaPath = path.join(__dirname, "schemaConfig.json");
    if (fs.existsSync(schemaPath)) {
      currentSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
      console.log("✅ Schema loaded");
    }
  } catch (err) {
    console.warn("⚠️ Schema load failed:", err.message);
  }
};

loadSchema();

/* ============================================
   DYNAMIC MODEL CREATOR
============================================ */
const modelCache = {};

const createModel = (entityName, config) => {
  const modelName = entityName.charAt(0).toUpperCase() + entityName.slice(1);

  if (modelCache[modelName]) return modelCache[modelName];

  if (mongoose.models[modelName]) {
    delete mongoose.models[modelName];
  }

  const fields = {};
  for (const [key, val] of Object.entries(config.schema)) {
    let type = String;
    if (val.type === "Number") type = Number;
    if (val.type === "Boolean") type = Boolean;
    if (val.type === "Date") type = Date;
    if (val.type === "Array") type = Array;

    fields[key] = {
      type,
      required: !!val.required,
      unique: !!val.unique,
      enum: val.enum,
      min: val.min,
      max: val.max,
      default: val.default === "Date.now" ? Date.now : val.default,
    };
  }

  const schema = new mongoose.Schema(fields, {
    timestamps: true,
    strict: false,
  });

  const model = mongoose.model(modelName, schema);
  modelCache[modelName] = model;

  return model;
};

/* ============================================
   ROUTE CREATOR
============================================ */
const createRoutes = (entity, config, Model) => {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { page = 1, limit = 10, search = "" } = req.query;

    if (isMongoConnected && Model) {
      let query = {};
      if (search) {
        query.$or = Object.keys(config.schema).map((k) => ({
          [k]: { $regex: search, $options: "i" },
        }));
      }

      const data = await Model.find(query)
        .limit(+limit)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 })
        .lean();

      const total = await Model.countDocuments(query);
      return res.json({ success: true, data, total });
    }

    const items = memoryStore[entity] || [];
    res.json({ success: true, data: items });
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

  router.put("/:id", async (req, res) => {
    if (isMongoConnected && Model) {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
      return res.json({ success: true, data: doc });
    }
    res.status(400).json({ success: false });
  });

  router.delete("/:id", async (req, res) => {
    if (isMongoConnected && Model) {
      await Model.findByIdAndDelete(req.params.id);
      return res.json({ success: true });
    }
    res.status(400).json({ success: false });
  });

  return router;
};

/* ============================================
   REGISTER ROUTES
============================================ */
const registeredRoutes = new Map();

const registerRoutes = () => {
  registeredRoutes.clear();

  for (const [entity, config] of Object.entries(currentSchema.record || {})) {
    const Model = isMongoConnected ? createModel(entity, config.backend) : null;

    app.use(config.route, createRoutes(entity, config.backend, Model));
    registeredRoutes.set(entity, config.route);
  }
};

registerRoutes();

/* ============================================
   SYSTEM ROUTES
============================================ */
app.get("/", (req, res) => {
  res.json({
    message: "Dynamic Form API",
    database: isMongoConnected ? "MongoDB" : "Memory",
    routes: Array.from(registeredRoutes.values()),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

/* ============================================
   EXPORT FOR VERCEL
============================================ */
export default app;
