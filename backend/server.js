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
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
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
   DYNAMIC MODEL CREATOR - SIMPLIFIED (NO PRE-SAVE HOOKS)
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
    // Handle array types properly
    if (Array.isArray(val)) {
      fields[key] = val;
      continue;
    }

    let type = String;
    if (val.type === "Number") type = Number;
    if (val.type === "Boolean") type = Boolean;
    if (val.type === "Date") type = Date;
    if (val.type === "Array") type = Array;
    if (val.type === "Object") type = Object;

    fields[key] = {
      type,
      required: !!val.required,
      unique: !!val.unique,
      enum: val.enum,
      min: val.min,
      max: val.max,
      trim: val.trim,
      lowercase: val.lowercase,
      uppercase: val.uppercase,
      index: val.index,
      sparse: val.sparse,
      default:
        val.default === "Date.now"
          ? Date.now
          : val.default === "true"
          ? true
          : val.default === "false"
          ? false
          : val.default,
    };
  }

  const schema = new mongoose.Schema(fields, {
    timestamps: true,
    strict: false,
  });

  const model = mongoose.model(modelName, schema);
  modelCache[modelName] = model;

  console.log(`📦 Model created: ${modelName}`);

  return model;
};

/* ============================================
   ROUTE CREATOR - WITH ID GENERATION IN ROUTES
============================================ */
const createRoutes = (entity, config, Model) => {
  const router = express.Router();

  // GET - Fetch all records
  router.get("/", async (req, res) => {
    try {
      const { page = 1, limit = 100, search = "" } = req.query;

      if (isMongoConnected && Model) {
        let query = {};

        if (search && search.trim()) {
          const stringFields = Object.keys(config.schema).filter(
            (key) => config.schema[key].type === "String"
          );

          if (stringFields.length > 0) {
            query.$or = stringFields.map((field) => ({
              [field]: { $regex: search.trim(), $options: "i" },
            }));
          }
        }

        const data = await Model.find(query)
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit))
          .sort({ createdAt: -1 })
          .lean();

        const total = await Model.countDocuments(query);

        return res.json({
          success: true,
          data,
          total,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
          },
        });
      }

      const items = memoryStore[entity] || [];
      res.json({ success: true, data: items, total: items.length });
    } catch (error) {
      console.error(`❌ Error fetching ${entity}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
        entity: entity,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  });

  // GET - Fetch single record by ID
  router.get("/:id", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        let record = null;

        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
          record = await Model.findById(req.params.id).lean();
        }

        if (!record) {
          const numericId = !isNaN(req.params.id)
            ? parseInt(req.params.id)
            : req.params.id;
          record = await Model.findOne({ id: numericId }).lean();
        }

        if (!record && entity === "orders") {
          record = await Model.findOne({ orderId: req.params.id }).lean();
        }

        if (!record) {
          return res.status(404).json({
            success: false,
            error: `${entity} not found with id: ${req.params.id}`,
          });
        }

        return res.json({ success: true, data: record });
      }

      res.status(400).json({
        success: false,
        error: "Database not available",
      });
    } catch (error) {
      console.error(`❌ Error fetching ${entity} by ID:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
        entity: entity,
      });
    }
  });

  // POST - Create new record
  router.post("/", async (req, res) => {
    try {
      console.log(`Creating ${entity}:`, JSON.stringify(req.body, null, 2));

      if (isMongoConnected && Model) {
        // Process productIds if it's a comma-separated string
        if (
          entity === "orders" &&
          req.body.productIds &&
          typeof req.body.productIds === "string"
        ) {
          req.body.productIds = req.body.productIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        }

        // Generate orderId for orders if not provided
        if (entity === "orders" && !req.body.orderId) {
          req.body.orderId = `ORD-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        }

        // Generate numeric id if schema defines it and it's not provided
        if (
          config.schema.id &&
          !req.body.id &&
          config.schema.id.type === "Number"
        ) {
          const count = await Model.countDocuments();
          req.body.id = count + 1;
        }

        const doc = await Model.create(req.body);
        console.log(`✅ Created ${entity}:`, doc._id);

        return res.status(201).json({
          success: true,
          data: doc,
          message: `${entity} created successfully`,
        });
      }

      const item = { _id: Date.now().toString(), ...req.body };
      memoryStore[entity] = [...(memoryStore[entity] || []), item];
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      console.error(`❌ Error creating ${entity}:`, error);
      console.error("Full error:", error);

      // Handle validation errors
      if (error.name === "ValidationError") {
        const details = Object.values(error.errors).map((e) => e.message);
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: details,
        });
      }

      // Handle duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0];
        return res.status(409).json({
          success: false,
          error: `Duplicate entry for field: ${field}`,
          field: field,
        });
      }

      res.status(500).json({
        success: false,
        error: error.message,
        entity: entity,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  });

  // PUT - Update record
  router.put("/:id", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        let doc = null;

        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
          doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
          });
        }

        if (!doc) {
          const numericId = !isNaN(req.params.id)
            ? parseInt(req.params.id)
            : req.params.id;
          doc = await Model.findOneAndUpdate({ id: numericId }, req.body, {
            new: true,
            runValidators: true,
          });
        }

        if (!doc) {
          return res.status(404).json({
            success: false,
            error: `${entity} not found`,
          });
        }

        return res.json({
          success: true,
          data: doc,
          message: `${entity} updated successfully`,
        });
      }

      res.status(400).json({
        success: false,
        error: "Database not available",
      });
    } catch (error) {
      console.error(`❌ Error updating ${entity}:`, error);

      if (error.name === "ValidationError") {
        const details = Object.values(error.errors).map((e) => e.message);
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: details,
        });
      }

      res.status(500).json({
        success: false,
        error: error.message,
        entity: entity,
      });
    }
  });

  // DELETE - Delete record
  router.delete("/:id", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        let doc = null;

        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
          doc = await Model.findByIdAndDelete(req.params.id);
        }

        if (!doc) {
          const numericId = !isNaN(req.params.id)
            ? parseInt(req.params.id)
            : req.params.id;
          doc = await Model.findOneAndDelete({ id: numericId });
        }

        if (!doc) {
          return res.status(404).json({
            success: false,
            error: `${entity} not found`,
          });
        }

        return res.json({
          success: true,
          message: `${entity} deleted successfully`,
          data: doc,
        });
      }

      res.status(400).json({
        success: false,
        error: "Database not available",
      });
    } catch (error) {
      console.error(`❌ Error deleting ${entity}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
        entity: entity,
      });
    }
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
    try {
      const Model = isMongoConnected
        ? createModel(entity, config.backend)
        : null;
      app.use(config.route, createRoutes(entity, config.backend, Model));
      registeredRoutes.set(entity, config.route);
      console.log(`✅ Registered route: ${config.route}`);
    } catch (error) {
      console.error(`❌ Failed to register route for ${entity}:`, error);
    }
  }
};

registerRoutes();

/* ============================================
   SYSTEM ROUTES
============================================ */
app.get("/", (req, res) => {
  res.json({
    message: "Dynamic Form API",
    status: "running",
    database: isMongoConnected ? "MongoDB Connected" : "Memory Mode",
    routes: Array.from(registeredRoutes.values()),
    mongodb_uri_set: !!MONGODB_URI,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    database: isMongoConnected ? "connected" : "disconnected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/schema", (req, res) => {
  res.json({
    success: true,
    schema: currentSchema,
  });
});

/* ============================================
   GLOBAL ERROR HANDLER
============================================ */
app.use((err, req, res, next) => {
  console.error("🔴 Global error handler:", err);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal server error",
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

/* ============================================
   404 HANDLER
============================================ */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.path,
    method: req.method,
    availableRoutes: Array.from(registeredRoutes.values()),
  });
});

/* ============================================
   EXPORT FOR VERCEL
============================================ */
export default app;
