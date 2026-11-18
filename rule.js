// Clash Verge extension script
// Creates dedicated proxy groups and prepends service-specific rules.

const AI_GROUP = "🤖 ChatGPT Codex";
const CLAUDE_GROUP = "☁️ Anthropic Stable";
const ONEDRIVE_GROUP = "☁️ OneDrive Fallback";
const MANUAL_GROUP = "🔰 手动选择";
const BUILTIN_POLICIES = ["DIRECT", "REJECT", "REJECT-DROP", "COMPATIBLE", "PASS", "PASS-RULE"];
const PREFERRED_NODE = /gemini|日本|新加坡|狮城|獅城|🇯🇵|🇸🇬|japan|singapore|tokyo|osaka|(?:^|[^a-z])(?:jp|jpn|sg|sgp)(?![a-z])/i;

function main(config) {
  config = config || {};

  const originalRules = Array.isArray(config["rules"]) ? config["rules"] : [];
  const proxies = (Array.isArray(config["proxies"]) ? config["proxies"] : []).filter(proxy =>
    proxy && typeof proxy.name === "string" && proxy.name.trim()
  );
  const proxyNames = new Set(proxies.map(proxy => proxy.name));
  const providers = Object.entries(config["proxy-providers"] || {})
    .filter(([, provider]) => provider && ["http", "file", "inline"].includes(provider.type))
    .map(([name]) => name);
  const nodes = [...new Set(proxies.filter(proxy => !BUILTIN_POLICIES.includes(proxy.name) &&
    !/^(?:direct|dns|pass(?:-rule)?|compatible|reject(?:-drop)?|rematch)$/i.test(proxy.type))
    .map(proxy => proxy.name))];
  const preferred = nodes.filter(name => PREFERRED_NODE.test(name));
  const fallbackNodes = [...preferred, ...nodes.filter(name => !PREFERRED_NODE.test(name))];

  ensureProxyGroup(config, ONEDRIVE_GROUP, fallbackNodes, providers, "DIRECT", {
    url: "https://api.onedrive.com/v1.0/drive",
    "expected-status": "401"
  });
  ensureProxyGroup(config, AI_GROUP, preferred, providers, "REJECT", {
    url: "https://api.openai.com/v1/models",
    "expected-status": "401"
  });
  ensureProxyGroup(config, CLAUDE_GROUP, preferred.length ? preferred : nodes, providers, "REJECT");

  const priorityGroups = [MANUAL_GROUP, AI_GROUP, CLAUDE_GROUP];
  const groups = config["proxy-groups"];
  for (const name of priorityGroups.slice().reverse()) {
    const index = groups.findIndex(group => group && group.name === name);
    if (index >= 0) {
      groups.unshift(groups.splice(index, 1)[0]);
    }
  }
  const outboundNames = new Set([...BUILTIN_POLICIES, ...proxyNames]);
  const policies = new Set([...outboundNames, ...groups.map(group => group && group.name)]);
  for (const group of groups) {
    if (!group) continue;
    if (Array.isArray(group.proxies)) {
      group.proxies = group.proxies.filter(name => policies.has(name) && name !== group.name);
    }
    if (Array.isArray(group.use)) {
      group.use = group.use.filter(name => providers.includes(name));
    }
    if (group["empty-fallback"] && !outboundNames.has(group["empty-fallback"])) {
      group["empty-fallback"] = "REJECT";
    }
    if (!group.proxies?.length && !group.use?.length && !group["include-all"] &&
        !group["include-all-proxies"] && !(group["include-all-providers"] && providers.length)) {
      group.proxies = ["REJECT"];
    }
  }

  // An implicit GLOBAL is available to rules, but is created after user groups.
  policies.add("GLOBAL");

  const newRules = new Set();
  function addAiRules(clauses, group) {
    clauses.forEach(clause => newRules.add(`${clause},${group}`));
    // Mihomo skips a matching rule if its selected outbound cannot carry UDP.
    newRules.add(`AND,((NETWORK,UDP),(${anyOf(clauses)})),REJECT`);
  }

  addAiRules([
    "anthropic.com", "claude.ai", "claude.com", "claudeusercontent.com"
  ].map(domain => `DOMAIN-SUFFIX,${domain}`), CLAUDE_GROUP);

  // Microsoft Learn: required URLs and ports for OneDrive consumer.
  [
    "onedrive.com", "onedrive.live.com", "1drv.ms", "files.1drv.com", "storage.live.com",
    "livefilestore.com", "docs.live.net", "storage.msn.com", "skydrive.live.com"
  ].forEach(domain => newRules.add(`DOMAIN-SUFFIX,${domain},${ONEDRIVE_GROUP}`));
  [
    "api.live.net", "apis.live.net", "skyapi.live.net", "snapi.live.net",
    "oneclient.sfx.ms", "skydrive.wns.windows.com", "odc.officeapps.live.com"
  ].forEach(domain => newRules.add(`DOMAIN,${domain},${ONEDRIVE_GROUP}`));

  // Consumer sign-in is shared with Outlook; Entra / SharePoint stay with the subscription.
  const oneDriveProcess = "PROCESS-NAME-REGEX,(?i)^onedrive(\\.exe)?$";
  const sharedOneDrive = anyOf([
    ...["login.live.com", "oauth.live.com", "g.live.com", "p.sfx.ms", "spoprod-a.akamaihd.net"]
      .map(domain => `DOMAIN,${domain}`),
    "DOMAIN-SUFFIX,policies.live.net", "DOMAIN-SUFFIX,settings.live.net"
  ]);
  newRules.add(`AND,((${oneDriveProcess}),(${sharedOneDrive})),${ONEDRIVE_GROUP}`);

  if (groups.some(group => group && group.name === MANUAL_GROUP)) {
    [
      "ieee.org", "academia.edu", "researchgate.net", "sciencedirect.com", "springer.com", "acm.org",
      "nature.com"
    ].forEach(domain => newRules.add(`DOMAIN-SUFFIX,${domain},${MANUAL_GROUP}`));
  }

  addAiRules([
    // OpenAI / Codex WebSockets (ws.chatgpt.com and chatgpt.com) are covered here.
    ...["chatgpt.com", "openai.com", "oaistatic.com", "oaiusercontent.com", "oaistatsig.com", "openai.azure.com",
      "ai.google.dev", "tiktok.com", "tiktokv.com", "tiktokcdn.com", "tiktokcdn-us.com",
      "byteoversea.com", "ibytedtok.com", "musical.ly", "muscdn.com"
    ].map(domain => `DOMAIN-SUFFIX,${domain}`),
    // Use exact hosts for the documented CDN, sign-in and Gemini endpoints.
    // Shared CAPTCHA, payment and telemetry hosts keep the subscription policy.
    ...["cdn.openaimerge.com", "cdn.workos.com", "forwarder.workos.com", "frontend-apps-multi-region.workos.com",
      "images.workoscdn.com", "setup.workos.com", "workos.imgix.net",
      "gemini.google.com", "aistudio.google.com", "generativelanguage.googleapis.com"
    ].map(domain => `DOMAIN,${domain}`)
  ], AI_GROUP);
  // shortcut: IP-only Voice UDP/3478 needs a maintained IP list; do not match other apps on the same port.

  const local = anyOf([
    "DOMAIN-REGEX,^[^.]+$|(?:^|\\.)(?:localhost|local|lan|internal|home\\.arpa)$",
    // Only resolve for the process fallback, so private FQDNs remain with the subscription.
    "GEOIP,LAN", "IP-CIDR,100.64.0.0/10,no-resolve"
  ]);
  const claudeProcess = `AND,((PROCESS-NAME-REGEX,(?i)^claude(?: helper(?: \\(renderer\\))?)?(\\.exe)?$),(NOT,((${local}))))`;
  const processRules = [
    `${claudeProcess},${CLAUDE_GROUP}`,
    `AND,((NETWORK,UDP),(${claudeProcess})),REJECT`
  ];

  const finalRules = [];
  for (const rule of originalRules) {
    if (typeof rule !== "string" || processRules.includes(rule)) continue;
    const normalized = normalizeRule(rule, policies);
    if (/^\s*MATCH\s*,/i.test(normalized)) {
      finalRules.push(normalized);
    } else {
      newRules.add(normalized);
    }
  }
  // Explicit subscription rules (including LAN) take precedence over the process fallback.
  processRules.forEach(rule => newRules.add(rule));
  finalRules.forEach(rule => newRules.add(rule));
  config["rules"] = [...newRules];
  return config;
}

