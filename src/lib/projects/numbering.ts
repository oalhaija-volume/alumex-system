export function formatProjectNumber(year: number, month: number, sequence: number) {
  const period = `${year}${month.toString().padStart(2, "0")}`;

  return `PRJ-${period}-${sequence.toString().padStart(4, "0")}`;
}

export function generateNextProjectNumber({
  projectNumbers,
  reservedNumbers = [],
  date = new Date(),
}: {
  projectNumbers: string[];
  reservedNumbers?: string[];
  date?: Date;
}) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const prefix = `PRJ-${year}${month.toString().padStart(2, "0")}-`;
  const unavailableNumbers = new Set([
    ...projectNumbers,
    ...reservedNumbers,
  ]);
  let sequence = projectNumbers.reduce((highest, projectNumber) => {
    if (!projectNumber.startsWith(prefix)) {
      return highest;
    }

    const parsedSequence = Number(projectNumber.slice(prefix.length));
    return Number.isFinite(parsedSequence)
      ? Math.max(highest, parsedSequence)
      : highest;
  }, 0);
  let candidate = "";

  do {
    sequence += 1;
    candidate = formatProjectNumber(year, month, sequence);
  } while (unavailableNumbers.has(candidate));

  return candidate;
}
