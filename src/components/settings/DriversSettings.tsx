"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Vehicle = {
  id: string;
  vehicle_name: string;
  cubic_size: number;
};

type Driver = {
  id: string;
  driver_name: string;
  license_number: string | null;
  phone: string | null;
  vehicle_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  vehicles?: Vehicle;
};

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function DriversSettings() {
  const { t, formatDate } = useI18n();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverName, setDriverName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);

  const fetchDrivers = useCallback(async () => {
    const response = await fetch("/api/admin/drivers", {
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await readError(response, t("settings.loadError"));
      throw new Error(message);
    }

    return (await response.json()) as Driver[];
  }, [t]);

  const fetchVehicles = useCallback(async () => {
    const response = await fetch("/api/admin/vehicles", {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as Vehicle[];
  }, []);

  async function loadData() {
    setError("");
    setIsLoading(true);

    try {
      const [driversData, vehiclesData] = await Promise.all([
        fetchDrivers(),
        fetchVehicles(),
      ]);
      setDrivers(driversData);
      setVehicles(vehiclesData);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("settings.loadError"),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setIsCreating(true);

    try {
      const method = editingId ? "PUT" : "POST";
      const response = await fetch("/api/admin/drivers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId && { id: editingId }),
          driver_name: driverName,
          license_number: licenseNumber || null,
          phone: phone || null,
          vehicle_id: vehicleId || null,
        }),
      });

      if (!response.ok) {
        const message = await readError(response, t("settings.createError"));
        throw new Error(message);
      }

      await loadData();
      setDriverName("");
      setLicenseNumber("");
      setPhone("");
      setVehicleId("");
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
        `/api/admin/drivers?id=${deleteTarget.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const message = await readError(response, t("settings.deleteError"));
        throw new Error(message);
      }

      await loadData();
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

  function handleEdit(driver: Driver) {
    setDriverName(driver.driver_name);
    setLicenseNumber(driver.license_number || "");
    setPhone(driver.phone || "");
    setVehicleId(driver.vehicle_id || "");
    setEditingId(driver.id);
  }

  function handleCancel() {
    setDriverName("");
    setLicenseNumber("");
    setPhone("");
    setVehicleId("");
    setEditingId(null);
    setError("");
  }

  if (isLoading) {
    return <div className="text-center py-4">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Manage Drivers</h2>

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Driver Name
              </label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Number
              </label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="License #"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone #"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Vehicle
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_name} ({vehicle.cubic_size}m³)
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={isCreating || !driverName}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isCreating ? "Saving..." : editingId ? "Update Driver" : "Add Driver"}
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
                <th className="text-left py-2 px-3 font-semibold">Driver Name</th>
                <th className="text-left py-2 px-3 font-semibold">License</th>
                <th className="text-left py-2 px-3 font-semibold">Phone</th>
                <th className="text-left py-2 px-3 font-semibold">Vehicle</th>
                <th className="text-left py-2 px-3 font-semibold">Status</th>
                <th className="text-right py-2 px-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{driver.driver_name}</td>
                  <td className="py-2 px-3 text-sm">{driver.license_number || "-"}</td>
                  <td className="py-2 px-3 text-sm">{driver.phone || "-"}</td>
                  <td className="py-2 px-3 text-sm">
                    {driver.vehicles?.vehicle_name || "-"}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-1 rounded text-sm font-medium ${
                        driver.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {driver.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleEdit(driver)}
                      className="text-blue-600 hover:text-blue-700 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(driver)}
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

        {drivers.length === 0 && (
          <div className="text-center py-4 text-gray-500">No drivers added yet</div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Delete Driver</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "{deleteTarget.driver_name}"?
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
