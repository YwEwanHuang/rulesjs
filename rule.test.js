const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "rule.js"), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source, context, { filename: "rule.js" });
const { main } = context;

const ai = "🤖 ChatGPT Codex";
const claude = "☁️ Anthropic Stable";
const oneDrive = "☁️ OneDrive Fallback";
const manual = "🔰 手动选择";
const microsoft = "Ⓜ️ Microsoft";
const proxy = name => ({ name, type: "http", server: "127.0.0.1", port: 18080 });
const run = config => JSON.parse(JSON.stringify(main(structuredClone(config))));
const group = (config, name) => config["proxy-groups"].find(item => item.name === name);

function fixture() {
  return {
    proxies: ["美国节点", "日本节点", "Gemini Gateway", "新加坡节点", "🇯🇵 Tokyo", "[sgp02]", "Japan 03", "XSgProxy"].map(proxy),
    "proxy-groups": [
      { name: manual, type: "select", proxies: ["美国节点"] },
      { name: microsoft, type: "select", proxies: ["DIRECT"] },
      { name: oneDrive, type: "select", proxies: ["stale"] }
    ],
    rules: [
      "DOMAIN-KEYWORD,1drv,DIRECT",
      "DOMAIN-SUFFIX,storage.live.com,DIRECT",
      "PROCESS-NAME,OneDrive,DIRECT",
      `DOMAIN-SUFFIX,live.com,${microsoft}`,
      `DOMAIN-SUFFIX,login.microsoftonline.com,${microsoft}`,
      "MATCH,DIRECT",
      "GEOIP,CN,DIRECT",
      "DOMAIN-SUFFIX,cn,DIRECT",
      "DOMAIN,router.asus.com,DIRECT"
    ]
  };
}

// Exercise first-match behavior for the rule types used in these fixtures.
function splitLogic(payload) {
  const clauses = [];
  let depth = 0;
  let start;
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] === "\\") i++;
    else if (payload[i] === "(" && depth++ === 1) start = i + 1;
    else if (payload[i] === ")" && --depth === 1) clauses.push(payload.slice(start, i));
  }
  return clauses;
}

function route(config, host, { process = "", network = "TCP", lan = false, cgnat = false, skipUdp = [] } = {}) {
  function matches(clause) {
    if (clause === "MATCH") return true;
    const i = clause.indexOf(",");
    const type = clause.slice(0, i);
    const payload = clause.slice(i + 1);
    switch (type) {
      case "DOMAIN": return host === payload;
      case "DOMAIN-SUFFIX": return host === payload || host.endsWith(`.${payload}`);
      case "DOMAIN-KEYWORD": return host.includes(payload);
      case "DOMAIN-REGEX": return new RegExp(payload, "i").test(host);
      case "PROCESS-NAME": return process === payload;
      case "PROCESS-NAME-REGEX": return new RegExp(payload.replace(/^\(\?i\)/, ""), "i").test(process);
      case "NETWORK": return network === payload;
      case "GEOIP": return payload === "LAN" && lan;
      case "IP-CIDR": return payload === "100.64.0.0/10,no-resolve" && cgnat;
      case "AND": return splitLogic(payload).every(matches);
      case "OR": return splitLogic(payload).some(matches);
      case "NOT": return !matches(splitLogic(payload)[0]);
      default: throw new Error(`Unexpected fixture rule: ${clause}`);
    }
  }
  for (const rule of config.rules) {
    const text = rule.replace(/,no-resolve$/, "");
    const i = text.lastIndexOf(",");
    const policy = text.slice(i + 1);
    if (network === "UDP" && skipUdp.includes(policy)) continue;
    if (matches(text.slice(0, i))) return policy;
  }
}

test("preserves strategy names, order, manual Claude selection and both fallback groups", () => {
  const result = run(fixture());
  assert.deepEqual(result["proxy-groups"].map(item => item.name), [manual, ai, claude, microsoft, oneDrive]);
  assert.deepEqual(group(result, claude), {
    name: claude, type: "select", "empty-fallback": "REJECT",
    proxies: ["日本节点", "Gemini Gateway", "新加坡节点", "🇯🇵 Tokyo", "[sgp02]", "Japan 03"]
  });
  for (const [name, url] of [[ai, "https://api.openai.com/v1/models"], [oneDrive, "https://api.onedrive.com/v1.0/drive"]]) {
    const fallback = group(result, name);
    assert.equal(fallback.type, "fallback");
    assert.deepEqual(fallback.proxies, [...group(result, claude).proxies, "美国节点", "XSgProxy"]);
    assert.equal(fallback.url, url);
    assert.equal(fallback["expected-status"], "401");
    assert.equal(fallback.interval, 300);
    assert.equal(fallback.timeout, 5000);
    assert.equal(fallback.lazy, true);
  }
});

