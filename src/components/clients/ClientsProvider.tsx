"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import type { Client } from "@/data/ui";
import { roleHasCapability } from "@/lib/auth/capabilities";
import {
  invalidateClientData,
  loadCachedClientData,
} from "@/lib/clientRequestCache";

type ClientInput = Omit<Client, "id">;

type ClientsContextValue = {
  clients: Client[];
  isLoading: boolean;
  error: string;
  refreshClients: () => Promise<void>;
  createClient: (client: ClientInput) => Promise<void>;
  updateClient: (id: string, client: ClientInput) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  findClient: (id: string) => Client | undefined;
};

const ClientsContext = createContext<ClientsContextValue | null>(null);

type ClientRow = {
  id: string;
  client_name: string;
  mobile: string | null;
  alternate_mobile: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  email: string | null;
  notes: string | null;
  location_latitude: number | string | null;
  location_longitude: number | string | null;
};

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    clientName: row.client_name,
    mobile: row.mobile ?? "",
    alternateMobile: row.alternate_mobile ?? "",
    address: row.address ?? "",
    province: row.province ?? "",
    city: row.city ?? "",
    email: row.email ?? "",
    notes: row.notes ?? "",
    locationLatitude:
      row.location_latitude === null ? null : Number(row.location_latitude),
    locationLongitude:
      row.location_longitude === null ? null : Number(row.location_longitude),
  };
}

function toClientInsert(client: ClientInput, userId?: string) {
  return {
    client_name: client.clientName,
    mobile: client.mobile || null,
    alternate_mobile: client.alternateMobile || null,
    address: client.address || null,
    province: client.province || null,
    city: client.city || null,
    email: client.email || null,
    notes: client.notes || null,
    location_latitude: client.locationLatitude ?? null,
    location_longitude: client.locationLongitude ?? null,
    created_by: userId ?? null,
  };
}

function toClientUpdate(client: ClientInput) {
  return {
    client_name: client.clientName,
    mobile: client.mobile || null,
    alternate_mobile: client.alternateMobile || null,
    address: client.address || null,
    province: client.province || null,
    city: client.city || null,
    email: client.email || null,
    notes: client.notes || null,
    location_latitude: client.locationLatitude ?? null,
    location_longitude: client.locationLongitude ?? null,
  };
}

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: isRoleLoaded, role, userId } = useCurrentRole();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const canLoadClients = roleHasCapability(role, "clients:create");

  const loadClients = useCallback(async (force = false) => {
    if (!isRoleLoaded) {
      return;
    }

    if (!canLoadClients) {
      setClients([]);
      setError("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const nextClients = await loadCachedClientData(
        `clients:${userId ?? "anonymous"}`,
        async () => {
          const response = await fetch("/api/clients");
          const body = (await response.json().catch(() => null)) as
            | { clients?: ClientRow[]; error?: string }
            | null;

          if (!response.ok) {
            throw new Error(body?.error ?? "Unable to load clients.");
          }

          return (body?.clients ?? []).map(mapClient);
        },
        { force, ttlMs: 30_000 },
      );
      setClients(nextClients);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load clients.",
      );
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  }, [canLoadClients, isRoleLoaded, userId]);

  const refreshClients = useCallback(async () => {
    await loadClients(true);
  }, [loadClients]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadClients();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadClients]);

  const createClient = useCallback(
    async (client: ClientInput) => {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toClientInsert(client)),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save client."));
      }

      invalidateClientData(`clients:${userId ?? "anonymous"}`);
      await refreshClients();
    },
    [refreshClients, userId],
  );

  const updateClient = useCallback(
    async (id: string, client: ClientInput) => {
      const response = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...toClientUpdate(client) }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save client."));
      }

      invalidateClientData(`clients:${userId ?? "anonymous"}`);
      await refreshClients();
    },
    [refreshClients, userId],
  );

  const deleteClient = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/clients?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to delete client."));
      }

      invalidateClientData(`clients:${userId ?? "anonymous"}`);
      await refreshClients();
    },
    [refreshClients, userId],
  );

  const findClient = useCallback(
    (id: string) => clients.find((client) => client.id === id),
    [clients],
  );

  const value = useMemo(
    () => ({
      clients,
      isLoading,
      error,
      refreshClients,
      createClient,
      updateClient,
      deleteClient,
      findClient,
    }),
    [
      clients,
      isLoading,
      error,
      refreshClients,
      createClient,
      updateClient,
      deleteClient,
      findClient,
    ],
  );

  return (
    <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientsContext);

  if (!context) {
    throw new Error("useClients must be used inside ClientsProvider");
  }

  return context;
}
