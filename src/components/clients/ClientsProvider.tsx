"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Client } from "@/data/ui";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

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
};

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

function logSupabaseError(action: string, error: unknown) {
  console.error(`[ClientsProvider] ${action} failed`, error);
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
  };
}

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshClients = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const supabase = createSupabaseClient();
      const { data, error: loadError } = await supabase
        .from("clients")
        .select(
          "id, client_name, mobile, alternate_mobile, address, province, city, email, notes",
        )
        .order("created_at", { ascending: false });

      if (loadError) {
        logSupabaseError("load clients", loadError);
        throw loadError;
      }

      setClients(((data ?? []) as ClientRow[]).map(mapClient));
    } catch (loadError) {
      setError(friendlyDatabaseError(loadError, "Unable to load clients."));
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshClients();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshClients]);

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

      await refreshClients();
    },
    [refreshClients],
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

      await refreshClients();
    },
    [refreshClients],
  );

  const deleteClient = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/clients?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to delete client."));
      }

      await refreshClients();
    },
    [refreshClients],
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
