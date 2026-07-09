// Clash Verge extension script
// Creates a dedicated AI fallback proxy group and routes AI-related traffic to it.

function main(config) {
  config = config || {};

  const originalRules = Array.isArray(config["rules"]) ? config["rules"] : [];
  const aiProxyGroup = ensureAiProxyGroup(config);
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
  const aiGroupName = "🤖 AI Fallback";
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
    name: aiGroupName,
    type: "fallback",
    proxies: fallbackNodes,
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    lazy: true
  });

  return aiGroupName;
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
