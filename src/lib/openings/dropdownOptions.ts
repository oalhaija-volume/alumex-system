export type OpeningOptionCategory =
  | "room"
  | "aluminum_section"
  | "glass_type"
  | "glass_color";

export type OpeningDropdownOption = {
  id?: string;
  category: OpeningOptionCategory;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export const openingOptionCategories: Array<{
  category: OpeningOptionCategory;
  labelKey: string;
}> = [
  { category: "room", labelKey: "settings.openingDropdownRooms" },
  {
    category: "aluminum_section",
    labelKey: "settings.openingDropdownAluminumSections",
  },
  { category: "glass_type", labelKey: "settings.openingDropdownGlassTypes" },
  { category: "glass_color", labelKey: "settings.openingDropdownGlassColors" },
];

export const defaultOpeningDropdownOptions: OpeningDropdownOption[] = [
  ...[
    "Living Room",
    "Bedroom",
    "Kitchen",
    "Bathroom",
    "Majlis",
    "Hall",
    "Office",
    "Balcony",
  ].map((label, index) => ({
    category: "room" as const,
    label,
    sort_order: index + 1,
    is_active: true,
  })),
  ...[
    "Sliding",
    "Hinged",
    "Fixed",
    "Curtain Wall",
    "Skylight",
    "Louver",
  ].map((label, index) => ({
    category: "aluminum_section" as const,
    label,
    sort_order: index + 1,
    is_active: true,
  })),
  ...[
    "Single Glass",
    "Double Glass",
    "Tempered Glass",
    "Laminated Glass",
    "Low-E Glass",
    "Reflective Glass",
  ].map((label, index) => ({
    category: "glass_type" as const,
    label,
    sort_order: index + 1,
    is_active: true,
  })),
  ...["Clear", "Bronze", "Grey", "Green", "Blue", "Mirror"].map(
    (label, index) => ({
      category: "glass_color" as const,
      label,
      sort_order: index + 1,
      is_active: true,
    }),
  ),
];

export function optionsForCategory(
  options: OpeningDropdownOption[],
  category: OpeningOptionCategory,
) {
  const activeOptions = options
    .filter((option) => option.category === category && option.is_active)
    .sort((left, right) => left.sort_order - right.sort_order);

  return activeOptions.length > 0
    ? activeOptions
    : defaultOpeningDropdownOptions.filter(
        (option) => option.category === category,
      );
}

export async function loadOpeningDropdownOptions() {
  const response = await fetch("/api/settings/opening-dropdown-options", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    options?: OpeningDropdownOption[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load opening dropdown options.");
  }

  return body?.options?.length ? body.options : defaultOpeningDropdownOptions;
}
