import assert from "node:assert/strict";
import test from "node:test";
import { intakeCompanyName } from "../src/lib/intake/companyName.ts";

test("company intake without optional details satisfies the required company name", () => {
  assert.equal(intakeCompanyName("company", " mosa ", ""), "mosa");
  assert.equal(intakeCompanyName("company", "mosa", "   "), "mosa");
});

test("explicit company names are preserved", () => {
  assert.equal(intakeCompanyName("company", "Contact person", " Mosa Ltd "), "Mosa Ltd");
});

test("individual intake does not invent a company name", () => {
  assert.equal(intakeCompanyName("individual", "mosa", ""), null);
});
