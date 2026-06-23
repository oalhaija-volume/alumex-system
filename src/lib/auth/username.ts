export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameFromEmail(email: string) {
  return normalizeUsername(email.split("@")[0] ?? "");
}

export function authEmailForUsername(username: string) {
  return `${normalizeUsername(username)}@auth.alumex.local`;
}

export function isValidUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(normalizeUsername(value));
}
