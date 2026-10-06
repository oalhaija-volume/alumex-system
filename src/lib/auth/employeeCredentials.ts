import { randomBytes } from "node:crypto";

export function generateEmployeeCredentials(fullName: string) {
  const name = fullName.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 40) || "employee";
  return {
    username: `${name}.${randomBytes(6).toString("hex")}`,
    password: `Aa1!${randomBytes(18).toString("base64url")}`,
  };
}
