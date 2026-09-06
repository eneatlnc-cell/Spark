/* Spark Loop — 七语种 i18n 字典 (v3.60)
 * 用法:
 *  · 静态文案: 在 HTML 用 <span data-i18n="key">英语原文</span>;
 *    语言切换时 site.js 依当前语言把 textContent 换成 dict[lang][key]。
 *  · 动态文案 (下载卡/回路条/导览条): site.js 内部以 L(key) 取值。
 *  · 未翻译 key → 回退英文 → 回退元素原有文本。
 */
window.SLI18N = (function () {
  var order = ["en", "zh", "zht", "ja", "ko", "ar", "es"];
  var langs = [
    { id: "en", label: "English" },
    { id: "zh", label: "简体中文" },
    { id: "zht", label: "繁體中文" },
    { id: "ja", label: "日本語" },
    { id: "ko", label: "한국어" },
    { id: "ar", label: "العربية" },
    { id: "es", label: "Español" }
  ];

  var dict = {
    en: {
      // ---- shared chrome ----
      "nav.spark": "Spark",
      "dl.get": "GET ↗",
      "dl.inreview": "IN REVIEW",
      "dl.tag_engine": "Sovereign social · E2EE",
      "dl.tag_vault": "Offline safe · TEE-sealed",
      "loop.here": "YOU ARE HERE",
      "loop.title": "ONE PROJECT · THE SOVEREIGNTY LOOP",
      "loop.wp": "Whitepaper",
      "loop.vault": "the Safe · offline keys",
      "loop.engine": "the App · sovereign social",
      "loop.spark": "the Fuel · presale + IDO",
      "loop.aether": "the Parliament · reserve",
      "loop.havix": "parallel identity · dual track",
      "loop.germ": "the Brain · node AI (future)",
      "loop.st_vault": "SHIPPED v3.44.0",
      "loop.st_engine": "SHIPPED v3.45.1",
      "loop.st_spark": "PRESALE + IDO",
      "loop.st_aether": "AUDIT ✓ · MAINNET PENDING",
      "loop.st_havix": "VALIDATED · STANDBY",
      "loop.st_germ": "FUTURE STAGE",
      "pager.prev": "prev stop",
      "pager.next": "next stop",
      "pager.tour_pre": "the circuit tour · ",
      "footer.rights": "All rights reserved."
    },

    zh: {
      // ---- shared chrome ----
      "nav.spark": "Spark",
      "dl.get": "获取 ↗",
      "dl.inreview": "审核中",
      "dl.tag_engine": "主权社交 · 端到端加密",
      "dl.tag_vault": "离线保险箱 · TEE 封存",
      "loop.here": "你在这里",
      "loop.title": "一个项目 · 主权回路",
      "loop.wp": "白皮书",
      "loop.vault": "保险箱 · 密钥离线",
      "loop.engine": "应用 · 主权社交",
      "loop.spark": "燃料 · 预售+IDO",
      "loop.aether": "议会 · 储备",
      "loop.havix": "平行身份 · 双轨",
      "loop.germ": "大脑 · 节点 AI（远期）",
      "loop.st_vault": "已交付 v3.44.0",
      "loop.st_engine": "已交付 v3.45.1",
      "loop.st_spark": "预售 + IDO",
      "loop.st_aether": "审计完成 · 待主网",
      "loop.st_havix": "已验证 · 待命",
      "loop.st_germ": "远期阶段",
      "pager.prev": "上一站",
      "pager.next": "下一站",
      "pager.tour_pre": "回路导览 · ",
      "footer.rights": "版权所有。"
    },

    zht: {
      // ---- shared chrome ----
      "nav.spark": "Spark",
      "dl.get": "獲取 ↗",
      "dl.inreview": "審核中",
      "dl.tag_engine": "主權社交 · 端到端加密",
      "dl.tag_vault": "離線保險箱 · TEE 封存",
      "loop.here": "你在這裡",
      "loop.title": "一個專案 · 主權迴路",
      "loop.wp": "白皮書",
      "loop.vault": "保險箱 · 密鑰離線",
      "loop.engine": "應用 · 主權社交",
      "loop.spark": "燃料 · 預售+IDO",
      "loop.aether": "議會 · 儲備",
      "loop.havix": "平行身分 · 雙軌",
      "loop.germ": "大腦 · 節點 AI（遠期）",
      "loop.st_vault": "已交付 v3.44.0",
      "loop.st_engine": "已交付 v3.45.1",
      "loop.st_spark": "預售 + IDO",
      "loop.st_aether": "審計完成 · 待主網",
      "loop.st_havix": "已驗證 · 待命",
      "loop.st_germ": "遠期階段",
      "pager.prev": "上一站",
      "pager.next": "下一站",
      "pager.tour_pre": "迴路導覽 · ",
      "footer.rights": "版權所有。"
    },

    ja: {
      // ---- shared chrome ----
      "nav.spark": "Spark",
      "dl.get": "入手 ↗",
      "dl.inreview": "審査中",
      "dl.tag_engine": "主権ソーシャル · エンドツーエンド暗号",
      "dl.tag_vault": "オフライン金庫 · TEE で封鎖",
      "loop.here": "現在地",
      "loop.title": "ONE PROJECT · 主権のループ",
      "loop.wp": "ホワイトペーパー",
      "loop.vault": "金庫 · 鍵はオフライン",
      "loop.engine": "アプリ · 主権ソーシャル",
      "loop.spark": "燃料 · プレセール+IDO",
      "loop.aether": "議会 · 準備金",
      "loop.havix": "並列アイデンティティ · 二重トラック",
      "loop.germ": "大脳 · ノード AI（将来）",
      "loop.st_vault": "リリース v3.44.0",
      "loop.st_engine": "リリース v3.45.1",
      "loop.st_spark": "プレセール + IDO",
      "loop.st_aether": "監査済み · メインネット待ち",
      "loop.st_havix": "検証済み · 待機",
      "loop.st_germ": "将来段階",
      "pager.prev": "前の駅",
      "pager.next": "次の駅",
      "pager.tour_pre": "回路ツアー · ",
      "footer.rights": "全著作権所有。"
    },

    ko: {
      // ---- shared chrome ----
      "nav.spark": "Spark",
      "dl.get": "받기 ↗",
      "dl.inreview": "검토 중",
      "dl.tag_engine": "주권 소셜 · 종단간 암호화",
      "dl.tag_vault": "오프라인 금고 · TEE 봉인",
      "loop.here": "지금 위치",
      "loop.title": "ONE PROJECT · 주권 루프",
      "loop.wp": "백서",
      "loop.vault": "금고 · 키 오프라인",
      "loop.engine": "앱 · 주권 소셜",
      "loop.spark": "연료 · 프리세일+IDO",
      "loop.aether": "의회 · 준비금",
      "loop.havix": "병렬 신원 · 이중 트랙",
      "loop.germ": "뇌 · 노드 AI (미래)",
      "loop.st_vault": "출시 v3.44.0",
      "loop.st_engine": "출시 v3.45.1",
      "loop.st_spark": "프리세일 + IDO",
      "loop.st_aether": "감사 완료 · 메인넷 대기",
      "loop.st_havix": "검증 완료 · 대기",
      "loop.st_germ": "미래 단계",
      "pager.prev": "이전 정거장",
      "pager.next": "다음 정거장",
      "pager.tour_pre": "회로 투어 · ",
      "footer.rights": "모든 권리 보유."
    },

    ar: {
      // ---- shared chrome ----
      "nav.spark": "سبارك",
      "dl.get": "تحميل ↗",
      "dl.inreview": "قيد المراجعة",
      "dl.tag_engine": "تواصل سيادي · تشفير من طرف لطرف",
      "dl.tag_vault": "خزنة بلا إنترنت · محكمة TEE",
      "loop.here": "أنت هنا",
      "loop.title": "مشروع واحد · حلقة السيادة",
      "loop.wp": "الورقة البيضاء",
      "loop.vault": "الخزنة · مفاتيح بلا إنترنت",
      "loop.engine": "التطبيق · تواصل سيادي",
      "loop.spark": "الوقود · بيع مسبق + IDO",
      "loop.aether": "البرلمان · الاحتياطي",
      "loop.havix": "هوية متوازية · مسار مزدوج",
      "loop.germ": "الدماغ · ذكاء عقدي (مستقبل)",
      "loop.st_vault": "أُصدر v3.44.0",
      "loop.st_engine": "أُصدر v3.45.1",
      "loop.st_spark": "بيع مسبق + IDO",
      "loop.st_aether": "تـدقيق ✓ · بانتظار الشبكة",
      "loop.st_havix": "مُتحقَّق · بالاستعداد",
      "loop.st_germ": "مرحلة مستقبلية",
      "pager.prev": "المحطة السابقة",
      "pager.next": "المحطة التالية",
      "pager.tour_pre": "جولة الحلقة · ",
      "footer.rights": "كل الحقوق محفوظة."
    },

    es: {
      // ---- shared chrome ----
      "nav.spark": "Spark",
      "dl.get": "OBTENER ↗",
      "dl.inreview": "EN REVISIÓN",
      "dl.tag_engine": "Social soberana · cifrado de extremo a extremo",
      "dl.tag_vault": "Caja fuerte sin conexión · sellada con TEE",
      "loop.here": "ESTÁS AQUÍ",
      "loop.title": "UN PROYECTO · EL CICLO DE SOBERANÍA",
      "loop.wp": "Documento técnico",
      "loop.vault": "la Caja fuerte · claves sin conexión",
      "loop.engine": "la App · social soberana",
      "loop.spark": "el Combustible · preventa + IDO",
      "loop.aether": "el Parlamento · reserva",
      "loop.havix": "identidad paralela · doble vía",
      "loop.germ": "el Cerebro · IA de nodo (futuro)",
      "loop.st_vault": "ENVIADO v3.44.0",
      "loop.st_engine": "ENVIADO v3.45.1",
      "loop.st_spark": "PREVENTA + IDO",
      "loop.st_aether": "AUDITADO ✓ · PENDIENTE DE MAINNET",
      "loop.st_havix": "VALIDADO · EN ESPERA",
      "loop.st_germ": "ETAPA FUTURA",
      "pager.prev": "parada anterior",
      "pager.next": "parada siguiente",
      "pager.tour_pre": "el tour del circuito · ",
      "footer.rights": "Todos los derechos reservados."
    }
  };

  // ==================== per-page translation chunks ====================
  // 每个页面组（G1..G4）把各自文案写进独立 chunk 文件（site-i18n-gN.js），
  // 通过 SLI18N.register({lang:{key:value}}) 在此合并进 dict。
  // 避免多个子代理并发给写同一文件造成冲突。
  function register(chunk) {
    if (!chunk || typeof chunk !== "object") return;
    Object.keys(chunk).forEach(function (lang) {
      var l = lang;
      if (!dict[l]) dict[l] = {};
      var src = chunk[l];
      Object.keys(src).forEach(function (k) {
        if (src[k] != null && src[k] !== "") dict[l][k] = src[k];
      });
    });
    return true;
  }

  function currentKeyFromSaved() {
    try { return localStorage.getItem("sl-lang") || "en"; } catch (e) { return "en"; }
  }
  var _cur = currentKeyFromSaved();

  var api = {
    order: order,
    langs: langs,
    dict: dict,
    currentLang: _cur,
    isRTL: function () { return _cur === "ar"; },
    register: register
  };
  window.SLI18N = api;
  window.SL_I18N_EXT = register;   /* 页面 chunk 简写: SLI18N.register(...) 或 SL_I18N_EXT(...) */
  return api;
})();