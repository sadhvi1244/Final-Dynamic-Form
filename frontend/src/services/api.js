import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error("API Error:", error.response?.data || error.message);

    if (error.response) {
      return Promise.reject({
        status: error.response.status,
        message: error.response.data?.error || "Server error",
        data: error.response.data,
      });
    }

    return Promise.reject({
      status: 0,
      message: "Network error",
    });
  }
);

export const apiService = {
  getSchema: () => api.get("/api/schema"),
  updateSchema: (schema) => api.post("/api/schema/update", schema),
  checkHealth: () => api.get("/health"),

  getEntities: (entity, params = {}) => api.get(`/api/${entity}`, { params }),
  searchEntities: (entity, params = {}) =>
    api.get(`/api/${entity}`, { params }),

  getEntity: (entity, id) => api.get(`/api/${entity}/${id}`),
  createEntity: (entity, data) => api.post(`/api/${entity}`, data),
  updateEntity: (entity, id, data) => api.put(`/api/${entity}/${id}`, data),
  deleteEntity: (entity, id) => api.delete(`/api/${entity}/${id}`),
};

export default api;
