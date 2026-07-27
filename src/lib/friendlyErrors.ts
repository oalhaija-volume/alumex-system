type ErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

export function technicalErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const errorLike = error as ErrorLike;
    const parts = [
      typeof errorLike.message === "string" ? errorLike.message : "",
      typeof errorLike.details === "string" ? errorLike.details : "",
      typeof errorLike.hint === "string" ? errorLike.hint : "",
      typeof errorLike.code === "string" ? `Code: ${errorLike.code}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return "";
}

export function isDuplicateError(error: unknown) {
  const message = technicalErrorMessage(error).toLowerCase();
  const code =
    error && typeof error === "object" && typeof (error as ErrorLike).code === "string"
      ? (error as ErrorLike).code
      : "";

  return (
    code === "23505" ||
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("_key") ||
    message.includes("unique")
  );
}

export function isMissingDatabaseObjectError(error: unknown) {
  const message = technicalErrorMessage(error).toLowerCase();
  const code =
    error && typeof error === "object" && typeof (error as ErrorLike).code === "string"
      ? (error as ErrorLike).code
      : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("could not find the column") ||
    message.includes("does not exist")
  );
}

export function friendlyDatabaseError(
  error: unknown,
  fallback: string,
  duplicateMessage?: string,
) {
  const message = technicalErrorMessage(error).toLowerCase();

  if (duplicateMessage && isDuplicateError(error)) {
    return duplicateMessage;
  }

  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "You do not have permission to complete this action.";
  }

  if (message.includes("invalid input syntax")) {
    return "The request contains invalid data.";
  }

  if (message.includes("violates foreign key constraint")) {
    return "This record is connected to other data and cannot be changed right now.";
  }

  if (message.includes("not-null constraint")) {
    return "Please fill in the required fields and try again.";
  }

  return fallback;
}
