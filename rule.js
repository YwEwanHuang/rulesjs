// Clash Verge extension script
// Creates dedicated proxy groups for AI services and routes traffic accordingly.

function main(config) {
  config = config || {};

  const originalRules = Array.isArray(config["rules"]) ? config["rules"] : [];
  const oneDriveProxyGroup = ensureFallbackProxyGroup(
    config,
    "☁️ OneDrive Fallback",
    "https://onedrive.live.com/"
  );
  const aiProxyGroup = ensureAiProxyGroup(config);
  const anthropicProxyGroup = ensureAnthropicProxyGroup(config);
  const priorityGroups = ["🔰 手动选择", "🤖 ChatGPT Codex", "☁️ Anthropic Stable"];
  const groups = config["proxy-groups"];
  if (Array.isArray(groups)) {
    for (const name of priorityGroups.slice().reverse()) {
      const index = groups.findIndex(group => group && group.name === name);
      if (index >= 0) {
        groups.unshift(groups.splice(index, 1)[0]);
      }
    }
  }
  const newRules = [];
  const seen = new Set();

  function addRule(rule) {
    if (!seen.has(rule)) {
      newRules.push(rule);
      seen.add(rule);
    }
  }

  function withNoResolve(rule) {
    const parts = String(rule).split(",");
    if (parts[0] === "GEOIP" && parts[1] === "CN" && !parts.includes("no-resolve")) {
      return rule + ",no-resolve";
    }
    return rule;
  }

  // Claude PROCESS rule — must be first so it wins over keyword/domain rules
  addRule(`PROCESS-NAME-REGEX,(?i)^claude(\\.exe)?$,${anthropicProxyGroup}`);

  // Anthropic domain rules — placed before general AI rules
  ["anthropic.com", "claude.ai", "claude.com", "claudeusercontent.com"].forEach(domain => {
    addRule(`DOMAIN-SUFFIX,${domain},${anthropicProxyGroup}`);
  });

  [
    "onedrive.live.com",
    "api.onedrive.com",
    "login.microsoftonline.com",
    // storage CDNs — required for OneDrive sync after login
    // subscription has DOMAIN-SUFFIX,storage.live.com,DIRECT; script rules
    // prepend via first-match, so these win before any subscription rule.
    "storage.live.com",
    "files.1drv.com"
  ].forEach(domain => {
    addRule(`DOMAIN-SUFFIX,${domain},${oneDriveProxyGroup}`);
  });

  // IEEE / academic — Direct route is geo-blocked by IEEE (HTTP 451 from CN),
  // and mihomo's direct DNS chain is unreliable for these domains in CN.
  // Send to 🔰 手动选择 so the user picks an academic-friendly node.
  [
    "ieee.org",
    "ieeexplore.ieee.org",
    "spectrum.ieee.org",
    "academia.edu",
    "researchgate.net",
    "sciencedirect.com",
    "springer.com",
    "acm.org",
    "dl.acm.org"
  ].forEach(domain => {
    addRule(`DOMAIN-SUFFIX,${domain},🔰 手动选择`);
  });

  const aiDomains = [
    // ChatGPT / OpenAI
    "chatgpt.com",
    "chat.openai.com",
    "ios.chat.openai.com",
    "android.chat.openai.com",
    "realtime.chatgpt.com",
    "ab.chatgpt.com",
    "openai.com",
    "api.openai.com",
    "auth.openai.com",
    "cdn.openai.com",
    "oaistatic.com",
    "oaiusercontent.com",
    "codex.openai.com",
    "openai.azure.com",

    // OpenAI-related infrastructure
    "sentry.io",
    "statsigapi.net",
    "featuregates.org",
    "intercom.io",
    "intercomcdn.com",
    "client-api.arkoselabs.com",

    // Gemini / Google AI
    "gemini.google.com",
    "aistudio.google.com",
    "ai.google.dev",
    "generativelanguage.googleapis.com",
    "googleapis.cn",

    // TikTok
    "tiktok.com",
    "tiktokv.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "byteoversea.com",
    "ibytedtok.com",
    "musical.ly",
    "muscdn.com"
  ];

  const aiKeywords = [
    "chatgpt",
    "openai",
    "codex",
    "oaistatic",
    "oaiusercontent",
    "gemini",
    "tiktok"
  ];

  aiDomains.forEach(domain => {
    addRule(`DOMAIN-SUFFIX,${domain},${aiProxyGroup}`);
  });

  aiKeywords.forEach(keyword => {
    addRule(`DOMAIN-KEYWORD,${keyword},${aiProxyGroup}`);
  });

  originalRules.forEach(rule => {
    addRule(withNoResolve(rule));
  });

  config["rules"] = newRules;
  return config;
}

function ensureAiProxyGroup(config) {
  return ensureFallbackProxyGroup(
    config,
    "🤖 ChatGPT Codex",
    "http://www.gstatic.com/generate_204"
  );
}

function ensureAnthropicProxyGroup(config) {
  const proxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];
  const proxyNames = proxies
    .map(proxy => proxy && proxy.name)
    .filter(name => typeof name === "string" && name.length > 0);

  const preferredNodes = proxyNames.filter(name =>
    name.includes("Gemini") ||
    name.includes("日本") ||
    name.includes("新加坡")
  );

  // Reuse existing node filter, fall back to all proxies, never DIRECT
  const selectedNodes = preferredNodes.length > 0 ? preferredNodes : proxyNames;
  const groupName = "☁️ Anthropic Stable";

  if (selectedNodes.length === 0) {
    // No proxy at all — use REJECT so traffic fails closed, never leaks DIRECT
    return "REJECT";
  }

  upsertProxyGroup(config, {
    name: groupName,
    type: "select",
    proxies: selectedNodes
  });

  return groupName;
}

function ensureFallbackProxyGroup(config, groupName, healthUrl) {
  const proxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];
  const proxyNames = proxies
    .map(proxy => proxy && proxy.name)
    .filter(name => typeof name === "string" && name.length > 0);

  const fallbackNodes = proxyNames.filter(name =>
    name.includes("Gemini") ||
    name.includes("日本") ||
    name.includes("新加坡")
  );

  if (fallbackNodes.length === 0) {
    return proxyNames[0] || "DIRECT";
  }

  upsertProxyGroup(config, {
    name: groupName,
    type: "fallback",
    proxies: fallbackNodes,
    url: healthUrl,
    interval: 300,
    lazy: true
  });

  return groupName;
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
