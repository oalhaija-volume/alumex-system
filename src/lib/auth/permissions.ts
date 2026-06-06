export type AppRole = "Admin" | "Sales Manager" | "Sales User";

const routePermissions: Array<{
  prefix: string;
  roles: AppRole[];
}> = [
  { prefix: "/settings", roles: ["Admin"] },
  { prefix: "/contracts", roles: ["Admin", "Sales Manager"] },
  {
    prefix: "/dashboard",
    roles: ["Admin", "Sales Manager", "Sales User"],
  },
  { prefix: "/clients", roles: ["Admin", "Sales Manager", "Sales User"] },
  { prefix: "/projects", roles: ["Admin", "Sales Manager", "Sales User"] },
  { prefix: "/quotations", roles: ["Admin", "Sales Manager", "Sales User"] },
  { prefix: "/", roles: ["Admin", "Sales Manager", "Sales User"] },
];

export function canAccessRoute(pathname: string, role: AppRole | null) {
  if (!role) {
    return false;
  }

  const permission = routePermissions.find(({ prefix }) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );

  return permission ? permission.roles.includes(role) : true;
}
