import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(testDir, "..");

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  sourceMap: false
};

test("checkout coordinates cart, payment, and order services", async t => {
  const root = await makeWorkspace(t, "atree-checkout-collaboration-");
  await writeMockServices(root);
  await writeTranspiled(root, "src/api/checkout.mjs", await readSource("src/api/checkout.ts"), true);

  const { calls } = await importModule(root, "src/services/calls.mjs");
  const { checkout } = await importModule(root, "src/api/checkout.mjs");

  const result = await checkout({
    userId: "user_123",
    cartId: "cart_abc",
    paymentToken: "tok_demo"
  });

  const cart = { id: "cart_abc", total: 123, items: [{ sku: "sku_demo", quantity: 2 }] };
  assert.deepEqual(calls, [
    { service: "cart", userId: "user_123", cartId: "cart_abc" },
    { service: "payment", total: 123, paymentToken: "tok_demo" },
    { service: "orders", input: { userId: "user_123", cart, paymentId: "payment_456" } }
  ]);
  assert.deepEqual(result, {
    id: "order_789",
    status: "created",
    userId: "user_123",
    cart,
    paymentId: "payment_456"
  });
});

test("checkout propagates cart and payment validation errors", async t => {
  const root = await writeActualCheckoutModules(t);
  const { checkout } = await importModule(root, "src/api/checkout.mjs");

  await assert.rejects(
    () => checkout({ userId: "", cartId: "cart_abc", paymentToken: "tok_demo" }),
    /Missing cart identity/
  );
  await assert.rejects(
    () => checkout({ userId: "user_123", cartId: "cart_abc", paymentToken: "" }),
    /Missing payment token/
  );
});

test("cart and payment services reject invalid inputs", async t => {
  const root = await writeActualCheckoutModules(t);
  const { validateCart } = await importModule(root, "src/services/cart.mjs");
  const { authorizePayment } = await importModule(root, "src/services/payment.mjs");

  await assert.rejects(() => validateCart("", "cart_abc"), /Missing cart identity/);
  await assert.rejects(() => validateCart("user_123", ""), /Missing cart identity/);
  await assert.rejects(() => authorizePayment(0, "tok_demo"), /Cannot authorize an empty cart/);
  await assert.rejects(() => authorizePayment(100, ""), /Missing payment token/);
});

async function writeActualCheckoutModules(t) {
  const root = await makeWorkspace(t, "atree-checkout-real-");
  await Promise.all([
    writeTranspiled(root, "src/api/checkout.mjs", await readSource("src/api/checkout.ts"), true),
    writeTranspiled(root, "src/services/cart.mjs", await readSource("src/services/cart.ts")),
    writeTranspiled(root, "src/services/payment.mjs", await readSource("src/services/payment.ts")),
    writeTranspiled(root, "src/services/orders.mjs", await readSource("src/services/orders.ts"))
  ]);
  return root;
}

async function writeMockServices(root) {
  await Promise.all([
    writeFileAt(root, "src/services/calls.mjs", "export const calls = [];\n"),
    writeFileAt(root, "src/services/cart.mjs", `
import { calls } from "./calls.mjs";

export async function validateCart(userId, cartId) {
  calls.push({ service: "cart", userId, cartId });
  return { id: "cart_abc", total: 123, items: [{ sku: "sku_demo", quantity: 2 }] };
}
`),
    writeFileAt(root, "src/services/payment.mjs", `
import { calls } from "./calls.mjs";

export async function authorizePayment(total, paymentToken) {
  calls.push({ service: "payment", total, paymentToken });
  return { id: "payment_456", authorized: true };
}
`),
    writeFileAt(root, "src/services/orders.mjs", `
import { calls } from "./calls.mjs";

export async function createOrder(input) {
  calls.push({ service: "orders", input });
  return { id: "order_789", status: "created", ...input };
}
`)
  ]);
}

async function readSource(relativePath) {
  return readFile(path.join(exampleRoot, relativePath), "utf8");
}

async function writeTranspiled(root, relativePath, source, rewriteServiceImports = false) {
  let output = ts.transpileModule(source, { compilerOptions }).outputText;
  if (rewriteServiceImports) output = rewriteCheckoutServiceImports(output);
  await writeFileAt(root, relativePath, output);
}

function rewriteCheckoutServiceImports(output) {
  return output
    .replaceAll("\"../services/cart\"", "\"../services/cart.mjs\"")
    .replaceAll("\"../services/payment\"", "\"../services/payment.mjs\"")
    .replaceAll("\"../services/orders\"", "\"../services/orders.mjs\"");
}

async function writeFileAt(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function makeWorkspace(t, prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function importModule(root, relativePath) {
  return import(pathToFileURL(path.join(root, relativePath)).href);
}