function anyOf(clauses) {
  return `OR,(${clauses.map(clause => `(${clause})`).join(",")})`;
}

function normalizeRule(rule, policies) {
  const parts = rule.split(",");
  const type = parts[0].trim().toUpperCase();
  // Match Mihomo's target positions; regexes and logical payloads can contain commas.
  const index = type === "MATCH" ? 1 :
    /^(?:AND|OR|NOT|DOMAIN-REGEX|PROCESS-(?:NAME|PATH)-REGEX)$/.test(type) ? parts.length - 1 : 2;
  if (type !== "SUB-RULE" && index > 0 && parts[index]?.trim() && !policies.has(parts[index].trim())) {
    parts[index] = "REJECT";
  }
  if (type === "GEOIP" && parts[1]?.trim().toUpperCase() === "CN" &&
      !parts.slice(3).some(param => param.trim() === "no-resolve")) {
    parts.push("no-resolve");
  }
  return parts.join(",");
}

function ensureProxyGroup(config, name, nodes, providers, emptyFallback, healthCheck) {
  const group = {
    name,
    type: healthCheck ? "fallback" : "select",
    "empty-fallback": emptyFallback
  };
  if (nodes.length || !providers.length) {
    group.proxies = nodes.length ? nodes : [emptyFallback];
  }
  if (providers.length) {
    group.use = providers;
    // Only the ChatGPT/Codex group excludes non-preferred provider nodes.
    group.filter = `(?i)${PREFERRED_NODE.source}${name === AI_GROUP ? "" : "`.*"}`;
    group["exclude-type"] = "Direct|Compatible|Pass|PassRule|Reject|RejectDrop|Rematch|Dns";
  }
  if (healthCheck) {
    // Unauthenticated API requests should return 401, not a captive portal or a block page.
    Object.assign(group, healthCheck, { interval: 300, timeout: 5000, lazy: true });
  }
  upsertProxyGroup(config, group);
}

function upsertProxyGroup(config, group) {
  if (!Array.isArray(config["proxy-groups"])) {
    config["proxy-groups"] = [];
  }

  const index = config["proxy-groups"].findIndex(item => item && item.name === group.name);
  if (index >= 0) {
    config["proxy-groups"][index] = group;
    return;
  }

  config["proxy-groups"].unshift(group);
}
