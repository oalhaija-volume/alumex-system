"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Vehicle = {
  id: string;
  vehicle_name: string;
  cubic_size: number;
  plate_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const vehiclesChangedEvent = "alumex:vehicles-changed";

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function VehiclesSettings() {
  const { t } = useI18n();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleName, setVehicleName] = useState("");
  const [cubicSize, setCubicSize] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  const fetchVehicles = useCallback(async () => {
    const response = await fetch("/api/admin/vehicles", {
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await readError(response, t("settings.loadError"));
      throw new Error(message);
    }

    return (await response.json()) as Vehicle[];
  }, [t]);

  const loadVehicles = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      setVehicles(await fetchVehicles());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("settings.loadError"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [fetchVehicles, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVehicles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadVehicles]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setIsCreating(true);

    try {
      const method = editingId ? "PUT" : "POST";
      const response = await fetch("/api/admin/vehicles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId && { id: editingId }),
          vehicle_name: vehicleName,
          cubic_size: parseFloat(cubicSize),
          plate_number: plateNumber || null,
        }),
      });

      if (!response.ok) {
        const message = await readError(response, t("settings.createError"));
        throw new Error(message);
      }

      await loadVehicles();
      window.dispatchEvent(new Event(vehiclesChangedEvent));
      setVehicleName("");
      setCubicSize("");
      setPlateNumber("");
      setEditingId(null);
      setNotice(editingId ? t("settings.updateSuccess") : t("settings.createSuccess"));
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("settings.createError"),
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setError("");
    setIsDeleting(true);

    try {
      const response = await fetch(
        `/api/admin/vehicles?id=${deleteTarget.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const message = await readError(response, t("settings.deleteError"));
        throw new Error(message);
      }

      await loadVehicles();
      window.dispatchEvent(new Event(vehiclesChangedEvent));
      setDeleteTarget(null);
      setNotice(t("settings.deleteSuccess"));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : t("settings.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleEdit(vehicle: Vehicle) {
    setVehicleName(vehicle.vehicle_name);
    setCubicSize(String(vehicle.cubic_size));
    setPlateNumber(vehicle.plate_number || "");
    setEditingId(vehicle.id);
  }

  function handleCancel() {
    setVehicleName("");
    setCubicSize("");
    setPlateNumber("");
    setEditingId(null);
    setError("");
  }

  if (isLoading) {
    return <div className="text-center py-4">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Manage Vehicles</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {notice && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vehicle Name
              </label>
              <input
                type="text"
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="e.g., Truck A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cubic Size (m³)
              </label>
              <input
                type="number"
                step="0.01"
                value={cubicSize}
                onChange={(e) => setCubicSize(e.target.value)}
                placeholder="e.g., 15.5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plate Number
              </label>
              <input
                type="text"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="e.g., ABC-123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={isCreating || !vehicleName || !cubicSize}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isCreating ? "Saving..." : editingId ? "Update Vehicle" : "Add Vehicle"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-semibold">Vehicle Name</th>
                <th className="text-left py-2 px-3 font-semibold">Cubic Size (m³)</th>
                <th className="text-left py-2 px-3 font-semibold">Plate Number</th>
                <th className="text-left py-2 px-3 font-semibold">Status</th>
                <th className="text-right py-2 px-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{vehicle.vehicle_name}</td>
                  <td className="py-2 px-3">{vehicle.cubic_size}</td>
                  <td className="py-2 px-3">{vehicle.plate_number || "-"}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-1 rounded text-sm font-medium ${
                        vehicle.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {vehicle.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleEdit(vehicle)}
                      className="text-blue-600 hover:text-blue-700 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(vehicle)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {vehicles.length === 0 && (
          <div className="text-center py-4 text-gray-500">No vehicles added yet</div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Delete Vehicle</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete &quot;{deleteTarget.vehicle_name}&quot;?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
