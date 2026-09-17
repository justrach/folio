import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress, publicAddresses } from "../src/lib/public-fetch";

test("DNS guard denies private, special-use and encoded IPv6 destinations", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.31.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2002:7f00::1", "2001:db8::1", "3fff::1", "not-an-ip"])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["104.21.33.59", "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"])
    assert.equal(isPublicAddress(address), true, address);
});

test("DNS must return at least one address and every candidate must be public", () => {
  assert.throws(() => publicAddresses([]));
  assert.throws(() => publicAddresses([{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]));
  assert.throws(() => publicAddresses([{address:"8.8.8.8",family:4},{address:"fd00::1",family:6}]));
  const addresses = [{address:"8.8.8.8",family:4}];
  assert.equal(publicAddresses(addresses), addresses, "The checked addresses themselves are passed to the socket lookup callback.");
});
