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

test("Other is a single USD amount added equally to both grand totals", () => {
  const result = calculateSkylight({ glass: "10" }, "125.75");
  assert.equal(result.standardTotalCents, 132575);
  assert.equal(result.laminatedTotalCents, 187575);
  assert.equal(result.laminationCents, 55000);
  assert.equal(calculateSkylight({}, "0.29").standardTotalCents, 29);
  assert.equal(calculateSkylight({}, "").otherCents, 0);
  assert.equal(calculateSkylight({}, "0").valid, true);
  for (const amount of ["-1", "1.001", "Infinity", "1000001", "abc"]) {
    assert.equal(calculateSkylight({}, amount).valid, false, amount);
  }
});

test("fractional lengths round each line to cents before summing", () => {
  const result = calculateSkylight({ connector: "0.001", mullion: "0.001", glass: "0.001" });
  assert.equal(result.standardTotalCents, 19);
  assert.equal(result.laminatedTotalCents, 25);
});

test("Steel reinforcement adds a single manual amount alongside Other", () => {
  const result = calculateSkylight({ glass: "10" }, "125.75", "200.25");
  assert.equal(result.standardTotalCents, 152600);
  assert.equal(result.laminatedTotalCents, 207600);
  assert.equal(result.laminationCents, 55000);
  assert.equal(calculateSkylight({}, "", "0.29").standardTotalCents, 29);
  assert.equal(calculateSkylight({}, "", "").steelCents, 0);
  assert.equal(calculateSkylight({}, "", "0").valid, true);
  for (const amount of ["-1", "1.001", "Infinity", "1000001", "abc"]) {
    assert.equal(calculateSkylight({}, "", amount).valid, false, amount);
  }
});

test("invalid, negative, excessive, and fractional piece quantities cannot be quoted", () => {
  for (const value of ["-1", "Infinity", "NaN", "abc", "1.0001", "1000001", "1e309"]) {
    assert.equal(calculateSkylight({ connector: value }).valid, false, value);
  }
  assert.equal(calculateSkylight({ screws: "1.5" }).valid, false);
  assert.equal(calculateSkylight({ brackets: "2.5" }).valid, false);
  assert.equal(calculateSkylight({ screws: "2" }).valid, true);
});
