// Define main function (script entry)
function main(config) {
  // ===================== 1. 检测 PolYun 存在性 =====================
  // 遍历 proxy-groups 检查是否有名为 "PolYun" 的组
  const hasPolYun = (config["proxy-groups"] || []).some(group => 
    group.name === "PolYun" || group.name.includes("PolYun")
  );

  // 如果检测到 PolYun，直接返回原配置，不做任何修改
  if (hasPolYun) {
    return config;
  }

  // ===================== 2. 执行规则修改逻辑 (仅在无 PolYun 时运行) =====================
  const newRules = [];

  // TikTok / OpenAI / Gemini 规则逻辑
  const proxyNode = '美国 A09 Gemini 移动优化';
  const proxyDomains = [
    // TikTok
    "tiktok.com",
    "tiktokv.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "byteoversea.com",
    "ibytedtok.com",
    "musical.ly",
    "muscdn.com",
    // OpenAI / ChatGPT
    "chatgpt.com",
    "openai.com",
    "oaiusercontent.com",
    "openai.org",
    "openai.azure.com",
    // Gemini
    "gemini.google.com",
    "aistudio.google.com",
    "ai.google.dev",
    "generativelanguage.googleapis.com",
  ];
  proxyDomains.forEach(domain => {
    newRules.push(`DOMAIN-SUFFIX,${domain},${proxyNode}`);
  });
  newRules.push(`DOMAIN-KEYWORD,tiktok,${proxyNode}`);

  // 处理原始规则
  (config["rules"] || []).forEach(rule => {
    // 插入 googleapis.cn 到匹配到的 cn 规则之前
    // 注意：这里使用的是针对 R3RbmUJWRZyK.yaml 的 "\u{1F530} 手动选择"
    const insertNewRule = "DOMAIN-SUFFIX,googleapis.cn,\u{1F530} 手动选择";
    
    if (rule.includes("DOMAIN-SUFFIX,cn,")) {
      newRules.push(insertNewRule);
    }

    // GEOIP 规则添加 no-resolve
    if (rule.includes("GEOIP,CN") && rule.includes("Direct")) {
      // 避免重复添加 no-resolve
      if (!rule.includes("no-resolve")) {
        newRules.push(rule + ",no-resolve");
      } else {
        newRules.push(rule);
      }
    } else {
      newRules.push(rule);
    }
  });

  // 替换为处理后的规则
  config["rules"] = newRules;

  return config;
}
