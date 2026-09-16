import assert from "node:assert/strict";
import test from "node:test";
import { calculateSkylight } from "../src/lib/skylight.ts";

test("skylight totals use the supplied rates and add lamination per square meter", () => {
  const result = calculateSkylight({ connector: "2.5", glass: "10", brackets: "4", screws: "2" });
  assert.equal(result.standardTotalCents, 144625);
  assert.equal(result.laminationCents, 55000);
  assert.equal(result.laminatedTotalCents, 199625);
  assert.equal(result.valid, true);
});

test("empty quantities are zero and missing glass incurs no lamination charge", () => {
  assert.equal(calculateSkylight({}).standardTotalCents, 0);
  assert.equal(calculateSkylight({ connector: "2" }).laminationCents, 0);
});

test("fractional lengths round each line to cents before summing", () => {
  const result = calculateSkylight({ connector: "0.001", mullion: "0.001", glass: "0.001" });
  assert.equal(result.standardTotalCents, 19);
  assert.equal(result.laminatedTotalCents, 25);
});

test("invalid, negative, excessive, and fractional piece quantities cannot be quoted", () => {
  for (const value of ["-1", "Infinity", "NaN", "abc", "1.0001", "1000001", "1e309"]) {
    assert.equal(calculateSkylight({ connector: value }).valid, false, value);
  }
  assert.equal(calculateSkylight({ screws: "1.5" }).valid, false);
  assert.equal(calculateSkylight({ brackets: "2.5" }).valid, false);
  assert.equal(calculateSkylight({ screws: "2" }).valid, true);
});