test("routes OpenAI, Codex WebSocket, Claude, Gemini, TikTok and academic hosts precisely", () => {
  const result = run(fixture());
  for (const [policy, hosts] of [
    [ai, ["chatgpt.com", "ws.chatgpt.com", "codex.openai.com", "api.openai.com", "auth.openai.com", "x.oaistatsig.com",
      "cdn.openaimerge.com", "setup.workos.com", "x.oaiusercontent.com", "x.oaistatic.com", "x.openai.azure.com",
      "gemini.google.com", "aistudio.google.com", "ai.google.dev", "generativelanguage.googleapis.com", "www.tiktok.com", "v.tiktokcdn-us.com"]],
    [claude, ["www.claude.ai", "api.anthropic.com", "statsig.anthropic.com", "platform.claude.com", "x.claudeusercontent.com"]],
    [manual, ["ieeexplore.ieee.org", "dl.acm.org", "www.sciencedirect.com", "link.springer.com", "researchgate.net", "www.nature.com"]],
    ["DIRECT", ["baidu.com", "gemini.example.cn", "codex.example.com", "not-openai.com", "openai.com.example.com",
      "maps.googleapis.cn", "sentry.io", "intercom.io", "challenges.cloudflare.com", "statsigapi.net", "douyin.com"]]
  ]) {
    for (const host of hosts) assert.equal(route(result, host), policy, host);
  }
  assert.ok(!result.rules.some(rule => rule === `DOMAIN-SUFFIX,api.openai.com,${ai}` || rule.startsWith("DOMAIN-KEYWORD,gemini,")));
});

test("OneDrive overrides storage DIRECT conflicts but scopes shared sign-in to its process", () => {
  const result = run(fixture());
  for (const host of ["onedrive.live.com", "api.onedrive.com", "1drv.ms", "api.live.net", "apis.live.net",
    "d.docs.live.net", "a.b.livefilestore.com", "x.files.1drv.com", "x.storage.live.com", "oneclient.sfx.ms"]) {
    assert.equal(route(result, host, { process: "OneDrive" }), oneDrive, host);
    assert.equal(route(result, host), oneDrive, host);
  }
  for (const host of ["login.live.com", "oauth.live.com"]) {
    assert.equal(route(result, host, { process: "ONEDRIVE.EXE" }), oneDrive);
    assert.equal(route(result, host, { process: "Outlook" }), microsoft);
  }
  assert.equal(route(result, "login.microsoftonline.com"), microsoft);
  assert.equal(route(result, "login.windows.net"), "DIRECT");
  assert.equal(route(result, "tenant.sharepoint.com"), "DIRECT");
  assert.ok(result.rules.includes("DOMAIN-SUFFIX,storage.live.com,DIRECT"));
  assert.ok(result.rules.includes("PROCESS-NAME,OneDrive,DIRECT"));
});

test("Claude process fallback leaves local and subscription-specific traffic alone", () => {
  const result = run(fixture());
  for (const process of ["Claude", "claude.exe", "Claude Helper (Renderer)"]) {
    assert.equal(route(result, "external.example.com", { process }), claude);
  }
  for (const host of ["localhost", "printer", "my.nas.local", "nas.home.arpa", "router.asus.com", "example.cn"]) {
    assert.equal(route(result, host, { process: "claude" }), "DIRECT", host);
  }
  assert.equal(route(result, "nas.example.com", { process: "Claude", lan: true }), "DIRECT");
  for (const address of [{ lan: true }, { cgnat: true }]) {
    assert.equal(route(result, "", { process: "Claude", ...address }), "DIRECT");
  }
  assert.equal(route(result, "chatgpt.com", { process: "Claude" }), ai);
  assert.equal(route(result, "external.example.com", { process: "claude-other.exe" }), "DIRECT");
});

test("UDP keeps the matched AI policy or rejects if it cannot carry UDP", () => {
  const result = run(fixture());
  for (const [host, policy, process] of [["ws.chatgpt.com", ai], ["api.anthropic.com", claude], ["example.com", claude, "claude"]]) {
    assert.equal(route(result, host, { network: "UDP", process }), policy);
    assert.equal(route(result, host, { network: "UDP", process, skipUdp: [policy] }), "REJECT");
  }
  assert.equal(route(result, "unrelated.example.com", { network: "UDP" }), "DIRECT");
});

