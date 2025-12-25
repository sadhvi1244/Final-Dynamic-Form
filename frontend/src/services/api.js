import axios from "axios";

// Use environment variable or default to production backend
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "https://final-dynamic-form-u211.vercel.app";

console.log("🔗 API Base URL:", API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log(
      `📤 ${config.method?.toUpperCase()} ${config.url}`,
      config.data
    );
    return config;
  },
  (error) => {
    console.error("Request error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor with better error handling
api.interceptors.response.use(
  (response) => {
    console.log(`📥 Response from ${response.config.url}:`, response.data);
    return response.data;
  },
  (error) => {
    console.error("❌ API Error:", {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });

    // Handle different error scenarios
    if (error.response) {
      // Server responded with error status
      const errorData = error.response.data;

      // Check if response is HTML (500 error page)
      if (
        typeof errorData === "string" &&
        errorData.includes("<!DOCTYPE html>")
      ) {
        return Promise.reject({
          status: error.response.status,
          message: "Server error - Please check backend logs",
          data: "Internal Server Error",
        });
      }

      return Promise.reject({
        status: error.response.status,
        message: errorData?.error || errorData?.message || "Server error",
        data: errorData,
        details: errorData?.details,
      });
    }

    if (error.request) {
      // Request made but no response received
      return Promise.reject({
        status: 0,
        message: "Network error - Server not responding",
        data: null,
      });
    }

    // Something else happened
    return Promise.reject({
      status: 0,
      message: error.message || "Unknown error",
      data: null,
    });
  }
);

export const apiService = {
  // Schema management
  getSchema: () => api.get("/api/schema"),
  updateSchema: (schema) => api.post("/api/schema/update", schema),

  // Health check
  checkHealth: () => api.get("/health"),

  // Entity operations
  getEntities: (entity, params = {}) => {
    console.log(`Fetching ${entity} with params:`, params);
    return api.get(`/api/${entity}`, { params });
  },

  searchEntities: (entity, params = {}) => {
    console.log(`Searching ${entity} with params:`, params);
    return api.get(`/api/${entity}`, { params });
  },

  getEntity: (entity, id) => {
    console.log(`Fetching single ${entity} with id:`, id);
    return api.get(`/api/${entity}/${id}`);
  },

  createEntity: (entity, data) => {
    console.log(`Creating ${entity}:`, data);
    return api.post(`/api/${entity}`, data);
  },

  updateEntity: (entity, id, data) => {
    console.log(`Updating ${entity} ${id}:`, data);
    return api.put(`/api/${entity}/${id}`, data);
  },

  deleteEntity: (entity, id) => {
    console.log(`Deleting ${entity} ${id}`);
    return api.delete(`/api/${entity}/${id}`);
  },
};

export default api;
