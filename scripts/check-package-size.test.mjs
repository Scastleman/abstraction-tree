import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePackageSizes, formatBytes, packageSizeBudgets, parseNpmPackJson } from "./check-package-size.mjs";

test("formatBytes renders stable binary units", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MiB");
});

test("parseNpmPackJson extracts npm pack size fields", () => {
  const parsed = parseNpmPackJson(
    JSON.stringify([
      {
        name: "@abstraction-tree/core",
        size: 1234,
        unpackedSize: 5678
      }
    ]),
    "@abstraction-tree/core"
  );

  assert.equal(parsed.size, 1234);
  assert.equal(parsed.unpackedSize, 5678);
});

test("parseNpmPackJson rejects malformed npm pack output", () => {
  assert.throws(() => parseNpmPackJson("not json", "@abstraction-tree/core"), /did not return JSON/u);
  assert.throws(
    () => parseNpmPackJson(JSON.stringify([{ name: "@abstraction-tree/core" }]), "@abstraction-tree/core"),
    /missing size or unpackedSize/u
  );
});

test("evaluatePackageSizes reports package size budget status", () => {
  const { lines, issues } = evaluatePackageSizes([
    {
      name: "@abstraction-tree/core",
      tarballBytes: packageSizeBudgets["@abstraction-tree/core"].maxTarballBytes,
      unpackedBytes: packageSizeBudgets["@abstraction-tree/core"].maxUnpackedBytes
    }
  ]);

  assert.equal(issues.length, 0);
  assert.match(lines[0], /@abstraction-tree\/core: tarball/u);
  assert.match(lines[0], /installed/u);
});

test("evaluatePackageSizes fails on tarball, installed, and missing budgets", () => {
  const { issues } = evaluatePackageSizes(
    [
      {
        name: "@abstraction-tree/core",
        tarballBytes: 221_000,
        unpackedBytes: 1_201_000
      },
      {
        name: "@abstraction-tree/unknown",
        tarballBytes: 1,
        unpackedBytes: 1
      }
    ],
    {
      "@abstraction-tree/core": {
        maxTarballBytes: 220_000,
        maxUnpackedBytes: 1_200_000
      }
    }
  );

  assert.deepEqual(issues, [
    "@abstraction-tree/core: tarball 215.8 KiB exceeds 214.8 KiB.",
    "@abstraction-tree/core: installed 1.1 MiB exceeds 1.1 MiB.",
    "@abstraction-tree/unknown: missing package size budget."
  ]);
});
