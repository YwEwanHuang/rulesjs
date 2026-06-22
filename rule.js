// Clash Verge extension script
function main(config) {
  config = config || {};

  const originalRules = Array.isArray(config["rules"]) ? config["rules"] : [];
  const proxyTarget = resolveProxyTarget(config);
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

  const proxyDomains = [
    // ── ChatGPT / OpenAI core ──
    "chatgpt.com",
    "chat.openai.com",
    "openai.com",
    "api.openai.com",
    "auth.openai.com",
    "cdn.openai.com",
    "oaistatic.com",
    "oaiusercontent.com",
    "codex.openai.com",

    // ChatGPT mobile app
    "ios.chat.openai.com",
    "android.chat.openai.com",
    "realtime.chatgpt.com",
    "ab.chatgpt.com",

    // OpenAI infrastructure / edge
    "openai.azure.com",
    "sentry.io",                         // error reporting
    "statsigapi.net",                    // feature flags / stats
    "featuregates.org",                  // feature gates
    "intercom.io",                       // customer support
    "intercomcdn.com",                   // intercom CDN
    "client-api.arkoselabs.com",         // captcha / verification

    // ── Gemini ──
    "gemini.google.com",
    "aistudio.google.com",
    "ai.google.dev",
    "generativelanguage.googleapis.com", // Gemini API
    "googleapis.cn",                     // China mirror

    // ── TikTok ──
    "tiktok.com",
    "tiktokv.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "byteoversea.com",
    "ibytedtok.com",
    "musical.ly",
    "muscdn.com"
  ];

  const proxyKeywords = [
    "chatgpt",
    "openai",
    "codex",
    "oaistatic",
    "oaiusercontent",
    "tiktok"
  ];

  proxyDomains.forEach(domain => {
    addRule(`DOMAIN-SUFFIX,${domain},${proxyTarget}`);
  });

  proxyKeywords.forEach(keyword => {
    addRule(`DOMAIN-KEYWORD,${keyword},${proxyTarget}`);
  });

  originalRules.forEach(rule => {
    addRule(withNoResolve(rule));
  });

  config["rules"] = newRules;
  return config;
}

function resolveProxyTarget(config) {
  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const proxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];

  const groupNames = groups
    .map(group => group && group.name)
    .filter(name => typeof name === "string" && name.length > 0);

  const proxyNames = proxies
    .map(proxy => proxy && proxy.name)
    .filter(name => typeof name === "string" && name.length > 0);

  const allNames = groupNames.concat(proxyNames);

  const preferredNames = [
    "美国 A09 Gemini 移动优化"
  ];

  for (const name of preferredNames) {
    const exact = allNames.find(item => item === name);
    if (exact) {
      return exact;
    }
  }

  const fuzzy = allNames.find(item =>
    item.includes("Gemini")
  );

  if (fuzzy) {
    return fuzzy;
  }

  return groupNames[0] || proxyNames[0] || "DIRECT";
}
