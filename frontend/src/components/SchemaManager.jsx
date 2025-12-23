import React, { useState } from "react";
import {
  Save,
  X,
  Upload,
  Code,
  RefreshCw,
  Database,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { apiService } from "../services/api";

const SchemaManager = ({
  schema,
  onClose,
  onUpdate,
  onReset,
  setSelectedEntity,
  checkBackendConnection,
}) => {
  const [jsonInput, setJsonInput] = useState(JSON.stringify(schema, null, 2));
  const [jsonError, setJsonError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(true);

  const handleSchemaUpdate = async () => {
    setIsUpdating(true);
    setJsonError("");

    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.record || typeof parsed.record !== "object") {
        throw new Error(
          'Invalid schema format. Must contain a "record" object.'
        );
      }

      // Validate each entity
      for (const [entityName, config] of Object.entries(parsed.record)) {
        if (!config.route) {
          throw new Error(`Missing route for entity: ${entityName}`);
        }
        if (!config.backend || !config.backend.schema) {
          throw new Error(`Missing backend schema for entity: ${entityName}`);
        }
        if (!config.frontend || !config.frontend.fields) {
          throw new Error(`Missing frontend fields for entity: ${entityName}`);
        }
      }

      // Update backend schema
      try {
        const response = await apiService.updateSchema(parsed);

        if (response.success) {
          toast.success("✅ Backend schema updated successfully!");
          setBackendAvailable(true);
        }
      } catch (backendError) {
        console.error("Backend update failed:", backendError);
        setBackendAvailable(false);
        toast.warning("⚠️ Backend unavailable, updating frontend only");
      }

      // Update frontend schema
      onUpdate(parsed);
      localStorage.setItem("dynamicSchema", JSON.stringify(parsed));

      const entities = Object.keys(parsed.record);
      if (entities.length > 0) {
        setSelectedEntity(entities[0]);
      }

      onClose();
      toast.success("🎉 Schema updated! Frontend regenerated successfully!");

      // Refresh backend connection status
      if (checkBackendConnection) {
        checkBackendConnection();
      }
    } catch (error) {
      setJsonError(`❌ Error: ${error.message}`);
      toast.error(`Failed to update schema: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          setJsonInput(JSON.stringify(parsed, null, 2));
          setJsonError("");
          toast.success("📁 File loaded successfully! Review and click Apply.");
        } catch (error) {
          setJsonError(`❌ Error reading file: ${error.message}`);
          toast.error("Failed to read JSON file");
        }
      };
      reader.readAsText(file);
    }
  };

  const testBackendConnection = async () => {
    try {
      setIsUpdating(true);
      const response = await apiService.checkHealth();
      setBackendAvailable(true);
      toast.success("✅ Backend is connected and healthy!");
    } catch (error) {
      setBackendAvailable(false);
      toast.error("❌ Backend connection failed");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setJsonInput(JSON.stringify(parsed, null, 2));
      toast.success("✨ JSON formatted!");
    } catch (error) {
      toast.error("Cannot format invalid JSON");
    }
  };

  const validateJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.record) {
        throw new Error('Missing "record" object');
      }

      let entityCount = 0;
      for (const [entityName, config] of Object.entries(parsed.record)) {
        entityCount++;

        if (!config.route) {
          throw new Error(`${entityName}: Missing "route"`);
        }
        if (!config.backend || !config.backend.schema) {
          throw new Error(`${entityName}: Missing "backend.schema"`);
        }
        if (!config.frontend) {
          throw new Error(`${entityName}: Missing "frontend" config`);
        }
      }

      toast.success(`✅ Valid schema with ${entityCount} entities!`);
      setJsonError("");
    } catch (error) {
      toast.error(`Validation failed: ${error.message}`);
      setJsonError(`❌ Validation Error: ${error.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <Code size={28} className="text-white" />
            <div>
              <h3 className="text-2xl font-bold text-white">
                JSON Schema Editor
              </h3>
              <p className="text-purple-100 text-sm">
                Edit and manage your dynamic form schema
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Backend Status */}
          <div
            className={`flex items-center justify-between gap-2 px-4 py-3 rounded-lg ${
              backendAvailable
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {backendAvailable ? (
                <CheckCircle size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <span className="font-medium">
                {backendAvailable
                  ? "Backend Connected"
                  : "Backend Disconnected"}
              </span>
            </div>
            <button
              onClick={testBackendConnection}
              disabled={isUpdating}
              className={`text-sm px-3 py-1 rounded transition-colors ${
                backendAvailable
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {isUpdating ? "Testing..." : "Test Connection"}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer text-sm font-medium">
              <Upload size={16} />
              Upload JSON
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              onClick={formatJSON}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm font-medium"
            >
              <Code size={16} />
              Format
            </button>

            <button
              onClick={validateJSON}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
            >
              <CheckCircle size={16} />
              Validate
            </button>

            <button
              onClick={onReset}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium"
            >
              <RefreshCw size={16} />
              Reset
            </button>
          </div>

          {/* JSON Editor */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                JSON Schema
              </label>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{jsonInput.split("\n").length} lines</span>
                <span>•</span>
                <span>{jsonInput.length} chars</span>
              </div>
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setJsonError("");
              }}
              className="w-full h-96 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all font-mono text-sm resize-none"
              placeholder="Paste your JSON schema here..."
              spellCheck="false"
            />
          </div>

          {/* Error Display */}
          {jsonError && (
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertCircle size={18} />
                <span className="font-semibold">Validation Error</span>
              </div>
              <p className="text-red-600 text-sm font-mono">{jsonError}</p>
            </div>
          )}

          {/* Help Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <Database size={16} />
                How It Works
              </h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>✅ Upload JSON or paste directly</li>
                <li>✅ Frontend forms auto-generate</li>
                <li>✅ Backend routes update instantly</li>
                <li>✅ Full CRUD operations enabled</li>
              </ul>
            </div>

            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-2">
                Required Structure
              </h4>
              <pre className="text-xs text-purple-800 overflow-x-auto">
                {`{
  "record": {
    "entity": {
      "route": "/api/entity",
      "backend": { "schema": {...} },
      "frontend": { "fields": [...] }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-gray-50 border-t flex gap-3 flex-shrink-0">
          <button
            onClick={handleSchemaUpdate}
            disabled={isUpdating}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? (
              <>
                <RefreshCw size={20} className="animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save size={20} />
                Apply Schema Changes
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SchemaManager;
