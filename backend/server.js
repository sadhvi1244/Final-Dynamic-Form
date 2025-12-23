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

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// MONGODB CONNECTION
// ============================================
const MONGODB_URI = process.env.MONGODB_URI;
let isMongoConnected = false;

const connectDB = async () => {
  if (!MONGODB_URI) {
    console.warn("⚠️ MONGODB_URI not set");
    return false;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isMongoConnected = true;
    console.log("✅ MongoDB Connected");
    return true;
  } catch (err) {
    console.warn("⚠️ MongoDB unavailable:", err.message);
    return false;
  }
};

// Connect on startup
connectDB();

// ============================================
// IN-MEMORY STORAGE
// ============================================
const memoryStore = {};

// ============================================
// SCHEMA LOADING
// ============================================
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
      frontend: {
        fields: [
          { name: "name", label: "Name", required: true, type: "text" },
          { name: "email", label: "Email", required: true, type: "email" },
        ],
        columns: [
          { header: "Name", accessor: "name" },
          { header: "Email", accessor: "email" },
        ],
      },
    },
  },
};

// Load schema from file
const loadSchema = () => {
  try {
    const schemaPath = path.join(__dirname, "schemaConfig.json");
    if (fs.existsSync(schemaPath)) {
      const data = fs.readFileSync(schemaPath, "utf8");
      currentSchema = JSON.parse(data);
      console.log("✅ Schema loaded:", Object.keys(currentSchema.record));
    } else {
      console.log("ℹ️ Using default schema");
    }
  } catch (error) {
    console.error("❌ Schema load error:", error.message);
  }
};

loadSchema();

// ============================================
// DYNAMIC MODEL CREATOR
// ============================================
const modelCache = {};

const createModel = (entityName, config) => {
  const modelName = entityName.charAt(0).toUpperCase() + entityName.slice(1);

  if (modelCache[modelName]) {
    return modelCache[modelName];
  }

  if (mongoose.models[modelName]) {
    delete mongoose.models[modelName];
  }

  const schemaFields = {};

  for (const [fieldName, fieldConfig] of Object.entries(config.schema)) {
    const field = {};

    switch (fieldConfig.type) {
      case "String":
        field.type = String;
        break;
      case "Number":
        field.type = Number;
        break;
      case "Boolean":
        field.type = Boolean;
        break;
      case "Date":
        field.type = Date;
        break;
      case "Array":
        field.type = Array;
        break;
      default:
        field.type = String;
    }

    if (fieldConfig.required) field.required = true;
    if (fieldConfig.unique) field.unique = true;
    if (fieldConfig.default === "Date.now") field.default = Date.now;
    else if (fieldConfig.default) field.default = fieldConfig.default;
    if (fieldConfig.enum) field.enum = fieldConfig.enum;
    if (fieldConfig.min !== undefined) field.min = fieldConfig.min;
    if (fieldConfig.max !== undefined) field.max = fieldConfig.max;

    schemaFields[fieldName] = field;
  }

  const schema = new mongoose.Schema(schemaFields, {
    timestamps: true,
    strict: false,
  });

  const model = mongoose.model(modelName, schema);
  modelCache[modelName] = model;

  console.log(`📦 Model: ${modelName}`);
  return model;
};

