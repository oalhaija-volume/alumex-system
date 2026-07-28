"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { SectionCard } from "@/components/SectionCard";
import {
  calculateLineTotal,
  calculateQuotationTotals,
  pricingUnitForLine,
  quotationStorageKey,
  type QuotationDraft,
  type QuotationLine,
} from "@/components/quotations/quotationTypes";
import {
  deleteSupabaseQuotation,
  invalidateQuotationsCache,
  loadSupabaseQuotations,
  transitionQuotationVersion,
} from "@/components/quotations/supabaseQuotations";
import type { Project } from "@/data/ui";
import { canViewSalesPrices } from "@/lib/auth/roles";
import {
  clampDiscount,
  discountLimitForRole,
  loadProductPrices,
  normalizeProductName,
  productPriceForSystem,
  productPricingSource,
  productsForCatalog,
  type ProductPrice,
} from "@/lib/pricing/productPricing";
import {
  discountLimitFromPolicies,
  loadDiscountPolicies,
} from "@/lib/pricing/discountPolicy";

function createQuotationLines(
  projectId: string,
  projects: Project[],
  products: ProductPrice[],
): QuotationLine[] {
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return [];
  }

  return project.structuralOpenings.map((opening) => ({
    ...opening,
    unitPrice: productPriceForSystem(opening.productSystem, products),
    discountPercent: 0,
    lineType: "base",
    isDiscountable: true,
  }));
}

function formatQuotationNumber(year: number, sequence: number) {
  return `Q-${year}-${sequence.toString().padStart(4, "0")}`;
}