test("no nodes fails closed for AI; no manual group leaves academic rules to the subscription", () => {
  const result = run({
    proxies: [{ name: "Tokyo Direct", type: "direct" }, { name: "Mistaken DNS", type: "dns" }],
    rules: ["DOMAIN-SUFFIX,ieee.org,DIRECT", "MATCH,DIRECT"]
  });
  for (const name of [ai, claude]) {
    assert.deepEqual(group(result, name).proxies, ["REJECT"]);
    assert.equal(group(result, name)["empty-fallback"], "REJECT");
  }
  assert.deepEqual(group(result, oneDrive).proxies, ["DIRECT"]);
  assert.equal(group(result, manual), undefined);
  assert.equal(route(result, "ieeexplore.ieee.org"), "DIRECT");
  assert.equal(route(result, "api.openai.com"), ai);
  assert.equal(route(result, "api.anthropic.com"), claude);
  assert.deepEqual(run(result), result);
});

test("Provider-only and mixed groups reference providers via use without a DIRECT AI fallback", () => {
  const providers = {
    remote: { type: "http", url: "https://example.com/provider.yaml" },
    cached: { type: "file", path: "./provider.yaml" },
    inline: { type: "inline", payload: [proxy("JP01")] }
  };
  const providerOnly = run({ "proxy-providers": providers });
  for (const name of [ai, claude, oneDrive]) {
    assert.deepEqual(group(providerOnly, name).use, Object.keys(providers));
    assert.equal(group(providerOnly, name).proxies, undefined);
    assert.match(group(providerOnly, name)["exclude-type"], /Direct/);
  }
  assert.equal(group(providerOnly, ai)["empty-fallback"], "REJECT");
  assert.deepEqual(providerOnly["proxy-providers"], providers);
  const mixed = run({ proxies: [proxy("US01")], "proxy-providers": providers });
  assert.deepEqual(group(mixed, ai).proxies, ["US01"]);
  assert.deepEqual(group(mixed, ai).use, Object.keys(providers));
  assert.deepEqual(run(mixed), mixed);
});

test("reapplying after a subscription update rebuilds groups, repairs stale references and keeps MATCH last", () => {
  const result = run(fixture());
  assert.deepEqual(run(result), result);
  const updated = run({
    ...result,
    proxies: [proxy("new-US-01")],
    "proxy-groups": [...result["proxy-groups"], {
      name: "old-pool", type: "select", proxies: ["GLOBAL"], use: ["old-provider"], "empty-fallback": "stale"
    }],
    rules: [...result.rules, "DOMAIN,old.example,missing-policy", "DOMAIN-REGEX,^x{1,2}\\.example$,missing-policy", "DOMAIN,global.example,GLOBAL"]
  });
  for (const name of [ai, claude, oneDrive]) assert.deepEqual(group(updated, name).proxies, ["new-US-01"]);
  assert.deepEqual(group(updated, manual).proxies, ["REJECT"]);
  assert.deepEqual(group(updated, "old-pool").use, []);
  assert.deepEqual(group(updated, "old-pool").proxies, ["REJECT"]);
  assert.equal(group(updated, "old-pool")["empty-fallback"], "REJECT");
  assert.ok(updated.rules.includes("DOMAIN,old.example,REJECT"));
  assert.ok(updated.rules.includes("DOMAIN-REGEX,^x{1,2}\\.example$,REJECT"));
  assert.ok(updated.rules.includes("GEOIP,CN,DIRECT,no-resolve"));
  assert.ok(updated.rules.includes("DOMAIN,global.example,GLOBAL"));
  assert.equal(updated.rules.at(-1), "MATCH,DIRECT");
  assert.deepEqual(run(updated), updated);
});

test("generated configs pass the Mihomo parser", { skip: !process.env.MIHOMO_BIN }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-test-"));
  try {
    const providers = {
      inline: { type: "inline", payload: [proxy("Osaka")] },
      cached: { type: "file", path: "./provider.yaml" },
      remote: { type: "http", url: "https://example.com/provider.yaml", path: "./remote.yaml" }
    };
    const providerData = JSON.stringify({ proxies: [proxy("SG 01")] });
    fs.writeFileSync(path.join(dir, "provider.yaml"), providerData);
    fs.writeFileSync(path.join(dir, "remote.yaml"), providerData);
    const normal = fixture();
    normal.rules = normal.rules.filter(rule => !rule.startsWith("GEOIP,CN,"));
    const configs = [normal, {}, { proxies: [proxy("US01")] }, { "proxy-providers": providers }, {
      proxies: [proxy("JP01")], "proxy-providers": providers,
      "proxy-groups": [{ name: manual, type: "select", proxies: ["stale", "GLOBAL", ai], use: ["stale"] }],
      rules: ["DOMAIN,global.example,GLOBAL", "MATCH,stale"]
    }];
    configs.forEach((config, i) => {
      const file = path.join(dir, `config-${i}.json`);
      fs.writeFileSync(file, JSON.stringify(run(config)));
      execFileSync(process.env.MIHOMO_BIN, ["-t", "-d", dir, "-f", file], { stdio: "pipe", timeout: 10000 });
    });
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
