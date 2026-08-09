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

function fallbackGroup(config, name) {
  return config["proxy-groups"].find(group => group.name === name);
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
  const oneDrive = fallbackGroup(result, "☁️ OneDrive Fallback");
  const ai = fallbackGroup(result, "🤖 AI Fallback");

  assert.deepEqual(oneDrive, {
    name: "☁️ OneDrive Fallback",
    type: "fallback",
    proxies: ["日本节点", "Gemini Gateway", "新加坡节点"],
    url: "https://onedrive.live.com/",
    interval: 300,
    lazy: true
  });
  assert.equal(ai.url, "http://www.gstatic.com/generate_204");
  assert.deepEqual(ai.proxies, ["日本节点", "Gemini Gateway", "新加坡节点"]);
  assert.deepEqual(result.rules.slice(0, 3), [
    "DOMAIN-SUFFIX,onedrive.live.com,☁️ OneDrive Fallback",
    "DOMAIN-SUFFIX,api.onedrive.com,☁️ OneDrive Fallback",
    "DOMAIN-SUFFIX,login.microsoftonline.com,☁️ OneDrive Fallback"
  ]);
  assert.ok(result.rules.indexOf("MATCH,DIRECT") > 2);
  assert.ok(result.rules.indexOf("GEOIP,CN,DIRECT,no-resolve") > 2);

  const rerun = plain(main(result));
  assert.equal(rerun["proxy-groups"].filter(group => group.name === "☁️ OneDrive Fallback").length, 1);
  assert.equal(rerun["proxy-groups"].filter(group => group.name === "🤖 AI Fallback").length, 1);
  assert.equal(rerun.rules.filter(rule => rule === "DOMAIN-SUFFIX,onedrive.live.com,☁️ OneDrive Fallback").length, 1);

  const noPreferred = plain(main({
    proxies: [{ name: "美国节点" }],
    "proxy-groups": [],
    rules: []
  }));
  assert.equal(noPreferred["proxy-groups"].length, 0);
  assert.deepEqual(noPreferred.rules.slice(0, 3), [
    "DOMAIN-SUFFIX,onedrive.live.com,美国节点",
    "DOMAIN-SUFFIX,api.onedrive.com,美国节点",
    "DOMAIN-SUFFIX,login.microsoftonline.com,美国节点"
  ]);

  const noProxies = plain(main({ "proxy-groups": [], rules: [] }));
  assert.equal(noProxies["proxy-groups"].length, 0);
  assert.deepEqual(noProxies.rules.slice(0, 3), [
    "DOMAIN-SUFFIX,onedrive.live.com,DIRECT",
    "DOMAIN-SUFFIX,api.onedrive.com,DIRECT",
    "DOMAIN-SUFFIX,login.microsoftonline.com,DIRECT"
  ]);
}

runTests();
console.log("rule.test.js: all tests passed");
