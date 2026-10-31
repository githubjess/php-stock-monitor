import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLegalPage } from "./legal-pages.js";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const codes = ["en", "de", "es", "fr", "vi", "zh-Hans", "zh-Hant"];
const english = JSON.parse(read("../locales/en.json"));
const html = read("../index.html");

test("all seven catalogs cover every homepage translation key", () => {
  const used = new Set([...html.matchAll(/data-i18n(?:-text|-aria-label|-alt|-content)?="([^"]+)"/g)].map((match) => match[1]));
  used.add("page.title");
  assert.deepEqual([...used].sort(), Object.keys(english).sort());
  for (const code of codes) {
    const messages = JSON.parse(read(`../locales/${code}.json`));
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), code);
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, "string", `${code}:${key}`);
      assert.ok(value.trim(), `${code}:${key}`);
      assert.ok(!value.includes("<"), `${code}:${key}: translations contain text only`);
    }
  }
  assert.deepEqual([...html.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), codes);
});

test("reviewed policies and incomplete legal drafts stay distinct", () => {
  for (const code of codes) {
    assert.deepEqual(resolveLegalPage("privacy", code), {
      href: "/jm-authenticator/privacy/", language: "en",
    });
    assert.deepEqual(resolveLegalPage("impressum", code), {
      href: `/impressum/?lang=${code}`, language: code, draft: true,
    });
  }
  assert.equal(resolveLegalPage("unknown", "en"), null);
});

test("all seven legal drafts cover the German template and retain safeguards", () => {
  const legalHtml = read("../impressum/index.html");
  const german = JSON.parse(read("../locales/impressum/de.json"));
  const used = new Set([...legalHtml.matchAll(/data-i18n(?:-text|-aria-label|-alt|-content)?="(legal\.[^"]+)"/g)].map((match) => match[1]));
  used.add("legal.pageTitle");
  assert.deepEqual([...used].sort(), Object.keys(german).sort());
  assert.match(legalHtml, /<html lang="de">/);
  assert.match(legalHtml, /content="noindex, nofollow"/);
  assert.match(legalHtml, /href="\/impressum\/\?lang=de" hreflang="de"/);
  for (const code of codes) {
    const messages = JSON.parse(read(`../locales/impressum/${code}.json`));
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(german).sort());
    assert.ok(Object.values(messages).every((value) => typeof value === "string" && value.trim()));
    assert.equal(Object.values(messages).filter((value) => value === "pending").length, 1);
    assert.equal(messages["legal.emailValue"], "business@jegprofil.info");
    assert.ok(!Object.values(messages).some((value) => value.startsWith("[")));
  }
  assert.match(legalHtml, /href="mailto:business@jegprofil.info"/);
});