// ============================================
// ROUTE CREATOR
// ============================================
const createRoutes = (entityName, config, Model) => {
  const router = express.Router();

  // GET all
  router.get("/", async (req, res) => {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;

      if (isMongoConnected && Model) {
        let query = {};

        if (search) {
          const stringFields = Object.entries(config.schema)
            .filter(([_, v]) => v.type === "String")
            .map(([k]) => k);

          if (stringFields.length > 0) {
            query.$or = stringFields.map((f) => ({
              [f]: { $regex: search, $options: "i" },
            }));
          }
        }

        const records = await Model.find(query)
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit))
          .sort({ createdAt: -1 })
          .lean();

        const total = await Model.countDocuments(query);

        return res.json({
          success: true,
          data: records,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
          },
        });
      }

      // Fallback to memory
      const items = memoryStore[entityName] || [];
      let filtered = items;

      if (search) {
        filtered = items.filter((item) =>
          Object.values(item).some((v) =>
            String(v).toLowerCase().includes(search.toLowerCase())
          )
        );
      }

      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + parseInt(limit));

      res.json({
        success: true,
        data: paginated,
        pagination: {
          total: filtered.length,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(filtered.length / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error(`GET /${entityName} error:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET by ID
  router.get("/:id", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        const record = await Model.findById(req.params.id).lean();
        if (!record) {
          return res.status(404).json({ success: false, error: "Not found" });
        }
        return res.json({ success: true, data: record });
      }

      const items = memoryStore[entityName] || [];
      const item = items.find((i) => i._id === req.params.id);

      if (!item) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      res.json({ success: true, data: item });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST create
  router.post("/", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        const record = new Model(req.body);
        const saved = await record.save();
        return res.status(201).json({ success: true, data: saved });
      }

      const items = memoryStore[entityName] || [];
      const newItem = {
        _id: Date.now().toString(),
        ...req.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(newItem);
      memoryStore[entityName] = items;

      res.status(201).json({ success: true, data: newItem });
    } catch (error) {
      console.error(`POST /${entityName} error:`, error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // PUT update
  router.put("/:id", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        const updated = await Model.findByIdAndUpdate(req.params.id, req.body, {
          new: true,
          runValidators: true,
        }).lean();

        if (!updated) {
          return res.status(404).json({ success: false, error: "Not found" });
        }
        return res.json({ success: true, data: updated });
      }

      let items = memoryStore[entityName] || [];
      const index = items.findIndex((i) => i._id === req.params.id);

      if (index === -1) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      items[index] = {
        ...items[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      memoryStore[entityName] = items;

      res.json({ success: true, data: items[index] });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // DELETE
  router.delete("/:id", async (req, res) => {
    try {
      if (isMongoConnected && Model) {
        const deleted = await Model.findByIdAndDelete(req.params.id).lean();
        if (!deleted) {
          return res.status(404).json({ success: false, error: "Not found" });
        }
        return res.json({ success: true, message: "Deleted" });
      }

      let items = memoryStore[entityName] || [];
      const filtered = items.filter((i) => i._id !== req.params.id);

      if (filtered.length === items.length) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      memoryStore[entityName] = filtered;
      res.json({ success: true, message: "Deleted" });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};

// ============================================
// REGISTER ROUTES
// ============================================
const registeredRoutes = new Map();

const registerRoutes = () => {
  console.log("\n🔄 Registering routes...");

  // Clear old routes
  registeredRoutes.clear();

  if (!currentSchema.record) {
    console.warn("⚠️ No schema.record found");
    return;
  }

  // Register each entity
  for (const [entityName, config] of Object.entries(currentSchema.record)) {
    try {
      if (!config.route || !config.backend) {
        console.warn(`⚠️ Skip ${entityName}: missing config`);
        continue;
      }

      let Model = null;
      if (isMongoConnected) {
        Model = createModel(entityName, config.backend);
      }

      const router = createRoutes(entityName, config.backend, Model);
      app.use(config.route, router);

      registeredRoutes.set(entityName, config.route);
      console.log(`✅ ${config.route}`);
    } catch (error) {
      console.error(`❌ ${entityName}:`, error.message);
    }
  }

  console.log(`\n📋 Total: ${registeredRoutes.size} routes\n`);
};

// Register routes
registerRoutes();

// ============================================
// SYSTEM ROUTES
// ============================================
app.get("/", (req, res) => {
  res.json({
    message: "Dynamic Form API",
    version: "2.0.0",
    entities: Object.keys(currentSchema.record || {}),
    routes: Array.from(registeredRoutes.values()),
    database: isMongoConnected ? "MongoDB" : "Memory",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: isMongoConnected ? "connected" : "memory",
    entities: Object.keys(currentSchema.record || {}),
    routes: Array.from(registeredRoutes.values()),
  });
});

app.get("/api/schema", (req, res) => {
  res.json({
    success: true,
    data: currentSchema,
  });
});

app.post("/api/schema/update", (req, res) => {
  try {
    const newSchema = req.body;

    if (!newSchema.record) {
      throw new Error("Missing record object");
    }

    currentSchema = newSchema;

    // Save to file
    try {
      const schemaPath = path.join(__dirname, "schemaConfig.json");
      fs.writeFileSync(schemaPath, JSON.stringify(newSchema, null, 2));
      console.log("✅ Schema saved");
    } catch (err) {
      console.warn("⚠️ Save failed:", err.message);
    }

    // Clear cache and re-register
    Object.keys(modelCache).forEach((k) => delete modelCache[k]);
    registerRoutes();

    res.json({
      success: true,
      message: "Schema updated",
      entities: Object.keys(newSchema.record),
      routes: Array.from(registeredRoutes.values()),
    });
  } catch (error) {
    console.error("Schema update error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Debug routes endpoint
app.get("/api/debug/routes", (req, res) => {
  res.json({
    registered: Array.from(registeredRoutes.entries()),
    entities: Object.keys(currentSchema.record || {}),
    memory: Object.keys(memoryStore),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Not found: ${req.method} ${req.path}`,
    available: Array.from(registeredRoutes.values()),
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    error: "Internal error",
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server: http://localhost:${PORT}`);
    console.log(`📋 Entities: ${Object.keys(currentSchema.record).join(", ")}`);
  });
}

export default app;
