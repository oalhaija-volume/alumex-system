"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { clients as initialClients, type Client } from "@/data/ui";

type ClientInput = Omit<Client, "id">;
const clientsStorageKey = "alumex-local-clients";

type ClientsContextValue = {
  clients: Client[];
  createClient: (client: ClientInput) => void;
  updateClient: (id: string, client: ClientInput) => void;
  deleteClient: (id: string) => void;
  findClient: (id: string) => Client | undefined;
};

const ClientsContext = createContext<ClientsContextValue | null>(null);

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "client"
  );
}

function createId(clientName: string, existingClients: Client[]) {
  const base = slugify(clientName);
  const exists = new Set(existingClients.map((client) => client.id));

  if (!exists.has(base)) {
    return base;
  }

  let index = 2;
  while (exists.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedClients = window.localStorage.getItem(clientsStorageKey);

      if (storedClients) {
        setClients(JSON.parse(storedClients) as Client[]);
      }

      setHasLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(clientsStorageKey, JSON.stringify(clients));
    }
  }, [clients, hasLoaded]);

  const createClient = useCallback((client: ClientInput) => {
    setClients((currentClients) => {
      const createdClient = {
        ...client,
        id: createId(client.clientName, currentClients),
      };

      return [createdClient, ...currentClients];
    });
  }, []);

  const updateClient = useCallback((id: string, client: ClientInput) => {
    setClients((currentClients) =>
      currentClients.map((currentClient) =>
        currentClient.id === id ? { ...client, id } : currentClient,
      ),
    );
  }, []);

  const deleteClient = useCallback((id: string) => {
    setClients((currentClients) =>
      currentClients.filter((client) => client.id !== id),
    );
  }, []);

  const findClient = useCallback(
    (id: string) => clients.find((client) => client.id === id),
    [clients],
  );

  const value = useMemo(
    () => ({
      clients,
      createClient,
      updateClient,
      deleteClient,
      findClient,
    }),
    [clients, createClient, updateClient, deleteClient, findClient],
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
