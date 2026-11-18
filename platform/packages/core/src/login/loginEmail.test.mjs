// signInAddress: what the sign-in page types becomes the GoTrue address (see loginEmail.ts).
import assert from "node:assert/strict";
import { signInAddress, loginEmail } from "./loginEmail.ts";

assert.equal(signInAddress("Anna.Weber@Example.com"), "anna.weber@example.com", "an address is lower-cased");
assert.equal(signInAddress("  anna.weber@example.com  "), "anna.weber@example.com", "and trimmed");
assert.equal(signInAddress("anna.weber"), "anna.weber@login.rbp.invalid", "a username gets its reserved-domain address");
assert.equal(signInAddress(" Anna.Weber "), loginEmail("anna.weber"), "trimmed and lower-cased as loginEmail does");
assert.equal(signInAddress("anna.w@login.rbp.invalid"), "anna.w@login.rbp.invalid", "an activation answer passes unchanged");
console.log("loginEmail ok");
