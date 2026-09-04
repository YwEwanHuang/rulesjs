const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "rule.js"), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source, context, { filename: "rule.js" });
const { main } = context;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function proxyGroup(config, name) {
  return config["proxy-groups"].find(group => group && group.name === name);
}

function runTests() {
  const config = {
    proxies: [
      { name: "美国节点" },
      { name: "日本节点" },
      { name: "Gemini Gateway" },
      { name: "新加坡节点" }
    ],
    "proxy-groups": [
      { name: "☁️ OneDrive Fallback", type: "select", proxies: ["stale"] }
    ],
    rules: [
      "DOMAIN-SUFFIX,onedrive.live.com,DIRECT",
      "MATCH,DIRECT",
      "GEOIP,CN,DIRECT"
    ]
  };

  const result = plain(main(config));
  const oneDrive = proxyGroup(result, "☁️ OneDrive Fallback");
  const ai = proxyGroup(result, "🤖 AI Fallback");
  const anthropic = proxyGroup(result, "☁️ Anthropic Stable");

  // Existing behavior: OneDrive fallback proxy group unchanged
  assert.deepEqual(oneDrive, {
    name: "☁️ OneDrive Fallback",
    type: "fallback",
    proxies: ["日本节点", "Gemini Gateway", "新加坡节点"],
    url: "https://onedrive.live.com/",
    interval: 300,
    lazy: true
  });

  // Existing behavior: AI fallback proxy group unchanged
  assert.equal(ai.url, "http://www.gstatic.com/generate_204");
  assert.deepEqual(ai.proxies, ["日本节点", "Gemini Gateway", "新加坡节点"]);

  // New: Anthropic Stable is select (no health check), reuses same node filter
  assert.deepEqual(anthropic, {
    name: "☁️ Anthropic Stable",
    type: "select",
    proxies: ["日本节点", "Gemini Gateway", "新加坡节点"]
  });

  // Rule order: Anthropic rules first (4 rules), then OneDrive (3 rules)
  assert.deepEqual(result.rules.slice(0, 5), [
    "PROCESS-NAME-REGEX,(?i)^claude(\\.exe)?$,☁️ Anthropic Stable",
    "DOMAIN-SUFFIX,anthropic.com,☁️ Anthropic Stable",
    "DOMAIN-SUFFIX,claude.ai,☁️ Anthropic Stable",
    "DOMAIN-SUFFIX,claude.com,☁️ Anthropic Stable",
    "DOMAIN-SUFFIX,claudeusercontent.com,☁️ Anthropic Stable"
  ]);

  // OneDrive rules shift to index 5
  assert.deepEqual(result.rules.slice(5, 8), [
    "DOMAIN-SUFFIX,onedrive.live.com,☁️ OneDrive Fallback",
    "DOMAIN-SUFFIX,api.onedrive.com,☁️ OneDrive Fallback",
    "DOMAIN-SUFFIX,login.microsoftonline.com,☁️ OneDrive Fallback"
  ]);

  // Original rules (MATCH, GEOIP) still present, after index 8
  assert.ok(result.rules.indexOf("MATCH,DIRECT") > 8);
  assert.ok(result.rules.indexOf("GEOIP,CN,DIRECT,no-resolve") > 8);

  // Idempotency: running twice must not duplicate groups or rules
  const rerun = plain(main(result));
  assert.equal(rerun["proxy-groups"].filter(group => group.name === "☁️ Anthropic Stable").length, 1);
  assert.equal(rerun["proxy-groups"].filter(group => group.name === "☁️ OneDrive Fallback").length, 1);
  assert.equal(rerun["proxy-groups"].filter(group => group.name === "🤖 AI Fallback").length, 1);
  assert.equal(rerun.rules.filter(rule => rule === "DOMAIN-SUFFIX,anthropic.com,☁️ Anthropic Stable").length, 1);
  assert.equal(rerun.rules.filter(rule => rule === "DOMAIN-SUFFIX,onedrive.live.com,☁️ OneDrive Fallback").length, 1);

  // Fallback when no preferred nodes: use all proxies for Anthropic, first proxy for OneDrive
  const noPreferred = plain(main({
    proxies: [{ name: "美国节点" }],
    "proxy-groups": [],
    rules: []
  }));
  const noPreferredAnthropic = proxyGroup(noPreferred, "☁️ Anthropic Stable");
  assert.equal(noPreferredAnthropic.type, "select");
  assert.deepEqual(noPreferredAnthropic.proxies, ["美国节点"]);
  // Anthropic rules come first (5), then OneDrive (3)
  // No preferred nodes → use all proxies → creates ☁️ Anthropic Stable select group
  assert.equal(noPreferred.rules[0], "PROCESS-NAME-REGEX,(?i)^claude(\\.exe)?$,☁️ Anthropic Stable");
  assert.deepEqual(noPreferred.rules.slice(5, 8), [
    "DOMAIN-SUFFIX,onedrive.live.com,美国节点",
    "DOMAIN-SUFFIX,api.onedrive.com,美国节点",
    "DOMAIN-SUFFIX,login.microsoftonline.com,美国节点"
  ]);

  // No proxies at all: Anthropic uses REJECT (fail-closed), OneDrive uses DIRECT
  const noProxies = plain(main({ "proxy-groups": [], rules: [] }));
  assert.equal(noProxies.rules[0], "PROCESS-NAME-REGEX,(?i)^claude(\\.exe)?$,REJECT");
  assert.equal(noProxies["proxy-groups"].length, 0);
  assert.deepEqual(noProxies.rules.slice(5, 8), [
    "DOMAIN-SUFFIX,onedrive.live.com,DIRECT",
    "DOMAIN-SUFFIX,api.onedrive.com,DIRECT",
    "DOMAIN-SUFFIX,login.microsoftonline.com,DIRECT"
  ]);

  // Subdomain coverage: DOMAIN-SUFFIX covers all subdomains
  assert.ok(noProxies.rules.includes("DOMAIN-SUFFIX,claude.ai,REJECT"));
  assert.ok(noProxies.rules.includes("DOMAIN-SUFFIX,anthropic.com,REJECT"));
}

runTests();
console.log("rule.test.js: all tests passed");