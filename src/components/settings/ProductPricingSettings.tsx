"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  enforceProductPricingRules,
  isGeorgianBarsName,
  loadProductPrices,
  productCatalogCategories,
  productCatalogKind,
  productPricingSource,
  productsForCatalog,
  type ProductPrice,
} from "@/lib/pricing/productPricing";

type ProductDraft = {
  id?: string;
  product_name: string;
  category: string;
  unit: string;
  unit_price: number;
  is_active: boolean;
};

const emptyProduct: ProductDraft = {
  product_name: "",
  category: "aluminum_section",
  unit: "sqm",
  unit_price: 0,
  is_active: true,
};

function mapProduct(product: ProductPrice): ProductDraft {
  return enforceProductPricingRules({
    id: product.id,
    product_name: product.product_name,
    category: product.category ?? "",
    unit: product.unit || "sqm",
    unit_price: Number(product.unit_price),
    is_active: product.is_active,
  });
}

async function saveProductPrices(products: ProductDraft[]) {
  const response = await fetch("/api/settings/product-prices", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products }),
  });
  const body = (await response.json().catch(() => null)) as {
    products?: ProductPrice[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to save product prices.");
  }

  return body?.products ?? [];
}

export function ProductPricingSettings() {
  const { formatCurrency, t } = useI18n();
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [newProduct, setNewProduct] = useState<ProductDraft>(emptyProduct);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const aluminumSectionCount = productsForCatalog(
    products as ProductPrice[],
    "aluminum_section",
  ).length;
  const serviceCount = productsForCatalog(
    products as ProductPrice[],
    "service",
  ).length;
  const normalizedNewProduct = enforceProductPricingRules(newProduct);
  const newProductUsesCosting =
    productPricingSource(normalizedNewProduct) === "project_costing";
  const newProductHasLockedUnit =
    newProductUsesCosting || isGeorgianBarsName(normalizedNewProduct.product_name);

  const loadProducts = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const loadedProducts = await loadProductPrices();
      setProducts(loadedProducts.map(mapProduct));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("settings.loadProductPricesError"),
      );
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  function updateProduct(
    index: number,
    key: keyof ProductDraft,
    value: string | number | boolean,
  ) {
    setProducts((currentProducts) =>
      currentProducts.map((product, productIndex) =>
        productIndex === index
          ? enforceProductPricingRules({
              ...product,
              [key]:
                key === "unit_price"
                  ? Math.max(Number(value) || 0, 0)
                  : value,
            })
          : product,
      ),
    );
  }

  function updateProductCategory(index: number, category: string) {
    const catalogCategory = productCatalogCategories.find(
      (item) => item.value === category,
    );

    setProducts((currentProducts) =>
      currentProducts.map((product, productIndex) =>
        productIndex === index
          ? enforceProductPricingRules({
              ...product,
              category,
              unit: catalogCategory?.defaultUnit ?? product.unit,
            })
          : product,
      ),
    );
  }

  function updateNewProduct(
    key: keyof ProductDraft,
    value: string | number | boolean,
  ) {
    setNewProduct((currentProduct) => ({
      ...currentProduct,
      [key]:
        key === "unit_price" ? Math.max(Number(value) || 0, 0) : value,
    }));
  }

  function updateNewProductCategory(category: string) {
    const catalogCategory = productCatalogCategories.find(
      (item) => item.value === category,
    );

    setNewProduct((currentProduct) => ({
      ...currentProduct,
      category,
      unit: catalogCategory?.defaultUnit ?? currentProduct.unit,
    }));
  }

  function addProduct() {
    setError("");
    setNotice("");

    if (!newProduct.product_name.trim()) {
      setError(t("settings.productNameRequired"));
      return;
    }

    setProducts((currentProducts) => [
      ...currentProducts,
      enforceProductPricingRules({
        ...newProduct,
        product_name: newProduct.product_name.trim(),
        category: newProduct.category.trim(),
        unit: newProduct.unit.trim() || "sqm",
      }),
    ]);
    setNewProduct(emptyProduct);
  }

  async function handleSave() {
    setError("");
    setNotice("");

    const validProducts = products
      .map((product) => ({
        ...enforceProductPricingRules({
          ...product,
          product_name: product.product_name.trim(),
          category: product.category.trim(),
          unit: product.unit.trim() || "sqm",
        }),
      }))
      .filter((product) => product.product_name);

    if (validProducts.length === 0) {
      setError(t("settings.productNameRequired"));
      return;
    }

    setIsSaving(true);

    try {
      const savedProducts = await saveProductPrices(validProducts);
      setProducts(savedProducts.map(mapProduct));
      setNotice(t("settings.productPricesSaved"));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("settings.saveProductPricesError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-strong">
        {t("settings.productPricingDescription")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.aluminumSections")}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {aluminumSectionCount}
          </p>
          <p className="mt-1 text-sm text-muted-strong">
            {t("settings.aluminumSectionsHelp")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.services")}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {serviceCount}
          </p>
          <p className="mt-1 text-sm text-muted-strong">
            {t("settings.servicesHelp")}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-border bg-surface-muted p-4 lg:grid-cols-[1fr_180px_120px_160px_auto] lg:items-end">
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.productName")}
          </span>
          <input
            value={newProduct.product_name}
            onChange={(event) =>
              updateNewProduct("product_name", event.target.value)
            }
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          />
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.productCategory")}
          </span>
          <select
            value={productCatalogKind(normalizedNewProduct.category)}
            onChange={(event) => updateNewProductCategory(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          >
            {productCatalogCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {t(category.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.productUnit")}
          </span>
          <input
            value={normalizedNewProduct.unit}
            disabled={newProductHasLockedUnit}
            onChange={(event) => updateNewProduct("unit", event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:bg-surface-muted disabled:text-muted"
          />
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.unitPrice")}
          </span>
          <input
            type="number"
            min="0"
            value={normalizedNewProduct.unit_price}
            disabled={newProductUsesCosting}
            onChange={(event) =>
              updateNewProduct("unit_price", Number(event.target.value))
            }
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:bg-surface-muted disabled:text-muted"
          />
          {newProductUsesCosting ? (
            <span className="mt-1 block text-xs font-bold text-primary">
              {t("settings.projectCostingSource")}
            </span>
          ) : null}
        </label>
        <button
          type="button"
          onClick={addProduct}
          className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white"
        >
          {t("settings.addProduct")}
        </button>
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          {t("common.loading")}
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          {t("settings.noProductsForPricing")}
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] divide-y divide-border text-left text-sm">
                <caption className="sr-only">
                  {t("settings.productPricing")}
                </caption>
                <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3">{t("settings.productName")}</th>
                    <th className="px-3 py-3">{t("settings.productCategory")}</th>
                    <th className="px-3 py-3">{t("settings.productUnit")}</th>
                    <th className="px-3 py-3">{t("settings.unitPrice")}</th>
                    <th className="px-3 py-3">{t("settings.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((product, index) => (
                    <tr key={product.id ?? `${product.product_name}-${index}`}>
                      <td className="px-3 py-3">
                        <input
                          value={product.product_name}
                          onChange={(event) =>
                            updateProduct(index, "product_name", event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={productCatalogKind(product.category)}
                          onChange={(event) =>
                            updateProductCategory(index, event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                        >
                          {productCatalogCategories.map((category) => (
                            <option key={category.value} value={category.value}>
                              {t(category.labelKey)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={product.unit}
                          disabled={
                            productPricingSource(product) === "project_costing" ||
                            isGeorgianBarsName(product.product_name)
                          }
                          onChange={(event) =>
                            updateProduct(index, "unit", event.target.value)
                          }
                          className="h-10 w-24 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:bg-surface-muted disabled:text-muted"
                        />
                      </td>
                      <td className="px-3 py-3">
                        {productPricingSource(product) === "project_costing" ? (
                          <span className="inline-flex rounded-full bg-info-surface px-3 py-1.5 text-xs font-bold text-info-text">
                            {t("settings.projectCostingSource")}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={product.unit_price}
                            onChange={(event) =>
                              updateProduct(
                                index,
                                "unit_price",
                                Number(event.target.value),
                              )
                            }
                            className="h-10 w-36 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-muted-strong">
                          <input
                            type="checkbox"
                            checked={product.is_active}
                            onChange={(event) =>
                              updateProduct(
                                index,
                                "is_active",
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4"
                          />
                          {product.is_active
                            ? t("settings.active")
                            : t("settings.inactive")}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            {products.map((product, index) => (
              <article
                key={product.id ?? `${product.product_name}-${index}`}
                className="rounded-lg border border-border bg-surface-muted p-4"
              >
                <input
                  value={product.product_name}
                  onChange={(event) =>
                    updateProduct(index, "product_name", event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground"
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <select
                    value={productCatalogKind(product.category)}
                    onChange={(event) =>
                      updateProductCategory(index, event.target.value)
                    }
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                  >
                    {productCatalogCategories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {t(category.labelKey)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={product.unit}
                    disabled={
                      productPricingSource(product) === "project_costing" ||
                      isGeorgianBarsName(product.product_name)
                    }
                    onChange={(event) =>
                      updateProduct(index, "unit", event.target.value)
                    }
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:bg-surface-muted disabled:text-muted"
                  />
                  {productPricingSource(product) === "project_costing" ? (
                    <div className="flex h-10 items-center rounded-md border border-border bg-info-surface px-3 text-xs font-bold text-info-text">
                      {t("settings.projectCostingSource")}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={product.unit_price}
                      onChange={(event) =>
                        updateProduct(
                          index,
                          "unit_price",
                          Number(event.target.value),
                        )
                      }
                      className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                    />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-primary">
                    {productPricingSource(product) === "project_costing"
                      ? t("settings.projectCostingSource")
                      : `${formatCurrency(product.unit_price)} / ${product.unit}`}
                  </p>
                  <label className="flex items-center gap-2 text-sm font-semibold text-muted-strong">
                    <input
                      type="checkbox"
                      checked={product.is_active}
                      onChange={(event) =>
                        updateProduct(index, "is_active", event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    {product.is_active
                      ? t("settings.active")
                      : t("settings.inactive")}
                  </label>
                </div>
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? t("common.loading") : t("settings.saveProductPrices")}
          </button>
        </>
      )}
    </div>
  );
}
