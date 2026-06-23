"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Vehicle = {
  id: string;
  vehicle_name: string;
  cubic_size: number;
  plate_number: string | null;
};

type Driver = {
  id: string;
  driver_name: string;
  license_number: string | null;
};

type DeliveryVehicle = {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  cubic_space_used: number;
  cubic_space_available: number;
  vehicles: Vehicle;
  drivers?: Driver;
};

type DeliveryAssignment = {
  id: string;
  project_id: string;
  delivery_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  projects: {
    id: string;
    project_number: string;
    project_name: string;
    address: string;
    clients: {
      client_name: string;
      mobile: string | null;
      email: string | null;
    };
  };
};

type PackingRecommendation = {
  totalCubicMeters: number;
  packingAllowancePercent: number;
  message: string;
  unassignedCubicMeters: number;
  items: Array<{
    id: string;
    openingCode: string;
    location: string;
    productSystem: string;
    glassType: string;
    widthMeters: number;
    heightMeters: number;
    quantity: number;
    sectionDepthMm: number;
    estimatedCubicMeters: number;
  }>;
  recommendedVehicles: Array<{
    vehicleId: string;
    vehicleName: string;
    plateNumber: string;
    capacityCubicMeters: number;
    assignedCubicMeters: number;
    utilizationPercent: number;
  }>;
};

type PackingResponse = {
  quotation: {
    id: string;
    quotationNumber: string;
    createdAt: string;
  } | null;
  recommendation: PackingRecommendation;
};

