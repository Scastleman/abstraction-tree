import assert from "node:assert/strict";
import test from "node:test";
import { browserServeUrl, defaultServeHost, formatServeUrl, selectServeHost } from "./serveHost.js";

test("selectServeHost defaults to loopback without a warning", () => {
  assert.deepEqual(selectServeHost(), {
    host: defaultServeHost,
    warning: undefined
  });
});

test("selectServeHost keeps explicit loopback hosts without a warning", () => {
  assert.deepEqual(selectServeHost("localhost"), {
    host: "localhost",
    warning: undefined
  });
  assert.deepEqual(selectServeHost("127.0.0.2"), {
    host: "127.0.0.2",
    warning: undefined
  });
});

test("selectServeHost warns for wildcard and non-loopback hosts", () => {
  const wildcard = selectServeHost("0.0.0.0");
  assert.equal(wildcard.host, "0.0.0.0");
  assert.match(wildcard.warning ?? "", /may expose \/api\/state on your network/);
  assert.match(wildcard.warning ?? "", new RegExp(defaultServeHost));

  const ipv6Wildcard = selectServeHost("::");
  assert.equal(ipv6Wildcard.host, "::");
  assert.match(ipv6Wildcard.warning ?? "", /may expose \/api\/state on your network/);

  const lanHost = selectServeHost("192.168.1.20");
  assert.equal(lanHost.host, "192.168.1.20");
  assert.match(lanHost.warning ?? "", /may expose \/api\/state on your network/);
});

test("formatServeUrl brackets IPv6 hosts", () => {
  assert.equal(formatServeUrl("::1", 4317), "http://[::1]:4317");
  assert.equal(formatServeUrl("[::1]", 4317), "http://[::1]:4317");
});

test("browserServeUrl prefers loopback for local and wildcard hosts", () => {
  assert.equal(browserServeUrl("localhost", 4317), "http://127.0.0.1:4317");
  assert.equal(browserServeUrl("127.0.0.2", 4317), "http://127.0.0.1:4317");
  assert.equal(browserServeUrl("0.0.0.0", 4317), "http://127.0.0.1:4317");
  assert.equal(browserServeUrl("192.168.1.20", 4317), "http://192.168.1.20:4317");
});
