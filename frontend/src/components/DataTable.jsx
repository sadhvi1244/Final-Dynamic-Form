import React from "react";
import {
  Edit2,
  Trash2,
  Eye,
  Copy,
  MoreVertical,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Hash,
} from "lucide-react";

const DataTable = ({ config = {}, data = [], onEdit, onDelete }) => {
  const columns = config?.frontend?.columns || [];

  // =========================
  // Format Cell Value
  // =========================
  const formatCellValue = (value, col) => {
    if (value === null || value === undefined || value === "") return "-";

    if (typeof value === "boolean") {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            value ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {value ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {value ? "Yes" : "No"}
        </span>
      );
    }

    if (col.type === "date") {
      return new Date(value).toLocaleDateString();
    }

    if (typeof value === "string" && value.length > 50) {
      return (
        <span title={value} className="truncate max-w-xs">
          {value.slice(0, 50)}...
        </span>
      );
    }

    if (typeof value === "number" && col.type !== "id") {
      return value.toLocaleString();
    }

    if (col.type === "id") {
      return (
        <span className="inline-flex items-center gap-1 text-gray-500 font-mono text-xs">
          <Hash size={12} />
          {value.toString().slice(0, 8)}...
        </span>
      );
    }

    return value;
  };

  // =========================
  // Column Icons
  // =========================
  const getColumnIcon = (field) => {
    const name = field.toLowerCase();
    if (name.includes("name") || name.includes("user"))
      return <User size={14} />;
    if (name.includes("date") || name.includes("time"))
      return <Calendar size={14} />;
    if (name.includes("id")) return <Hash size={14} />;
    return null;
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* ================= HEADER ================= */}
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase"
                >
                  <div className="flex items-center gap-2">
                    {getColumnIcon(col.accessor)}
                    {col.header}
                  </div>
                </th>
              ))}
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase">
                Actions
              </th>
            </tr>
          </thead>

          {/* ================= BODY ================= */}
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-6 py-16 text-center text-gray-500"
                >
                  <div className="flex flex-col items-center gap-3">
                    <User size={28} className="text-gray-300" />
                    <span>
                      {config?.frontend?.emptyStateMessage ||
                        "No records found"}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item, rowIndex) => (
                <tr
                  key={item.id || rowIndex}
                  className={`hover:bg-blue-50/50 ${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  }`}
                >
                  {columns.map((col, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-6 py-4 text-sm text-gray-900"
                    >
                      {formatCellValue(item[col.accessor], col)}
                    </td>
                  ))}

                  {/* ================= ACTIONS ================= */}
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEdit(item)}
                        className="p-2 rounded hover:bg-blue-100 text-blue-600"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>

                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-2 rounded hover:bg-red-100 text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>

                      <div className="relative group">
                        <button className="p-2 rounded hover:bg-gray-100">
                          <MoreVertical size={16} />
                        </button>
                        <div className="absolute right-0 mt-1 w-32 bg-white border rounded-lg shadow-lg hidden group-hover:block">
                          <button className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50">
                            <Eye size={14} />
                            View
                          </button>
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                JSON.stringify(item, null, 2)
                              )
                            }
                            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50"
                          >
                            <Copy size={14} />
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ================= FOOTER ================= */}
      {data.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
          Showing <span className="font-semibold">{data.length}</span> records
        </div>
      )}
    </div>
  );
};

export default DataTable;
