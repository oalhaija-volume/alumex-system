import { redirect } from "next/navigation";

export default function ContractsPage() {
  redirect("/quotations?view=contracts");
}