type Project = {
  id: string;
  project_number: string;
  project_name: string;
  address: string;
  workflow_status: string;
  clients: {
    client_name: string;
    mobile: string | null;
    email: string | null;
  };
};

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function DeliveryModule() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedAssignment, setSelectedAssignment] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [assignmentVehicles, setAssignmentVehicles] = useState<DeliveryVehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [cubicSpace, setCubicSpace] = useState("");
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [packingResponse, setPackingResponse] = useState<PackingResponse | null>(null);
  const [isLoadingPacking, setIsLoadingPacking] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [projectsRes, assignmentsRes, vehiclesRes, driversRes] = await Promise.all([
        fetch("/api/delivery/projects", { cache: "no-store" }),
        fetch("/api/delivery/assignments", { cache: "no-store" }),
        fetch("/api/admin/vehicles", { cache: "no-store" }),
        fetch("/api/admin/drivers", { cache: "no-store" }),
      ]);

      if (!projectsRes.ok) {
        const message = await readError(projectsRes, "Failed to load delivery projects");
        throw new Error(message);
      }

      if (!assignmentsRes.ok) {
        const message = await readError(assignmentsRes, "Failed to load delivery assignments");
        throw new Error(message);
      }

      if (!vehiclesRes.ok) {
        const message = await readError(vehiclesRes, "Failed to load delivery vehicles");
        throw new Error(message);
      }

      if (!driversRes.ok) {
        const message = await readError(driversRes, "Failed to load delivery drivers");
        throw new Error(message);
      }

      const projectsData = (await projectsRes.json()) as Project[];
      const assignmentsData = (await assignmentsRes.json()) as DeliveryAssignment[];
      const vehiclesData = (await vehiclesRes.json()) as Vehicle[];
      const driversData = (await driversRes.json()) as Driver[];

      setProjects(projectsData);
      setAssignments(assignmentsData);
      setVehicles(vehiclesData);
      setDrivers(driversData);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load delivery data",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchData]);

  async function handleCreateAssignment(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsCreating(true);

    try {
      const response = await fetch("/api/delivery/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          deliveryDate: deliveryDate || null,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const message = await readError(response, "Failed to create delivery assignment");
        throw new Error(message);
      }

      await fetchData();
      setSelectedProject("");
      setDeliveryDate("");
      setNotes("");
      setNotice("Delivery assignment created");
      setTimeout(() => setNotice(""), 3000);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create assignment",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function loadAssignmentVehicles(assignmentId: string) {
    try {
      const response = await fetch(`/api/delivery/assignments/${assignmentId}/vehicles`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load vehicles");
      }

      const data = (await response.json()) as DeliveryVehicle[];
      setAssignmentVehicles(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load vehicles",
      );
    }
  }

  async function loadPackingRecommendation(projectId: string) {
    setIsLoadingPacking(true);
    setPackingResponse(null);

    try {
      const response = await fetch(
        `/api/delivery/packing?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const message = await readError(response, "Failed to load packing recommendation");
        throw new Error(message);
      }

      setPackingResponse((await response.json()) as PackingResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load packing recommendation",
      );
    } finally {
      setIsLoadingPacking(false);
    }
  }

  function handleSelectAssignment(assignmentId: string) {
    const assignment = assignments.find((item) => item.id === assignmentId);
    setSelectedAssignment(assignmentId);
    void loadAssignmentVehicles(assignmentId);

    if (assignment) {
      void loadPackingRecommendation(assignment.projects.id);
    }
  }

  function applyVehicleRecommendation(vehicleId: string, cubicMeters: number) {
    setSelectedVehicle(vehicleId);
    setCubicSpace(String(cubicMeters));
  }

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsAddingVehicle(true);

    try {
      const response = await fetch(
        `/api/delivery/assignments/${selectedAssignment}/vehicles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicleId: selectedVehicle,
            driverId: selectedDriver || null,
            cubicSpaceUsed: parseFloat(cubicSpace) || 0,
          }),
        }
      );

      if (!response.ok) {
        const message = await readError(response, "Failed to add vehicle");
        throw new Error(message);
      }

      loadAssignmentVehicles(selectedAssignment);
      setSelectedVehicle("");
      setSelectedDriver("");
      setCubicSpace("");
      setNotice("Vehicle added to delivery");
      setTimeout(() => setNotice(""), 3000);
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "Failed to add vehicle",
      );
    } finally {
      setIsAddingVehicle(false);
    }
  }

  async function handleCompleteDelivery() {
    if (!selectedAssignment) return;

    setError("");

    try {
      const response = await fetch(
        `/api/delivery/assignments/${selectedAssignment}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            markProjectDelivered: true,
          }),
        }
      );

      if (!response.ok) {
        const message = await readError(response, "Failed to complete delivery");
        throw new Error(message);
      }

      await fetchData();
      setSelectedAssignment("");
      setAssignmentVehicles([]);
      setPackingResponse(null);
      setNotice("Delivery marked as completed");
      setTimeout(() => setNotice(""), 3000);
    } catch (completeError) {
      setError(
        completeError instanceof Error ? completeError.message : "Failed to complete delivery",
      );
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  const availableProjects = projects.filter(
    (p) =>
      !assignments.some(
        (a) => a.project_id === p.id && a.status !== "completed"
      )
  );

  const currentAssignment = assignments.find((a) => a.id === selectedAssignment);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Delivery Management</h1>
        <p className="text-gray-600 mt-1">Assign vehicles and coordinate deliveries</p>
      </div>

      {/* Error and Notice */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Create Assignment */}
        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">New Delivery</h2>

            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Choose project...</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_name} ({p.project_number})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Date (Optional)
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special delivery instructions..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={isCreating || !selectedProject}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isCreating ? "Creating..." : "Create Assignment"}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Assignments and Vehicles */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Assignments */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Active Deliveries</h2>

            <div className="space-y-2">
              {assignments
                .filter((a) => a.status !== "completed")
                .map((assignment) => (
                  <button
                    key={assignment.id}
                    onClick={() => handleSelectAssignment(assignment.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition ${
                      selectedAssignment === assignment.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-semibold">{assignment.projects.project_name}</p>
                    <p className="text-sm text-gray-600">#{assignment.projects.project_number}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Status: {assignment.status}
                    </p>
                  </button>
                ))}
            </div>

            {assignments.filter((a) => a.status !== "completed").length === 0 && (
              <p className="text-gray-500 text-center py-4">No active deliveries</p>
            )}
          </div>

          {/* Vehicle Assignment */}
          {currentAssignment && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Assign Vehicles</h2>

              <div className="mb-4 p-4 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">
                  Client: {currentAssignment.projects.clients.client_name}
                </p>
                <p className="text-sm text-gray-600">
                  Location: {currentAssignment.projects.address}
                </p>
              </div>

              <div className="mb-6 rounded-lg border border-material-outline-variant bg-material-surface-container-low p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Packing recommendation</h3>
                    <p className="mt-1 text-sm text-muted">
                      Based on latest quotation openings, aluminum section depth defaults, and truck cubic capacity.
                    </p>
                  </div>
                  {packingResponse?.quotation && (
                    <span className="material-status">
                      {packingResponse.quotation.quotationNumber}
                    </span>
                  )}
                </div>

                {isLoadingPacking ? (
                  <p className="mt-4 text-sm text-muted">{t("common.loading")}</p>
                ) : packingResponse ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="material-card-muted p-3">
                        <p className="text-xs font-bold uppercase text-muted">Estimated goods</p>
                        <p className="mt-1 text-2xl font-bold">
                          {packingResponse.recommendation.totalCubicMeters.toFixed(2)} m³
                        </p>
                      </div>
                      <div className="material-card-muted p-3">
                        <p className="text-xs font-bold uppercase text-muted">Packing allowance</p>
                        <p className="mt-1 text-2xl font-bold">
                          {packingResponse.recommendation.packingAllowancePercent}%
                        </p>
                      </div>
                      <div className="material-card-muted p-3">
                        <p className="text-xs font-bold uppercase text-muted">Openings</p>
                        <p className="mt-1 text-2xl font-bold">
                          {packingResponse.recommendation.items.length}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-muted-strong">
                      {packingResponse.recommendation.message}
                    </p>

                    {packingResponse.recommendation.recommendedVehicles.length > 0 && (
                      <div className="space-y-2">
                        {packingResponse.recommendation.recommendedVehicles.map((vehicle) => (
                          <div
                            key={vehicle.vehicleId}
                            className="flex flex-col gap-3 rounded-lg border border-material-outline-variant bg-material-surface-container p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="font-semibold">
                                {vehicle.vehicleName}
                                {vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ""}
                              </p>
                              <p className="text-sm text-muted">
                                Load {vehicle.assignedCubicMeters.toFixed(2)} m³ of {vehicle.capacityCubicMeters.toFixed(2)} m³
                                {" "}({vehicle.utilizationPercent}%)
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                applyVehicleRecommendation(
                                  vehicle.vehicleId,
                                  vehicle.assignedCubicMeters,
                                )
                              }
                              className="material-button-tonal"
                            >
                              Use this truck
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {packingResponse.recommendation.unassignedCubicMeters > 0 && (
                      <div className="material-alert-error">
                        Remaining unfitted volume:{" "}
                        {packingResponse.recommendation.unassignedCubicMeters.toFixed(2)} m³
                      </div>
                    )}

                    {packingResponse.recommendation.items.length > 0 && (
                      <details className="rounded-lg border border-material-outline-variant bg-material-surface-container p-3">
                        <summary className="cursor-pointer text-sm font-bold">
                          View estimated quotation goods
                        </summary>
                        <div className="mt-3 space-y-2">
                          {packingResponse.recommendation.items.map((item) => (
                            <div
                              key={item.id}
                              className="grid gap-2 rounded-md bg-material-surface-container-low p-3 text-sm sm:grid-cols-[1fr_auto]"
                            >
                              <div>
                                <p className="font-semibold">
                                  {item.openingCode} - {item.productSystem}
                                </p>
                                <p className="text-muted">
                                  {item.location || "No location"} - {item.glassType}
                                </p>
                                <p className="text-muted">
                                  {item.widthMeters.toFixed(2)}m x {item.heightMeters.toFixed(2)}m x {item.quantity}
                                  {" "}section {item.sectionDepthMm}mm
                                </p>
                              </div>
                              <p className="font-bold">
                                {item.estimatedCubicMeters.toFixed(2)} m³
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">
                    Select an active delivery to calculate quotation goods and truck fit.
                  </p>
                )}
              </div>

              <form onSubmit={handleAddVehicle} className="space-y-4 mb-6 pb-6 border-b">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vehicle
                  </label>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select vehicle...</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_name} ({v.cubic_size}m³)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Driver (Optional)
                  </label>
                  <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select driver...</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.driver_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cubic Space Used (m³)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cubicSpace}
                    onChange={(e) => setCubicSpace(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAddingVehicle || !selectedVehicle}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {isAddingVehicle ? "Adding..." : "Add Vehicle"}
                </button>
              </form>

              {/* Assigned Vehicles */}
              <div>
                <h3 className="font-semibold mb-3">Assigned Vehicles</h3>
                <div className="space-y-2">
                  {assignmentVehicles.map((dv) => (
                    <div key={dv.id} className="p-3 bg-gray-50 rounded-lg border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{dv.vehicles.vehicle_name}</p>
                          <p className="text-sm text-gray-600">
                            Used: {dv.cubic_space_used}m³ / Available: {dv.cubic_space_available}m³
                          </p>
                          {dv.drivers && (
                            <p className="text-sm text-gray-600">
                              Driver: {dv.drivers.driver_name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm">
                            {((dv.cubic_space_used / dv.vehicles.cubic_size) * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {assignmentVehicles.length > 0 && (
                  <button
                    onClick={handleCompleteDelivery}
                    className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Mark Delivery as Completed
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