function nextQuotationNumberFromList(quotationNumbers: string[]) {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const highestSequence = quotationNumbers.reduce((highest, quotationNumber) => {
    if (!quotationNumber.startsWith(prefix)) {
      return highest;
    }

    const sequence = Number(quotationNumber.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return formatQuotationNumber(year, highestSequence + 1);
}

async function fetchNextQuotationNumber() {
  const response = await fetch("/api/quotations/next-number", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    quotationNumber?: string;
    error?: string;
  } | null;

  if (!response.ok || !body?.quotationNumber) {
    throw new Error(body?.error ?? "Unable to generate quotation number.");
  }

  return body.quotationNumber;
}

type ProjectCostingPrice = {
  aluminumSystemName: string | null;
  totalPrice: number;
  updatedAt: string;
};

async function fetchProjectCostingPrice(projectId: string) {
  if (!projectId) {
    return null;
  }

  const response = await fetch(
    `/api/quotations/costing-price?projectId=${encodeURIComponent(projectId)}`,
    { cache: "no-store" },
  );
  const body = (await response.json().catch(() => null)) as {
    costing?: ProjectCostingPrice | null;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load the project costing price.");
  }

  return body?.costing ?? null;
}

function comparableSystemName(value: string) {
  return normalizeProductName(value).replace(/\bsystem\b/g, "").trim();
}

async function saveQuotation(payload: {
  id?: string;
  project_id: string;
  client_id: string;
  quotation_discount_percent: number;
  subtotal: number;
  line_discount_total: number;
  quotation_discount_total: number;
  grand_total: number;
  notes: string;
  prepared_by_text: string | null;
  client_representative: string | null;
  items: Array<{
    opening_id: string;
    opening_code: string;
    floor: string | null;
    room: string | null;
    width: number;
    height: number;
    solid_panel_height: number;
    quantity: number;
    product_system: string | null;
    glass_type: string | null;
    aluminum_color: string | null;
    unit_price: number;
    discount_percent: number;
    line_type: "base" | "service" | "addon" | "accessory";
    is_discountable: boolean;
    notes: string | null;
  }>;
}) {
  const response = await fetch("/api/quotations", {
    method: payload.id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as {
    quotation?: {
      id: string;
      quotation_number: string;
      version_id: string;
      version_number: number;
      version_status: QuotationDraft["versionStatus"];
      created_at?: string | null;
    };
    error?: string;
  } | null;

  if (!response.ok || !body?.quotation) {
    throw new Error(body?.error ?? "Unable to save quotation.");
  }

  invalidateQuotationsCache();
  return body.quotation;
}

export function QuotationBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { formatCurrency, t, term } = useI18n();
  const { role } = useCurrentRole();
  const { clients } = useClients();
  const { projects } = useProjects();
  const builderFormRef = useRef<HTMLDivElement | null>(null);
  const requestedProjectId = searchParams.get("projectId") ?? "";
  const initialProjectId =
    projects.find((project) => project.id === requestedProjectId)?.id ??
    projects[0]?.id ??
    "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const [quotationNumber, setQuotationNumber] = useState(() =>
    nextQuotationNumberFromList([]),
  );
  const [discountPercent, setDiscountPercent] = useState(0);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(() => t("quotations.defaultNotes"));
  const [preparedBy, setPreparedBy] = useState(() =>
    t("quotations.defaultPreparedBy"),
  );
  const [clientRepresentative, setClientRepresentative] = useState("");
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [productPrices, setProductPrices] = useState<ProductPrice[]>([]);
  const [projectCostingPrice, setProjectCostingPrice] =
    useState<ProjectCostingPrice | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [selectedSystemName, setSelectedSystemName] = useState("");
  const [customSystemName, setCustomSystemName] = useState("");
  const [selectedVariantName, setSelectedVariantName] = useState("");
  const [serviceSpecification, setServiceSpecification] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [selectedAddonName, setSelectedAddonName] = useState("");
  const [addonTargetLineId, setAddonTargetLineId] = useState("");
  const [addonSpecification, setAddonSpecification] = useState("");
  const [addonQuantity, setAddonQuantity] = useState(1);
  const [discountLimit, setDiscountLimit] = useState(() =>
    discountLimitForRole(role),
  );
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuotationDraft | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lines, setLines] = useState<QuotationLine[]>(() =>
    createQuotationLines(initialProjectId, projects, []),
  );
  const selectedProject = projects.find((project) => project.id === projectId);
  const hasClients = clients.length > 0;
  const hasProjects = projects.length > 0;
  const hasProjectsWithOpenings = projects.some(
    (project) => project.structuralOpenings.length > 0,
  );
  const canCreateQuotation =
    hasClients && hasProjects && hasProjectsWithOpenings;
  const existingProjectQuotation = selectedProject
    ? savedQuotations.find((quotation) => quotation.project.id === selectedProject.id)
    : undefined;
  const isEditingExistingQuotation = Boolean(editingQuotationId);
  const canShowBuilder = canCreateQuotation || isEditingExistingQuotation;
  const canDeleteQuotations = canViewSalesPrices(role);
  const displayedQuotationNumber =
    isEditingExistingQuotation
      ? quotationNumber
      : existingProjectQuotation?.quotationNumber ?? quotationNumber;
  const totals = useMemo(
    () => calculateQuotationTotals(lines, discountPercent),
    [lines, discountPercent],
  );
  const servicePrices = useMemo(
    () => productsForCatalog(productPrices, "service", true),
    [productPrices],
  );
  const systemPrices = useMemo(
    () => productsForCatalog(productPrices, "aluminum_system", true),
    [productPrices],
  );
  const serviceVariants = useMemo(
    () => productsForCatalog(productPrices, "service_variant", true),
    [productPrices],
  );
  const claddingMaterials = useMemo(
    () => productsForCatalog(productPrices, "cladding_material", true),
    [productPrices],
  );
  const addonPrices = useMemo(
    () => productsForCatalog(productPrices, "addon", true),
    [productPrices],
  );
  const selectedService = servicePrices.find(
    (service) => service.product_name === selectedServiceName,
  );
  const selectedSystem = systemPrices.find(
    (system) => system.product_name === selectedSystemName,
  );
  const selectedSystemUsesCosting = selectedSystem
    ? productPricingSource(selectedSystem) === "project_costing"
    : false;
  const selectedAddon = addonPrices.find(
    (addon) => addon.product_name === selectedAddonName,
  );
  const requiresAluminumSystem = [
    "Windows & Doors",
    "Curtain Wall",
    "Skylight",
  ].includes(selectedServiceName);
  const availableVariants =
    selectedServiceName === "Cladding"
      ? claddingMaterials
      : selectedServiceName === "Roller Shutters"
        ? serviceVariants.filter((item) =>
            item.product_name.startsWith("Roller Shutter -"),
          )
        : selectedServiceName === "Photocell Doors"
          ? serviceVariants.filter((item) =>
              item.product_name.startsWith("Photocell Door -"),
            )
          : [];

  const loadProject = useCallback((nextProjectId: string) => {
    setProjectId(nextProjectId);
    setLines(createQuotationLines(nextProjectId, projects, productPrices));
    setEditingQuotationId(null);
    setError("");
  }, [productPrices, projects]);

  const refreshSavedQuotations = useCallback(async () => {
    const quotations = await loadSupabaseQuotations(projects);
    setSavedQuotations(quotations);
    return quotations;
  }, [projects]);

  const refreshNextQuotationNumber = useCallback(async () => {
    const nextQuotationNumber = await fetchNextQuotationNumber();
    setQuotationNumber(nextQuotationNumber);
    return nextQuotationNumber;
  }, []);

  const refreshProductPrices = useCallback(async () => {
    const products = await loadProductPrices();

    setProductPrices(products);
    return products;
  }, []);

  const refreshDiscountPolicies = useCallback(async () => {
    const policies = await loadDiscountPolicies();
    const nextLimit = discountLimitFromPolicies(role, policies);

    setDiscountLimit(nextLimit);
    setDiscountPercent((current) => clampDiscount(current, nextLimit));
    setLines((currentLines) =>
      currentLines.map((line) => ({
        ...line,
        discountPercent:
          (line.isDiscountable ?? line.lineType === "base")
            ? clampDiscount(line.discountPercent, nextLimit)
            : 0,
      })),
    );
  }, [role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (editingQuotationId) {
        return;
      }

      const nextProjectId =
        projects.find((project) => project.id === requestedProjectId)?.id ??
        (projectId && projects.some((project) => project.id === projectId)
          ? projectId
          : projects[0]?.id ?? "");

      if (nextProjectId !== projectId) {
        loadProject(nextProjectId);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editingQuotationId, loadProject, projectId, projects, requestedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const [, , nextProducts, , nextCostingPrice] = await Promise.all([
          refreshSavedQuotations(),
          refreshNextQuotationNumber(),
          refreshProductPrices().catch(() => []),
          refreshDiscountPolicies().catch(() => undefined),
          fetchProjectCostingPrice(projectId).catch(() => null),
        ]);

        setProjectCostingPrice(nextCostingPrice);

        if (!editingQuotationId) {
          setLines(createQuotationLines(projectId, projects, nextProducts));
        }
      } catch (loadError) {
        setSavedQuotations([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("quotations.saveError"),
        );
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    editingQuotationId,
    projectId,
    projects,
    refreshDiscountPolicies,
    refreshNextQuotationNumber,
    refreshProductPrices,
    refreshSavedQuotations,
    t,
  ]);

  function updateLine(
    lineId: string,
    key: "unitPrice" | "discountPercent",
    value: number,
  ) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [key]:
                key === "discountPercent"
                  ? (line.isDiscountable ?? line.lineType === "base")
                    ? clampDiscount(value, discountLimit)
                    : 0
                  : Number.isFinite(value)
                    ? value
                    : 0,
            }
          : line,
      ),
    );
  }

  function updateScopeLine(
    lineId: string,
    key: "openingCode" | "productSystem" | "notes",
    value: string,
  ) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.id === lineId ? { ...line, [key]: value } : line,
      ),
    );
  }

  function updateScopeQuantity(lineId: string, quantity: number) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.id === lineId
          ? pricingUnitForLine(line)
            ? {
                ...line,
                width: 100,
                height: Math.max(Number(quantity) || 1, 0.01) * 100,
                quantity: 1,
              }
            : { ...line, quantity: Math.max(Math.round(Number(quantity) || 1), 1) }
          : line,
      ),
    );
  }

  function addScopeLine(lineType: "addon" | "accessory") {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${lineType}-${Date.now()}`;

    setLines((currentLines) => [
      ...currentLines,
      {
        id,
        floor: "Project description",
        room: lineType === "addon" ? "Add-on" : "Accessory",
        openingCode: lineType === "addon" ? "ADD-ON" : "ACC",
        width: 100,
        height: 100,
        solidPanelHeight: 0,
        quantity: 1,
        productSystem: "",
        glassType: "",
        aluminumColor: "",
        notes: "",
        unitPrice: 0,
        discountPercent: 0,
        lineType,
        isDiscountable: false,
      },
    ]);
  }

  function addCatalogService() {
    const service = selectedService;

    if (!service) {
      setError(t("quotations.selectServiceRequired"));
      return;
    }

    const system = selectedSystem;
    const variant = availableVariants.find(
      (product) => product.product_name === selectedVariantName,
    );
    const needsVariant = availableVariants.length > 0;
    const isOtherSystem = selectedSystemName === "Other System";
    const usesProjectCosting = system
      ? productPricingSource(system) === "project_costing"
      : false;
    const effectiveSystemName = isOtherSystem
      ? customSystemName.trim()
      : system?.product_name ?? "";

    if (requiresAluminumSystem && !system) {
      setError("Select the aluminum system for this service.");
      return;
    }

    if (isOtherSystem && !customSystemName.trim()) {
      setError("Enter the name of the other aluminum system.");
      return;
    }

    if (
      usesProjectCosting &&
      (!projectCostingPrice || projectCostingPrice.totalPrice <= 0)
    ) {
      setError(
        "This aluminum system must be priced through Project Costing. Save the project costing before adding it to the quotation.",
      );
      return;
    }

    if (
      usesProjectCosting &&
      lines.some((line) => line.notes.includes("Price source: Project costing"))
    ) {
      setError(
        "This quotation already includes the project costing price. Remove that costing line before adding another.",
      );
      return;
    }

    if (
      usesProjectCosting &&
      projectCostingPrice?.aluminumSystemName &&
      comparableSystemName(projectCostingPrice.aluminumSystemName) !==
        comparableSystemName(effectiveSystemName)
    ) {
      setError(
        `The saved costing is for ${projectCostingPrice.aluminumSystemName}. Update Project Costing for ${effectiveSystemName} before adding it.`,
      );
      return;
    }

    if (needsVariant && !variant) {
      setError("Select the service variant or cladding material.");
      return;
    }

    if (
      ["Frontek", "Natural Stone", "Swiss Pearl"].includes(
        variant?.product_name ?? "",
      ) &&
      !serviceSpecification.trim()
    ) {
      setError("Enter the material model, type, or color.");
      return;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `service-${Date.now()}`;

    setLines((currentLines) => [
      ...currentLines,
      {
        id,
        floor: t("quotations.projectScope"),
        room: t("settings.services"),
        openingCode: "SRV",
        width: 100,
        height: usesProjectCosting
          ? 100
          : Math.max(serviceQuantity, 0.01) * 100,
        solidPanelHeight: 0,
        quantity: 1,
        productSystem: [
          service.product_name,
          system
            ? effectiveSystemName
            : "",
          variant?.product_name ?? "",
        ]
          .filter(Boolean)
          .join(" — "),
        glassType: "",
        aluminumColor: "",
        notes: [
          `Pricing unit: ${usesProjectCosting ? "project" : service.unit}`,
          usesProjectCosting ? "Price source: Project costing" : "",
          serviceSpecification.trim(),
        ]
          .filter(Boolean)
          .join("; "),
        unitPrice: usesProjectCosting
          ? projectCostingPrice?.totalPrice ?? 0
          : service.unit_price +
            (system?.unit_price ?? 0) +
            (variant?.unit_price ?? 0),
        discountPercent: 0,
        lineType: "service",
        isDiscountable: true,
      },
    ]);
    setSelectedServiceName("");
    setSelectedSystemName("");
    setCustomSystemName("");
    setSelectedVariantName("");
    setServiceSpecification("");
    setServiceQuantity(1);
    setError("");
  }

  function addCatalogAddon() {
    const addon = addonPrices.find(
      (product) => product.product_name === selectedAddonName,
    );

    if (!addon) {
      setError("Select an add-on.");
      return;
    }
    const targetLine = lines.find((line) => line.id === addonTargetLineId);

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `addon-${Date.now()}`;

    setLines((currentLines) => [
      ...currentLines,
      {
        id,
        floor: t("quotations.projectScope"),
        room: "Add-on",
        openingCode: "ADD-ON",
        width: 100,
        height: Math.max(addonQuantity, 0.01) * 100,
        solidPanelHeight: 0,
        quantity: 1,
        productSystem: addon.product_name,
        glassType: "",
        aluminumColor: "",
        notes: [
          `Pricing unit: ${addon.unit}`,
          targetLine
            ? `Applied to: ${targetLine.openingCode} ${targetLine.productSystem}`
            : "",
          addonSpecification.trim(),
        ]
          .filter(Boolean)
          .join("; "),
        unitPrice: addon.unit_price,
        discountPercent: 0,
        lineType: "addon",
        isDiscountable: false,
      },
    ]);
    setSelectedAddonName("");
    setAddonTargetLineId("");
    setAddonSpecification("");
    setAddonQuantity(1);
    setError("");
  }

  function removeScopeLine(lineId: string) {
    setLines((currentLines) =>
      currentLines.filter((line) => line.id !== lineId || line.lineType === "base"),
    );
  }

  function viewQuotation(quotation: QuotationDraft) {
    window.localStorage.setItem(quotationStorageKey, JSON.stringify(quotation));
    router.push("/quotations/preview");
  }

  async function editQuotation(quotation: QuotationDraft) {
    if (!quotation.id) {
      setError("Unable to load quotation for editing.");
      return;
    }

    setError("");

    try {
      const quotations = await refreshSavedQuotations();
      const latestQuotation = quotations.find(
        (item) => item.id === quotation.id,
      );

      if (!latestQuotation) {
        setError("Quotation was not found.");
        return;
      }

      setProjectId(latestQuotation.project.id);
      setQuotationNumber(latestQuotation.quotationNumber);
      setDiscountPercent(
        clampDiscount(latestQuotation.discountPercent, discountLimit),
      );
      setNotes(latestQuotation.notes);
      setPreparedBy(latestQuotation.preparedBy);
      setClientRepresentative(latestQuotation.clientRepresentative);
      setLines(
        latestQuotation.lines.map((line) => {
          const isDiscountable =
            line.isDiscountable ??
            !["addon", "accessory"].includes(line.lineType ?? "base");

          return {
            ...line,
            discountPercent: isDiscountable
              ? clampDiscount(line.discountPercent, discountLimit)
              : 0,
          };
        }),
      );
      setEditingQuotationId(latestQuotation.id ?? null);
      window.requestAnimationFrame(() => {
        builderFormRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load quotation for editing.",
      );
    }
  }

  async function runQuotationAction(
    quotation: QuotationDraft,
    action: "mark_ready" | "present" | "send" | "approve",
  ) {
    if (!quotation.versionId) {
      setError("Quotation version information is missing.");
      return;
    }

    setError("");
    try {
      await transitionQuotationVersion(quotation.versionId, action);
      await refreshSavedQuotations();
    } catch (workflowError) {
      setError(
        workflowError instanceof Error
          ? workflowError.message
          : "Unable to update the quotation version.",
      );
    }
  }

  async function openPreview() {
    setError("");

    if (existingProjectQuotation && !isEditingExistingQuotation) {
      viewQuotation(existingProjectQuotation);
      return;
    }

    if (!selectedProject || lines.length === 0) {
      setError(t("quotations.validationRequired"));
      return;
    }

    if (!selectedProject.clientId) {
      setError(t("quotations.missingClient"));
      return;
    }

    if (
      discountPercent > discountLimit ||
      lines.some((line) => line.discountPercent > discountLimit)
    ) {
      setError(t("quotations.discountLimitError", { limit: discountLimit }));
      return;
    }

    try {
      const quotation = await saveQuotation({
        id: isEditingExistingQuotation ? editingQuotationId ?? undefined : undefined,
        project_id: selectedProject.id,
        client_id: selectedProject.clientId,
        quotation_discount_percent: discountPercent,
        subtotal: totals.subtotal,
        line_discount_total: totals.lineDiscountTotal,
        quotation_discount_total: totals.quotationDiscount,
        grand_total: totals.grandTotal,
        notes,
        prepared_by_text: preparedBy || null,
        client_representative: clientRepresentative || null,
        items: lines.map((line) => ({
          opening_id: (line.lineType ?? "base") === "base" ? line.id : "",
          opening_code: line.openingCode,
          floor: line.floor || null,
          room: line.room || null,
          width: line.width,
          height: line.height,
          solid_panel_height: line.solidPanelHeight ?? 0,
          quantity: line.quantity,
          product_system: line.productSystem || null,
          glass_type: line.glassType || null,
          aluminum_color: line.aluminumColor || null,
          unit_price: line.unitPrice,
          discount_percent:
            (line.isDiscountable ?? line.lineType === "base")
              ? line.discountPercent
              : 0,
          line_type: line.lineType ?? "base",
          is_discountable:
            line.isDiscountable ??
            !["addon", "accessory"].includes(line.lineType ?? "base"),
          notes: line.notes || null,
        })),
      });

      setQuotationNumber(quotation.quotation_number);

      const draft: QuotationDraft = {
        id: quotation.id,
        versionId: quotation.version_id,
        versionNumber: quotation.version_number,
        versionStatus: quotation.version_status,
        quotationNumber: quotation.quotation_number,
        project: selectedProject,
        lines,
        discountPercent,
        notes,
        preparedBy,
        clientRepresentative,
        pricingSource: lines.some((line) =>
          line.notes.toLowerCase().includes("price source: project costing"),
        )
          ? "project_costing"
          : "catalog",
        savedAt: quotation.created_at ?? new Date().toISOString(),
      };

      window.localStorage.setItem(quotationStorageKey, JSON.stringify(draft));
      setEditingQuotationId(null);
      await refreshSavedQuotations();
      router.push("/quotations/preview");
    } catch (saveError) {
      console.error("[QuotationBuilder] save quotation failed", saveError);
      setError(
        saveError instanceof Error ? saveError.message : t("quotations.saveError"),
      );
    }
  }

  async function confirmDeleteQuotation() {
    if (!deleteTarget?.id) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await deleteSupabaseQuotation(deleteTarget.id);
      await refreshSavedQuotations();
      await refreshNextQuotationNumber();
      if (editingQuotationId === deleteTarget.id) {
        setEditingQuotationId(null);
      }
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("quotations.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("quotations.eyebrow")}
        title={t("quotations.builder")}
        description={t("quotations.builderDescription")}
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <SectionCard title={t("quotations.savedQuotations")}>
        {savedQuotations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
            {t("quotations.noSavedQuotations")}
          </p>
        ) : (
          <div className="grid gap-3">
            {savedQuotations.map((quotation) => {
              const quotationTotals = calculateQuotationTotals(
                quotation.lines,
                quotation.discountPercent,
              );

              return (
                <div
                  key={quotation.id ?? quotation.quotationNumber}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {quotation.quotationNumber} · v{quotation.versionNumber ?? 1}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {term(quotation.project.projectName)} -{" "}
                      {formatCurrency(quotationTotals.grandTotal)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-primary">
                      {quotation.pricingSource === "project_costing"
                        ? "Costing-based quotation"
                        : "Catalog quotation"}
                    </p>
                    <p className="mt-1 text-xs font-semibold capitalize text-muted-strong">
                      {(quotation.versionStatus ?? "draft").replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => viewQuotation(quotation)}
                      className="h-10 rounded-md border border-blue-100 bg-blue-50 px-3 text-sm font-bold text-[var(--alumex-blue)]"
                    >
                      {t("quotations.viewQuotation")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void editQuotation(quotation)}
                      className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground transition hover:border-primary"
                    >
                      {t("quotations.editQuotation")}
                    </button>
                    {quotation.versionStatus === "draft" ? (
                      <button
                        type="button"
                        onClick={() => void runQuotationAction(quotation, "mark_ready")}
                        className="h-10 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-800"
                      >
                        Mark ready
                      </button>
                    ) : null}
                    {quotation.versionStatus === "ready_for_review" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void runQuotationAction(quotation, "present")}
                          className="h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-800"
                        >
                          Mark presented
                        </button>
                        <button
                          type="button"
                          onClick={() => void runQuotationAction(quotation, "send")}
                          className="h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-800"
                        >
                          Mark sent
                        </button>
                      </>
                    ) : null}
                    {quotation.versionStatus === "presented" ? (
                      <button
                        type="button"
                        onClick={() => void runQuotationAction(quotation, "send")}
                        className="h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-800"
                      >
                        Mark sent
                      </button>
                    ) : null}
                    {["draft", "ready_for_review", "presented", "sent"].includes(
                      quotation.versionStatus ?? "draft",
                    ) && ["Admin", "Sales Manager", "Indoor Sales"].includes(role ?? "") ? (
                      <button
                        type="button"
                        onClick={() => void runQuotationAction(quotation, "approve")}
                        className="h-10 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-800"
                      >
                        Approve version
                      </button>
                    ) : null}
                    {quotation.versionStatus === "approved" &&
                    quotation.versionId ? (
                      <Link
                        href={`/quotations?view=contracts&quotationVersionId=${encodeURIComponent(
                          quotation.versionId,
                        )}`}
                        className="flex h-10 items-center rounded-md bg-primary px-3 text-sm font-bold text-white"
                      >
                        {t("quotations.createContract")}
                      </Link>
                    ) : null}
                  {canDeleteQuotations ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(quotation)}
                      className="h-10 rounded-md border border-danger-text bg-transparent px-3 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
                    >
                      {t("quotations.deleteQuotation")}
                    </button>
                  ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {!canCreateQuotation && !isEditingExistingQuotation ? (
        <SectionCard title={t("quotations.beforeCreateQuotation")}>
          <div className="space-y-4 rounded-lg border border-dashed border-border bg-surface-muted p-5">
            <p className="text-sm font-bold text-foreground">
              {t("quotations.prerequisitesTitle")}
            </p>
            <p className="text-sm leading-6 text-muted">
              {!hasClients
                ? t("quotations.noClientsPrerequisite")
                : !hasProjects
                  ? t("quotations.noProjectsPrerequisite")
                  : t("quotations.noOpeningsPrerequisite")}
            </p>
            <div className="flex flex-wrap gap-2">
              {!hasClients ? (
                <Link
                  href="/intake"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
                >
                  {t("clients.newClient")}
                </Link>
              ) : null}
              {!hasProjects ? (
                <Link
                  href="/intake"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
                >
                  {t("projects.startIntake")}
                </Link>
              ) : null}
              {hasProjects && !hasProjectsWithOpenings ? (
                <Link
                  href="/projects"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
                >
                  {t("projects.openings.addOpening")}
                </Link>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {canShowBuilder ? (
        <div ref={builderFormRef} className="space-y-6">
      <SectionCard title={t("quotations.projectSelection")}>
        {isEditingExistingQuotation ? (
          <p className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-[var(--alumex-blue)]">
            Editing quotation {quotationNumber}. Save with Update Quotation.
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("quotations.selectProject")}
            </span>
            <select
              value={projectId}
              onChange={(event) => loadProject(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectNumber} - {term(project.projectName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("quotations.quotationNumber")}
            </span>
            <input
              value={displayedQuotationNumber}
              readOnly
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={openPreview}
            disabled={!selectedProject || lines.length === 0}
            className="h-11 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--alumex-blue-dark)] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {existingProjectQuotation && !isEditingExistingQuotation
              ? t("quotations.viewExistingQuotation")
              : isEditingExistingQuotation
                ? "Update Quotation"
                : t("quotations.createQuotation")}
          </button>
        </div>
      </SectionCard>

      {existingProjectQuotation ? (
        <SectionCard title={t("quotations.existingQuotation")}>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">
                {existingProjectQuotation.quotationNumber}
              </p>
              <p className="mt-1 text-xs text-muted">
                {t("quotations.existingQuotationDescription")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => viewQuotation(existingProjectQuotation)}
                className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white"
              >
                {t("quotations.viewQuotation")}
              </button>
              <button
                type="button"
                onClick={() => void editQuotation(existingProjectQuotation)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground transition hover:border-primary"
              >
                {t("quotations.editQuotation")}
              </button>
              {canDeleteQuotations ? (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(existingProjectQuotation)}
                  className="h-10 rounded-md border border-danger-text bg-transparent px-3 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
                >
                  {t("quotations.deleteQuotation")}
                </button>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {selectedProject ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.clientInformation")}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {term(selectedProject.client)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {term(selectedProject.address)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.projectInformation")}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {term(selectedProject.projectName)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {term(selectedProject.projectType)} - {term(selectedProject.salesEngineer)}
            </p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              {t("quotations.totals")}
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--alumex-blue)]">
              {formatCurrency(totals.grandTotal)}
            </p>
            <p className="mt-1 text-sm text-blue-700">
              {t("quotations.billableArea", {
                area: t("common.areaValue", {
                  value: totals.totalArea.toFixed(2),
                }),
              })}
            </p>
          </div>
        </section>
      ) : null}

      <SectionCard title={t("quotations.openingsAndPricing")}>
        <div className="mb-4 space-y-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div>
            <p className="text-sm font-bold text-[var(--alumex-blue)]">
              {t("quotations.servicesAndExtras")}
            </p>
            <p className="mt-1 text-sm text-blue-700">
              {t("quotations.servicesAndExtrasDescription")}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select
                value={selectedServiceName}
                onChange={(event) => {
                  setSelectedServiceName(event.target.value);
                  setSelectedSystemName("");
                  setCustomSystemName("");
                  setSelectedVariantName("");
                  setServiceSpecification("");
                }}
                disabled={servicePrices.length === 0}
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted"
              >
                <option value="">
                  {servicePrices.length === 0
                    ? t("quotations.noServicesConfigured")
                    : t("quotations.selectService")}
                </option>
                {servicePrices.map((service) => (
                  <option key={service.id ?? service.product_name} value={service.product_name}>
                    {service.product_name} — {formatCurrency(service.unit_price)} / {service.unit}
                  </option>
                ))}
              </select>
              {requiresAluminumSystem ? (
                <select
                  value={selectedSystemName}
                  onChange={(event) => setSelectedSystemName(event.target.value)}
                  className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
                >
                  <option value="">Select aluminum system</option>
                  {systemPrices.map((system) => (
                    <option key={system.id ?? system.product_name} value={system.product_name}>
                      {productPricingSource(system) === "project_costing"
                        ? `${system.product_name} — Project costing`
                        : `${system.product_name} — ${formatCurrency(system.unit_price)} / ${system.unit}`}
                    </option>
                  ))}
                </select>
              ) : null}
              {requiresAluminumSystem && selectedSystemName === "Other System" ? (
                <input
                  value={customSystemName}
                  onChange={(event) => setCustomSystemName(event.target.value)}
                  placeholder="Enter system name"
                  className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
                />
              ) : null}
              {availableVariants.length > 0 ? (
                <select
                  value={selectedVariantName}
                  onChange={(event) => setSelectedVariantName(event.target.value)}
                  className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
                >
                  <option value="">
                    {selectedServiceName === "Cladding"
                      ? "Select cladding material"
                      : "Select service type"}
                  </option>
                  {availableVariants.map((variant) => (
                    <option key={variant.id ?? variant.product_name} value={variant.product_name}>
                      {variant.product_name} — {formatCurrency(variant.unit_price)} / {variant.unit}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={selectedSystemUsesCosting ? 1 : serviceQuantity}
                disabled={selectedSystemUsesCosting}
                onChange={(event) => setServiceQuantity(Math.max(Number(event.target.value) || 1, 0.01))}
                aria-label={selectedSystemUsesCosting ? "Project costing quantity" : "Service billable quantity"}
                placeholder={selectedSystemUsesCosting ? "Priced per project" : "Billable quantity"}
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground disabled:bg-blue-100 disabled:text-blue-700"
              />
              <input
                value={serviceSpecification}
                onChange={(event) => setServiceSpecification(event.target.value)}
                placeholder={
                  ["Frontek", "Natural Stone", "Swiss Pearl"].includes(selectedVariantName)
                    ? "Required model, type, or color"
                    : "Optional specification"
                }
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
              />
              <button
                type="button"
                onClick={addCatalogService}
                disabled={servicePrices.length === 0 || !selectedServiceName}
                className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("quotations.addService")}
              </button>
            </div>
            {selectedSystemUsesCosting ? (
              <p className="mt-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">
                {projectCostingPrice && projectCostingPrice.totalPrice > 0 ? (
                  <>
                    Project costing price: {formatCurrency(projectCostingPrice.totalPrice)}.
                  </>
                ) : (
                  <>
                    No project costing price is available. An Admin or Procurement Engineer must save it in{" "}
                    <Link href="/costing" className="font-bold underline">
                      Project Costing
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : null}
          </div>

          <div className="border-t border-blue-200 pt-4">
            <p className="text-sm font-bold text-[var(--alumex-blue)]">Catalog add-ons</p>
            <p className="mt-1 text-xs text-slate-500">
              Standard glass is included in the window or door price. Select upgraded glass
              and other features here to add their configured price to the applicable item.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <select
                value={selectedAddonName}
                onChange={(event) => setSelectedAddonName(event.target.value)}
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
              >
                <option value="">Select add-on</option>
                {addonPrices.map((addon) => (
                  <option key={addon.id ?? addon.product_name} value={addon.product_name}>
                    {addon.product_name} — {formatCurrency(addon.unit_price)} / {addon.unit}
                  </option>
                ))}
              </select>
              <select
                value={addonTargetLineId}
                onChange={(event) => setAddonTargetLineId(event.target.value)}
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
              >
                <option value="">Apply to whole project</option>
                {lines
                  .filter((line) =>
                    ["base", "service"].includes(line.lineType ?? "base"),
                  )
                  .map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.openingCode} — {line.productSystem}
                    </option>
                  ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={addonQuantity}
                onChange={(event) => setAddonQuantity(Math.max(Number(event.target.value) || 1, 0.01))}
                aria-label={
                  selectedAddon?.unit === "meter"
                    ? "Add-on length in meters"
                    : "Add-on billable quantity"
                }
                placeholder={
                  selectedAddon?.unit === "meter"
                    ? "Length (m)"
                    : "Billable quantity"
                }
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
              />
              <input
                value={addonSpecification}
                onChange={(event) => setAddonSpecification(event.target.value)}
                placeholder="Optional add-on specification"
                className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-foreground"
              />
              <button
                type="button"
                onClick={addCatalogAddon}
                disabled={!selectedAddonName}
                className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white disabled:opacity-50"
              >
                Add selected add-on
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-blue-200 pt-4">
            <button
              type="button"
              onClick={() => addScopeLine("addon")}
              className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white"
            >
              {t("quotations.addCustomAddon")}
            </button>
            <button
              type="button"
              onClick={() => addScopeLine("accessory")}
              className="h-10 rounded-md border border-blue-200 bg-white px-3 text-sm font-bold text-[var(--alumex-blue)]"
            >
              {t("quotations.addAccessory")}
            </button>
          </div>
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-slate-200 xl:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1540px] divide-y divide-slate-200 text-left text-sm">
              <caption className="sr-only">
                {t("quotations.openingsAndPricing")}
              </caption>
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">{t("projects.openings.fields.openingCode")}</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">{t("common.location")}</th>
                  <th className="px-3 py-3">{t("common.system")}</th>
                  <th className="px-3 py-3">{t("quotations.glass")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.width")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.height")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.solidPanelHeight")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.quantity")}</th>
                  <th className="px-3 py-3">{t("quotations.billableBasis")}</th>
                  <th className="px-3 py-3">{t("settings.unitPrice")}</th>
                  <th className="px-3 py-3">{t("common.discount")}</th>
                  <th className="px-3 py-3">{t("quotations.lineTotal")}</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const lineTotal = calculateLineTotal(line);
                  const isBaseLine = (line.lineType ?? "base") === "base";
                  const pricingUnit = pricingUnitForLine(line);

                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-4 font-bold text-slate-950">
                        {isBaseLine ? (
                          line.openingCode
                        ) : (
                          <input
                            value={line.openingCode}
                            onChange={(event) =>
                              updateScopeLine(line.id, "openingCode", event.target.value)
                            }
                            className="h-9 w-28 rounded-md border border-slate-300 px-2 text-sm"
                          />
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold uppercase text-slate-600">
                          {line.lineType ?? "base"}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {term(line.floor)} - {term(line.room)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {isBaseLine ? (
                          term(line.productSystem)
                        ) : (
                          <input
                            value={line.productSystem}
                            onChange={(event) =>
                              updateScopeLine(line.id, "productSystem", event.target.value)
                            }
                            placeholder="Description"
                            className="h-9 w-44 rounded-md border border-slate-300 px-2 text-sm"
                          />
                        )}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {term(line.glassType)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {isBaseLine
                          ? t("common.cmValue", { value: line.width })
                          : "—"}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {isBaseLine
                          ? t("common.cmValue", { value: line.height })
                          : "—"}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {isBaseLine
                          ? t("common.cmValue", {
                              value: line.solidPanelHeight ?? 0,
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {isBaseLine ? (
                          line.quantity
                        ) : (
                          <input
                            type="number"
                            min={pricingUnit ? "0.01" : "1"}
                            step={pricingUnit ? "0.01" : "1"}
                            value={pricingUnit ? lineTotal.area : line.quantity}
                            onChange={(event) =>
                              updateScopeQuantity(line.id, Number(event.target.value))
                            }
                            className="h-9 w-20 rounded-md border border-slate-300 px-2 text-sm"
                          />
                        )}
                      </td>
                      <td className="px-3 py-4 font-semibold text-slate-950">
                        {pricingUnit
                          ? `${lineTotal.area.toFixed(2)} ${pricingUnit}`
                          : t("common.areaValue", { value: lineTotal.area.toFixed(2) })}
                      </td>
                      <td className="px-3 py-4">
                        <input
                          type="number"
                          min="0"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(
                              line.id,
                              "unitPrice",
                              Number(event.target.value),
                            )
                          }
                          className="h-9 w-28 rounded-md border border-slate-300 px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-4">
                        <input
                          type="number"
                          min="0"
                          max={discountLimit}
                          value={line.discountPercent}
                          disabled={!lineTotal.isDiscountable}
                          onChange={(event) =>
                            updateLine(
                              line.id,
                              "discountPercent",
                              Number(event.target.value),
                            )
                          }
                          className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        {!lineTotal.isDiscountable ? (
                          <p className="mt-1 text-[11px] font-bold uppercase text-slate-500">
                            No discount
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 font-bold text-[var(--alumex-blue)]">
                        {formatCurrency(lineTotal.net)}
                      </td>
                      <td className="px-3 py-4">
                        {!isBaseLine ? (
                          <button
                            type="button"
                            onClick={() => removeScopeLine(line.id)}
                            className="h-9 rounded-md border border-danger-text px-2 text-xs font-bold text-danger-text"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 xl:hidden">
          {lines.map((line) => {
            const lineTotal = calculateLineTotal(line);
            const isBaseLine = (line.lineType ?? "base") === "base";
            const pricingUnit = pricingUnitForLine(line);

            return (
              <article
                key={line.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {line.floor} - {line.room}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-slate-950">
                      {line.openingCode}
                    </h3>
                    <p className="mt-1 text-xs font-bold uppercase text-slate-500">
                      {line.lineType ?? "base"}
                    </p>
                  </div>
                  <p className="rounded-md bg-blue-50 px-3 py-2 text-sm font-bold text-[var(--alumex-blue)]">
                    {formatCurrency(lineTotal.net)}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {!isBaseLine ? (
                    <>
                      <label className="sm:col-span-2">
                        <span className="text-xs font-bold uppercase text-slate-500">
                          {t("quotations.scopeDescription")}
                        </span>
                        <input
                          value={line.productSystem}
                          onChange={(event) =>
                            updateScopeLine(line.id, "productSystem", event.target.value)
                          }
                          className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                        />
                      </label>
                      <label>
                        <span className="text-xs font-bold uppercase text-slate-500">
                          {t("projects.openings.fields.quantity")}
                        </span>
                        <input
                          type="number"
                          min={pricingUnit ? "0.01" : "1"}
                          step={pricingUnit ? "0.01" : "1"}
                          value={pricingUnit ? lineTotal.area : line.quantity}
                          onChange={(event) =>
                            updateScopeQuantity(line.id, Number(event.target.value))
                          }
                          className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                        />
                      </label>
                    </>
                  ) : null}
                  <label>
                    <span className="text-xs font-bold uppercase text-slate-500">
                      {t("settings.unitPrice")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(
                          line.id,
                          "unitPrice",
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                    />
                  </label>
                  <label>
                    <span className="text-xs font-bold uppercase text-slate-500">
                      {t("quotations.discountPercent")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={discountLimit}
                      value={line.discountPercent}
                      disabled={!lineTotal.isDiscountable}
                      onChange={(event) =>
                        updateLine(
                          line.id,
                          "discountPercent",
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    {!lineTotal.isDiscountable ? (
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Add-ons and accessories are not discountable.
                      </p>
                    ) : null}
                  </label>
                </div>
                {isBaseLine ? (
                  <p className="mt-3 text-sm text-slate-600">
                    {term(line.productSystem)} - {term(line.glassType)} -{" "}
                    {t("common.cmValue", { value: line.width })} ×{" "}
                    {t("common.cmValue", { value: line.height })} ×{" "}
                    {line.quantity} -{" "}
                    {t("common.areaValue", { value: lineTotal.area.toFixed(2) })}
                  </p>
                ) : null}
                {pricingUnit ? (
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {t("quotations.billableBasis")}: {lineTotal.area.toFixed(2)} {pricingUnit}
                  </p>
                ) : null}
                {!isBaseLine && line.notes ? (
                  <p className="mt-1 text-sm text-slate-600">{line.notes}</p>
                ) : null}
                {isBaseLine ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {t("projects.openings.fields.solidPanelHeight")}:{" "}
                    {t("common.cmValue", {
                      value: line.solidPanelHeight ?? 0,
                    })}
                  </p>
                ) : null}
                {!isBaseLine ? (
                  <button
                    type="button"
                    onClick={() => removeScopeLine(line.id)}
                    className="mt-3 h-10 w-full rounded-md border border-danger-text text-sm font-bold text-danger-text"
                  >
                    Remove
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-bold text-slate-950">
              {t("quotations.noOpeningsLoaded")}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {t("quotations.noOpeningsLoadedDescription")}
            </p>
          </div>
        ) : null}
      </SectionCard>

      <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <SectionCard title={t("quotations.notesAndSignatures")}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                {t("common.notes")}
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="text-sm font-bold text-slate-700">
                {t("contracts.preparedBy")}
              </span>
              <input
                value={preparedBy}
                onChange={(event) => setPreparedBy(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="text-sm font-bold text-slate-700">
                {t("quotations.clientRepresentative")}
              </span>
              <input
                value={clientRepresentative}
                onChange={(event) => setClientRepresentative(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title={t("quotations.totals")}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{t("common.subtotal")}</span>
              <span className="font-bold text-slate-950">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t("common.lineDiscounts")}</span>
              <span className="font-bold text-red-700">
                -{formatCurrency(totals.lineDiscountTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Discountable subtotal</span>
              <span className="font-bold text-slate-950">
                {formatCurrency(totals.discountableSubtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Add-ons/accessories</span>
              <span className="font-bold text-slate-950">
                {formatCurrency(totals.nonDiscountableSubtotal)}
              </span>
            </div>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("quotations.quotationDiscountPercent")}
              </span>
              <span className="mt-1 block text-xs font-semibold text-muted">
                {t("quotations.discountLimitNotice", { limit: discountLimit })}
              </span>
              <input
                type="number"
                min="0"
                max={discountLimit}
                value={discountPercent}
                onChange={(event) =>
                  setDiscountPercent(
                    clampDiscount(Number(event.target.value), discountLimit),
                  )
                }
                className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              />
            </label>
            <div className="flex justify-between">
              <span className="text-slate-500">{t("common.quotationDiscount")}</span>
              <span className="font-bold text-red-700">
                -{formatCurrency(totals.quotationDiscount)}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div className="flex justify-between text-lg">
                <span className="font-bold text-slate-950">
                  {t("common.grandTotal")}
                </span>
                <span className="font-bold text-[var(--alumex-blue)]">
                  {formatCurrency(totals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-quotation-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2 id="delete-quotation-title" className="text-lg font-bold text-foreground">
              {t("quotations.deleteQuotation")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-strong">
              {t("quotations.deleteConfirm")}
            </p>
            <p className="mt-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-bold text-foreground">
              {deleteTarget.quotationNumber} - {term(deleteTarget.project.client)}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteQuotation}
                className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              >
                {isDeleting ? t("common.loading") : t("quotations.deleteQuotation")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
