// Define main function (script entry)
function main(config) {
  // 初始化空数组，用于存储处理后的规则（支持插入新行）
  const newRules = [];

  // ===================== 新增功能：TikTok 规则 =====================
  const tiktokNode = '美国 A09 Gemini 移动优化路由'; // 指定 TikTok 走的节点名称
  const tiktokDomains = [
    "tiktok.com",          // TikTok 主域名
    "tiktokv.com",         // TikTok 视频和 API 数据
    "tiktokcdn.com",       // TikTok 主要内容分发网络
    "tiktokcdn-us.com",    // TikTok 美国区 CDN
    "byteoversea.com",     // 字节跳动海外 API 和追踪
    "ibytedtok.com",       // 字节跳动 TikTok 相关服务
    "musical.ly",          // TikTok 前身，部分旧接口仍在使用
    "muscdn.com"           // Musical.ly CDN，仍在共用
  ];
  
  // 将 TikTok 域名规则插入到最前面（优先级最高）
  tiktokDomains.forEach(domain => {
    newRules.push(`DOMAIN-SUFFIX,${domain},${tiktokNode}`);
  });
  // 增加一条关键字匹配作为兜底
  newRules.push(`DOMAIN-KEYWORD,tiktok,${tiktokNode}`);

  // ===================== 原有功能：ChatGPT 规则 =====================
  const llmNode = '美国 A09 Gemini 移动优化路由';
  newRules.push("DOMAIN-SUFFIX,chatgpt.com," + llmNode);
  newRules.push("DOMAIN-SUFFIX,openai.com," + llmNode);

  // 遍历原始规则
  (config["rules"] || []).forEach(rule => {
    // ===================== 原有功能：插入指定规则 =====================
    const insertNewRule = "DOMAIN-SUFFIX,googleapis.cn,\u{1F530} 手动选择";
    
    // 如果当前行是目标规则，先在上一行插入新规则
    if (rule.includes("DOMAIN-SUFFIX,cn,")) {
      newRules.push(insertNewRule);
    }

    // ===================== 原有功能：GEOIP规则添加no-resolve =====================
    if (rule.includes("GEOIP,CN") && rule.includes("Direct")) {
      // 原规则后添加 no-resolve
      newRules.push(rule + ",no-resolve");
    } else {
      // 其他规则直接保留
      newRules.push(rule);
    }
  });

  // 替换为处理后的完整规则
  config["rules"] = newRules;
  return config;
}
