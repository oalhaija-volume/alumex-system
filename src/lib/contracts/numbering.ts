export function formatContractNumber(year: number, sequence: number) {
  return `CT-${year}-${sequence.toString().padStart(4, "0")}`;
}

export function generateNextContractNumber({
  contractNumbers,
  reservedNumbers = [],
  year = new Date().getFullYear(),
}: {
  contractNumbers: string[];
  reservedNumbers?: string[];
  year?: number;
}) {
  const prefix = `CT-${year}-`;
  const unavailableNumbers = new Set([
    ...contractNumbers,
    ...reservedNumbers,
  ]);
  let sequence = contractNumbers.reduce((highest, contractNumber) => {
    if (!contractNumber.startsWith(prefix)) {
      return highest;
    }

    const parsedSequence = Number(contractNumber.slice(prefix.length));
    return Number.isFinite(parsedSequence)
      ? Math.max(highest, parsedSequence)
      : highest;
  }, 0);
  let candidate = "";

  do {
    sequence += 1;
    candidate = formatContractNumber(year, sequence);
  } while (unavailableNumbers.has(candidate));

  return candidate;
}
