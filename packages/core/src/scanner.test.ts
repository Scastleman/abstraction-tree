import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFile } from "./scanner.js";

test("summarizeFile uses AST facts for TypeScript and TSX", () => {
  const source = `
import React from "react";
import { readCart } from "../services/cart";

export interface CheckoutProps {
  cartId: string;
}

const localHelper = () => readCart();

export function CheckoutForm(props: CheckoutProps) {
  return <form>{props.cartId}</form>;
}

export default CheckoutForm;
`;

  const summary = summarizeFile("src/components/CheckoutForm.tsx", ".tsx", source, Buffer.byteLength(source));

  assert.equal(summary.parseStrategy, "typescript-ast");
  assert.deepEqual(summary.imports.sort(), ["../services/cart", "react"]);
  assert.ok(summary.exports.includes("CheckoutProps"));
  assert.ok(summary.exports.includes("CheckoutForm"));
  assert.ok(summary.symbols.includes("CheckoutProps"));
  assert.ok(summary.symbols.includes("localHelper"));
  assert.ok(summary.symbols.includes("CheckoutForm"));
});

test("summarizeFile keeps regex scanning for non-JS languages", () => {
  const source = `
import os

def write_report():
    return os.getcwd()
`;

  const summary = summarizeFile("tools/report.py", ".py", source, Buffer.byteLength(source));

  assert.equal(summary.parseStrategy, "regex");
  assert.deepEqual(summary.imports, ["os"]);
  assert.ok(summary.symbols.includes("write_report"));
});
