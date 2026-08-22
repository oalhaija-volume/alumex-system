export type ContractKind = "residential" | "commercial";

export function contractKindFromProjectType(projectType: string): ContractKind {
  const normalized = projectType.trim().toLowerCase();

  return normalized.includes("commercial") || normalized.includes("تجار")
    ? "commercial"
    : "residential";
}

export function arabicContractTitle(kind: ContractKind) {
  return kind === "commercial"
    ? "عقد بيع و تركيب ألمنيوم / مشروع تجاري"
    : "عقد بيع و تركيب ألمنيوم / مشروع سكني";
}

export const commercialPaymentTerms = [
  "الدفعة الاولى: يلتزم الطرف الثاني بدفع نسبة 25% من القيمة الاجمالية للعقد الى الطرف الاول عند توقيع العقد.",
  "الدفعة الثانية: يلتزم الطرف الثاني بدفع نسبة 25% من القيمة الاجمالية للعقد الى الطرف الاول عند توريد بروفيلات الالمنيوم للموقع من قبل الطرف الاول.",
  "الدفعة الثالثة: يلتزم الطرف الثاني بدفع نسبة 25% من القيمة الاجمالية للعقد الى الطرف الاول عند الانتهاء من نصب هيكل بروفيلات الالمنيوم من قبل الطرف الاول.",
  "الدفعة الرابعة: يلتزم الطرف الثاني بدفع نسبة 15% من القيمة الاجمالية للعقد الى الطرف الاول عند توريد الزجاج للموقع وقبل التركيب من قبل الطرف الاول.",
  "الدفعة الخامسة والنهائية: يلتزم الطرف الثاني بدفع كامل المبلغ المتبقي على المشروع الى الطرف الاول حسب الفاتورة النهائية بعد تركيب الزجاج وقبل التشطيب من قبل الطرف الاول.",
  "في حال كانت القيمة الاجمالية للعقد أقل من (15,000,000) خمسة عشر مليون دينار عراقي تدفع الدفعة كاملة 100% عند توقيع العقد.",
].join("\n");

export function paymentTermsForContractKind(
  kind: ContractKind,
  residentialTerms: string,
) {
  return kind === "commercial" ? commercialPaymentTerms : residentialTerms;
}

export function specificationsForContractKind(
  kind: ContractKind,
  specifications: string,
) {
  if (kind === "residential") {
    return specifications;
  }

  const commercialSpecifications = specifications
    .split("\n")
    .filter((paragraph) => !paragraph.includes("THE ADDRESS"))
    .join("\n");

  return [
    commercialSpecifications,
    "نوع التشطيب الخاص بالواجهات الزجاجية: المقاطع الطولية (كاب او سيليكون)، والمقاطع العرضية (كاب او سيليكون).",
  ]
    .filter(Boolean)
    .join("\n");
}

export function firstPartyTermsInDocumentOrder(
  executionTerms: string,
  warrantyTerms: string,
  additionalObligations: string,
) {
  const additionalParagraphs = additionalObligations
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(
      (paragraph) =>
        paragraph &&
        !paragraph.includes("المباشرة بالعمل") &&
        !paragraph.includes("المخططات") &&
        !paragraph.includes("الكفالة"),
    );

  return [executionTerms, warrantyTerms, ...additionalParagraphs]
    .filter(Boolean)
    .join("\n");
}

export function splitContractTermsForDocument(text: string) {
  const sections = {
    introduction: [] as string[],
    specifications: [] as string[],
    measurementNotes: [] as string[],
    generalTerms: [] as string[],
  };
  let stage: keyof typeof sections = "introduction";

  text
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => {
      if (
        paragraph.startsWith("يتكون هذا العقد") ||
        paragraph.startsWith("يمثل الطرف الاول")
      ) {
        return;
      }

      if (
        paragraph.startsWith("اتفق الطرف الاول") ||
        paragraph.startsWith("اسعار الاضافيات")
      ) {
        stage = "specifications";
      } else if (
        paragraph.startsWith("يحسب القياس") ||
        paragraph.startsWith("المساحة الكلية") ||
        paragraph.startsWith("فقط القياس")
      ) {
        stage = "measurementNotes";
      } else if (paragraph.startsWith("يتم تجهيز بضاعة المشروع")) {
        stage = "generalTerms";
      }

      sections[stage].push(paragraph);
    });

  return {
    introduction: sections.introduction.join("\n"),
    specifications: sections.specifications.join("\n"),
    measurementNotes: sections.measurementNotes.join("\n"),
    generalTerms: sections.generalTerms.join("\n"),
  };
}
