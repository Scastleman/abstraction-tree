import assert from "node:assert/strict";
import test from "node:test";
import {
  browserServeUrl,
  defaultServeHost,
  formatServeUrl,
  isServeRequestAuthorized,
  selectServeAuth,
  selectServeHost,
  serveTokenEnvVar
} from "./serveHost.js";

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
  assert.match(wildcard.warning ?? "", /may expose \/api\/state and \/api\/artifact on your network/);
  assert.match(wildcard.warning ?? "", /bearer-token authentication/);
  assert.match(wildcard.warning ?? "", new RegExp(defaultServeHost));

  const ipv6Wildcard = selectServeHost("::");
  assert.equal(ipv6Wildcard.host, "::");
  assert.match(ipv6Wildcard.warning ?? "", /may expose \/api\/state and \/api\/artifact on your network/);

  const lanHost = selectServeHost("192.168.1.20");
  assert.equal(lanHost.host, "192.168.1.20");
  assert.match(lanHost.warning ?? "", /may expose \/api\/state and \/api\/artifact on your network/);
});

test("selectServeAuth allows loopback without a token", () => {
  assert.deepEqual(selectServeAuth(defaultServeHost, undefined, {}), {});
});

test("selectServeAuth requires a token for non-loopback hosts", () => {
  const selection = selectServeAuth("0.0.0.0", undefined, {});

  assert.match(selection.error ?? "", /Refusing to serve local API routes on non-loopback host 0\.0\.0\.0/);
  assert.match(selection.error ?? "", /--token <token>/);
  assert.match(selection.error ?? "", new RegExp(serveTokenEnvVar));
});

test("selectServeAuth accepts explicit and environment tokens", () => {
  assert.deepEqual(selectServeAuth("0.0.0.0", " network-token ", {}), {
    token: "network-token",
    tokenSource: "option"
  });
  assert.deepEqual(selectServeAuth("0.0.0.0", undefined, { [serveTokenEnvVar]: " env-token " }), {
    token: "env-token",
    tokenSource: "environment"
  });
});

test("selectServeAuth rejects empty or whitespace tokens", () => {
  assert.match(selectServeAuth(defaultServeHost, " ", {}).error ?? "", /cannot be empty/);
  assert.match(selectServeAuth(defaultServeHost, "two words", {}).error ?? "", /must not contain whitespace/);
});

test("isServeRequestAuthorized enforces bearer tokens when configured", () => {
  assert.equal(isServeRequestAuthorized(undefined), true);
  assert.equal(isServeRequestAuthorized(undefined, "network-token"), false);
  assert.equal(isServeRequestAuthorized("Basic network-token", "network-token"), false);
  assert.equal(isServeRequestAuthorized("Bearer wrong-token", "network-token"), false);
  assert.equal(isServeRequestAuthorized("Bearer network-token", "network-token"), true);
  assert.equal(isServeRequestAuthorized(["Bearer wrong-token", "Bearer network-token"], "network-token"), true);
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
