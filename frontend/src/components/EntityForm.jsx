import React from "react";
import { Save, X } from "lucide-react";
import FormField from "./FormField";

const EntityForm = ({
  config,
  formData,
  editingItem,
  selectedEntity,
  onFormSubmit,
  onInputChange,
  onClose,
}) => {
  const handleInputChange = (fieldName, value) => {
    onInputChange((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md px-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-scaleIn">
        {/* Header */}
        <div className="flex items-start justify-between px-8 py-6 border-b bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-3xl">
          <div>
            <h3 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {editingItem ? "Edit" : "Create"} {selectedEntity.slice(0, -1)}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Provide accurate details to continue
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 hover:bg-white hover:text-gray-800 transition"
          >
            <X size={22} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onFormSubmit} className="px-8 py-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {config.frontend.fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <FormField
                  field={field}
                  value={formData[field.name] || ""}
                  onChange={handleInputChange}
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 pt-8 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              <Save size={18} />
              {editingItem ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EntityForm;
