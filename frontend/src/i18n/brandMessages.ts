/**
 * 品牌文案覆盖层。
 *
 * 为什么用覆盖层而不是直接改上游 locale 文件：
 * 上游 locales/*.ts 每个版本都在加新功能的文案，是改动最频繁的文件。
 * 在那里面改字符串等于在雷区施工，每次升级都要处理冲突。
 * 这里只写需要覆盖的条目（独立新增文件，升级时零冲突），
 * 由 i18n/index.ts 的 mergeBrandMessages 按点分路径深合并进上游消息。
 *
 * 占位符：
 *   {brand}    → BRAND.localizedNames[locale]（各语言产品名）
 *   {assistant}→ BRAND.assistantName（产品内置 AI 助手名）
 *
 * 刻意不覆盖的条目（不要加进来）：
 *   - 技术字面量：X-WeKnora-Signature、aud=weknora、WEKNORA_* 环境变量、
 *     weknora-app / weknora-ui 服务名 —— 用户要照抄，删了会坏
 *   - 已隐藏功能的文案：WeKnora Cloud / CLI / Skill / Claw / Chrome 插件
 *   - E2B 沙箱模板名：settings.sandbox.weknora*Template —— 模板在集群里
 *     真的叫这个名字，改了用户就找不到模板
 */

/** 需要覆盖的 key 集合（6 语言共用） */
export const BRAND_TEXT_KEYS = [
  'automation.description',
  'automation.addHint',
  'automation.editor.sections.basic.desc',
  'integrations.api.capabilityManageModelsHint',
  'integrations.api.signedFlowDetail',
  'integrations.api.hmacSecretDesc',
  'assistant.title',
  'assistant.welcomeDesc',
  'assistant.help.title',
  'assistant.settingsPages.integration-mcpserver.description',
  'assistant.settingsPages.integration-mcpserver.q1',
  'assistant.starters.formats',
  'assistant.starters.gettingStarted',
  'knowledgeEditor.activity.viaAssistant',
  'embedPublish.originsHint',
  'embedPublish.webhookUrlDesc',
  'createChat.title',
  'auth.firstTime',
  'auth.registerSubtitle',
  'envVarSettings.host.description',
  'envVarSettings.description',
  'newUserGuide.steps.assistant.title',
  'newUserGuide.steps.assistant.desc',
  'newUserGuide.steps.knowledge.desc',
  'newUserGuide.steps.welcome.title',
] as const

export type BrandTextKey = typeof BRAND_TEXT_KEYS[number]

/**
 * 刻意不覆盖的条目 —— 上游 value 里含 WeKnora，但我们**故意**保留原样。
 *
 * 这份清单是「已知且已决策」的集合，branding:merge 对账脚本据此不报警。
 * 只有「既不在 BRAND_TEXT_KEYS、也不在此清单」的条目才会被报为待处理。
 *
 * 归类：
 *   hidden-feature    对应功能入口已隐藏（见 config/branding.ts 黑名单），普通用户走不到
 *   technical-literal 用户需要照抄的技术字面量，改了会坏
 *   real-object-name  真实存在的技术对象名（E2B 模板 / 镜像），改了用户就找不到
 */
export type BrandTextExclusionReason =
  | 'hidden-feature'
  | 'technical-literal'
  | 'real-object-name'

export const BRAND_TEXT_EXCLUDED: Record<string, BrandTextExclusionReason> = {
  // ── 已隐藏功能的入口文案 ────────────────────────────────────────────
  'integrations.cli.title': 'hidden-feature',
  'integrations.claw.title': 'hidden-feature',
  'integrations.claw.subtitle': 'hidden-feature',
  'integrations.claw.installCtaHint': 'hidden-feature',
  'integrations.chrome.subtitle': 'hidden-feature',
  'integrations.chrome.steps.port.desc': 'hidden-feature',
  'agentStream.hostApproval.titleDenied': 'hidden-feature',
  'kbSettings.parser.engines.weknoracloud.name': 'hidden-feature',
  'kbSettings.parser.engines.weknoracloud.desc': 'hidden-feature',
  'assistant.settingsPages.weknoracloud.description': 'hidden-feature',
  'assistant.settingsPages.weknoracloud.q1': 'hidden-feature',
  'assistant.settingsPages.integration-cli.q1': 'hidden-feature',
  'assistant.settingsPages.integration-claw.description': 'hidden-feature',
  'assistant.settingsPages.integration-claw.q1': 'hidden-feature',
  'settings.weknoraCloud.title': 'hidden-feature',
  'settings.weknoraCloud.description': 'hidden-feature',
  'settings.weknoraCloud.expired': 'hidden-feature',
  'settings.weknoraCloud.appIdDesc': 'hidden-feature',
  'settings.weknoraCloud.appSecretDesc': 'hidden-feature',
  'settings.weknoraCloud.usageSteps': 'hidden-feature',
  'settings.weknoraCloud.credentialConfigured': 'hidden-feature',
  'settings.weknoraCloud.credentialUnconfigured': 'hidden-feature',
  'settings.weknoraCloud.modelHintConfigured': 'hidden-feature',
  'settings.weknoraCloud.addModelsDisplayName.chat': 'hidden-feature',
  'settings.weknoraCloud.addModelsDisplayName.embedding': 'hidden-feature',
  'settings.weknoraCloud.addModelsDisplayName.rerank': 'hidden-feature',
  'settings.weknoraCloud.addModelsDisplayName.vllm': 'hidden-feature',
  'settings.weknoraCloud.modelsSection.descReady': 'hidden-feature',

  // ── 技术字面量：用户要照抄 ──────────────────────────────────────────
  'embedPublish.webhookSecretPlaceholder': 'technical-literal',

  // ── 真实存在的技术对象名（E2B 模板 / 镜像 / 部署主机）────────────────
  'settings.sandbox.dockerHostRisk': 'real-object-name',
  'settings.sandbox.weknoraTemplateTitle': 'real-object-name',
  'settings.sandbox.weknoraDockerImage': 'real-object-name',
  'settings.sandbox.weknoraTemplateOverview': 'real-object-name',
  'settings.sandbox.weknoraTemplateDescription': 'real-object-name',
  'settings.sandbox.standardTemplateProvisioning': 'real-object-name',
  'settings.sandbox.templateUntaggedHint': 'real-object-name',
  'settings.sandbox.weknoraStandardTemplate': 'real-object-name',
  'settings.sandbox.weknoraDesktopTemplate': 'real-object-name',
  'settings.sandbox.replaceStandardTemplateConfirm': 'real-object-name',
  'settings.sandbox.desktopTemplateProvisioning': 'real-object-name',
  'settings.sandbox.replaceDesktopTemplateConfirm': 'real-object-name',
  'settings.sandbox.cubeDnsServersHelp': 'real-object-name',
  'settings.sandbox.dockerTlsCertPathHelp': 'real-object-name',
  'settings.sandbox.dockerIdleTtlHelp': 'real-object-name',
  'settings.sandbox.backendDescriptions.docker': 'real-object-name',
  'settings.sandbox.templateLoadHint': 'real-object-name',
}

/** 各语言的文案模板；运行时用 {brand} / {assistant} 填充 */
export const BRAND_TEXT_TEMPLATES: Record<string, Record<BrandTextKey, string>> = {
  'zh-CN': {
    'automation.description': '让 {assistant} 按计划以你的身份执行任务，结果和待审批事项会通知你。',
    'automation.addHint': '也可以直接让 {assistant} 帮你创建',
    'automation.editor.sections.basic.desc': '任务由 {assistant} 执行。需要其他智能体时，请在任务中写明委派对象和工作。',
    'integrations.api.capabilityManageModelsHint': '允许管理模型配置、模型凭据、模型连通性测试和云端模型凭据。',
    'integrations.api.signedFlowDetail': 'HMAC 密钥仅保存在 {brand} 与你的可信后端，切勿放入请求或下发给浏览器。请求头里传的是用该密钥签出的 JWT 字符串（每次签发或过期后会变），不是密钥本身。JWT 须包含 sub（外部用户 ID）、tenant_id、aud=weknora、exp（有效期不超过 24 小时）。',
    'integrations.api.hmacSecretDesc': '与 {brand} 保存的同一份密钥；仅用于后端签发 JWT，不要作为请求头发送。',
    'assistant.title': '{assistant}',
    'assistant.welcomeDesc': '我可以解答 {brand} 的使用问题，整理知识与文档，帮你配置智能体、工具和自动化。',
    'assistant.help.title': '{assistant} 能做什么',
    'assistant.settingsPages.integration-mcpserver.description': '我可以说明怎样把 {brand} 作为 MCP 服务提供出去，以及会暴露哪些工具。',
    'assistant.settingsPages.integration-mcpserver.q1': '怎样把 {brand} 作为 MCP 服务提供出去？',
    'assistant.starters.formats': '{brand} 支持哪些文档格式？',
    'assistant.starters.gettingStarted': '第一次使用 {brand}，应该先配置什么？',
    'knowledgeEditor.activity.viaAssistant': '经 {assistant}',
    'embedPublish.originsHint': '填写允许嵌入的宿主网站来源（A），不是 {brand} 地址（B）。每行一个完整 Origin，如 https://shop.example.com；至少一项，支持 *.example.com 子域通配',
    'embedPublish.webhookUrlDesc': '可选。访客发消息与助手回复完成时，{brand} 会向该 HTTPS 地址 POST 事件（message_sent / message_received）。',
    'createChat.title': 'Hi，我是 {brand}，让你的知识触手可及',
    'auth.firstTime': '首次使用 {brand}？',
    'auth.registerSubtitle': '创建账户并开始使用 {brand}',
    'envVarSettings.host.description': '给本机技能用的个人密钥，不是 {brand} 的系统或部署配置。',
    'envVarSettings.description': '给技能和沙箱用的个人密钥，不是 {brand} 的系统或部署配置。',
    'newUserGuide.steps.assistant.title': '认识 {assistant}',
    'newUserGuide.steps.assistant.desc': '可以问 {brand} 的版本、功能和配置，也可以结合当前页面，以你的身份创建智能体、设置定时任务或整理知识。',
    'newUserGuide.steps.knowledge.desc': '知识库是一切的起点：上传文档、网页或 FAQ，{brand} 会自动解析并建立索引。点击这里进入知识库。',
    'newUserGuide.steps.welcome.title': '欢迎使用 {brand}',
  },

  'zh-TW': {
    'automation.description': '讓 {assistant} 按排程以你的身分執行任務，結果與待審批事項會通知你。',
    'automation.addHint': '也可以直接請 {assistant} 幫你建立',
    'automation.editor.sections.basic.desc': '任務由 {assistant} 執行。需要其他智慧代理時，請在任務中寫明委派對象與工作。',
    'integrations.api.capabilityManageModelsHint': '允許管理模型設定、模型憑據、模型連通性測試和雲端模型憑據。',
    'integrations.api.signedFlowDetail': 'HMAC 金鑰僅儲存在 {brand} 與你的可信後端，切勿放入請求或下發給瀏覽器。請求頭裡傳的是用該金鑰籤出的 JWT 字符串（每次籤發或過期後會變），不是金鑰本身。JWT 須包含 sub（外部使用者 ID）、tenant_id、aud=weknora、exp（有效期不超過 24 小時）。',
    'integrations.api.hmacSecretDesc': '與 {brand} 儲存的同一份金鑰；僅用於後端籤發 JWT，不要作為請求頭髮送。',
    'assistant.title': '{assistant}',
    'assistant.welcomeDesc': '我可以解答 {brand} 的使用問題，整理知識與文件，幫你設定智慧代理、工具和自動化。',
    'assistant.help.title': '{assistant} 能做什麼',
    'assistant.settingsPages.integration-mcpserver.description': '我可以說明怎樣把 {brand} 作為 MCP 服務提供出去，以及會暴露哪些工具。',
    'assistant.settingsPages.integration-mcpserver.q1': '怎樣把 {brand} 作為 MCP 服務提供出去？',
    'assistant.starters.formats': '{brand} 支援哪些文件格式？',
    'assistant.starters.gettingStarted': '第一次使用 {brand}，應該先設定什麼？',
    'knowledgeEditor.activity.viaAssistant': '經 {assistant}',
    'embedPublish.originsHint': '填寫允許內嵌的宿主網站來源（A），不是 {brand} 地址（B）。每行一個完整 Origin，如 https://shop.example.com；至少一項，支持 *.example.com 子域通配',
    'embedPublish.webhookUrlDesc': '可選。訪客發訊息與助手回覆完成時，{brand} 會向該 HTTPS 地址 POST 事件（message_sent / message_received）。',
    'createChat.title': 'Hi，我是 {brand}，讓你的知識觸手可及',
    'auth.firstTime': '首次使用 {brand}？',
    'auth.registerSubtitle': '建立帳戶並開始使用 {brand}',
    'envVarSettings.host.description': '給本機技能用的個人金鑰，不是 {brand} 的系統或部署設定。',
    'envVarSettings.description': '給技能和沙箱用的個人金鑰，不是 {brand} 的系統或部署設定。',
    'newUserGuide.steps.assistant.title': '認識 {assistant}',
    'newUserGuide.steps.assistant.desc': '可以詢問 {brand} 的版本、功能與設定，也可以結合目前頁面，以你的身分建立智慧代理、設定定時任務或整理知識。',
    'newUserGuide.steps.knowledge.desc': '知識庫是一切的起點：上傳文件、網頁或 FAQ，{brand} 會自動解析並建立索引。點擊這裡進入知識庫。',
    'newUserGuide.steps.welcome.title': '歡迎使用 {brand}',
  },

  'en-US': {
    'automation.description': 'Have the {assistant} run tasks on a schedule as you. You are notified of results and pending approvals.',
    'automation.addHint': 'Or ask the {assistant} to set one up',
    'automation.editor.sections.basic.desc': 'The {assistant} runs each task. To delegate work, name the agents and their assignments in the task.',
    'integrations.api.capabilityManageModelsHint': 'Manage model definitions, credentials, connectivity checks, and cloud model credentials.',
    'integrations.api.signedFlowDetail': 'Keep the HMAC secret only on {brand} and your trusted backend—never put it in requests or ship it to browsers. The request header carries the JWT string signed with that secret (it changes on each issuance or after expiry), not the secret itself. JWT must include sub (external user ID), tenant_id, aud=weknora, and exp (max 24h lifetime).',
    'integrations.api.hmacSecretDesc': 'Same secret stored in {brand}; used only on your backend to sign JWTs—never send it as a request header.',
    'assistant.title': '{assistant}',
    'assistant.welcomeDesc': 'I can answer questions about {brand}, organize knowledge and documents, and help set up agents, tools and automations.',
    'assistant.help.title': 'What the {assistant} can do',
    'assistant.settingsPages.integration-mcpserver.description': 'I can explain how to expose {brand} as an MCP server, and which tools it offers.',
    'assistant.settingsPages.integration-mcpserver.q1': 'How do I offer {brand} as an MCP server?',
    'assistant.starters.formats': 'Which document formats does {brand} support?',
    'assistant.starters.gettingStarted': 'What should I set up first in {brand}?',
    'knowledgeEditor.activity.viaAssistant': 'Via {assistant}',
    'embedPublish.originsHint': 'Enter the host websites allowed to embed this channel (A), not the {brand} address (B). One full origin per line, e.g. https://shop.example.com; at least one required. Supports *.example.com.',
    'embedPublish.webhookUrlDesc': 'Optional. {brand} POSTs message_sent / message_received events to this HTTPS endpoint.',
    'createChat.title': 'Hi, I am {brand} — your knowledge, within reach',
    'auth.firstTime': 'New to {brand}?',
    'auth.registerSubtitle': 'Create your account and start using {brand}',
    'envVarSettings.host.description': 'Personal keys for skills on this computer, not {brand} system or deployment settings.',
    'envVarSettings.description': 'Personal keys for skills and sandboxes, not {brand} system or deployment settings.',
    'newUserGuide.steps.assistant.title': 'Meet the {assistant}',
    'newUserGuide.steps.assistant.desc': 'Ask about {brand} versions, features and setup. Using the current page as context, the assistant can create agents, schedule tasks and organize knowledge on your behalf, within your permissions.',
    'newUserGuide.steps.knowledge.desc': 'Everything starts here: upload documents, web pages or FAQs and {brand} parses and indexes them automatically. Click here to open knowledge bases.',
    'newUserGuide.steps.welcome.title': 'Welcome to {brand}',
  },

  // 俄语产品名是可变格名词，因此模板只把品牌名放在主格/宾格位置，
  // 需要变格的位置改用「сервис / ассистент / приложение」等普通名词。
  'ru-RU': {
    'automation.description': 'Помощник {brand} выполняет задачи по расписанию от вашего имени. О результатах и ожидающих подтверждениях вы получите уведомление.',
    'automation.addHint': 'Или попросите встроенного ассистента создать её',
    'automation.editor.sections.basic.desc': 'Задачи выполняет встроенный ассистент. Для делегирования укажите в задаче агентов и порученную им работу.',
    'integrations.api.capabilityManageModelsHint': 'Управление конфигурациями моделей, учётными данными, проверками подключения и облачными учётными данными моделей.',
    'integrations.api.signedFlowDetail': 'HMAC secret храните только в приложении и на доверенном backend — не передавайте в запросах и не отдавайте браузеру. В заголовке запроса передаётся JWT, подписанный этим secret (меняется при каждой выдаче или после истечения), а не сам secret. JWT должен содержать sub (ID внешнего пользователя), tenant_id, aud=weknora и exp (не более 24 ч).',
    'integrations.api.hmacSecretDesc': 'Тот же secret, что в приложении; только для подписи JWT на backend — не отправляйте его в заголовке запроса.',
    'assistant.title': '{assistant}',
    'assistant.welcomeDesc': 'Помогу разобраться, как устроен {brand}, упорядочить знания и документы, настроить агентов, инструменты и автоматизации.',
    'assistant.help.title': 'Что умеет {brand}',
    'assistant.settingsPages.integration-mcpserver.description': 'Я могу объяснить, как предоставить {brand} в качестве MCP-сервера и какие инструменты он предлагает.',
    'assistant.settingsPages.integration-mcpserver.q1': 'Как предоставить {brand} в качестве MCP-сервера?',
    'assistant.starters.formats': 'Какие форматы документов поддерживает {brand}?',
    'assistant.starters.gettingStarted': 'С чего начать настройку {brand}?',
    'knowledgeEditor.activity.viaAssistant': 'Через встроенного ассистента',
    'embedPublish.originsHint': 'Укажите сайты, которым разрешено встраивание (A), а не адрес установки (B). Один полный Origin на строку, например https://shop.example.com; минимум один. Поддерживается *.example.com.',
    'embedPublish.webhookUrlDesc': 'Необязательно. {brand} отправляет события message_sent / message_received на этот HTTPS-эндпоинт методом POST.',
    'createChat.title': 'Привет, я {brand} — ваши знания всегда под рукой',
    'auth.firstTime': 'Впервые используете {brand}?',
    'auth.registerSubtitle': 'Создайте аккаунт и попробуйте {brand}',
    'envVarSettings.host.description': 'Личные ключи для навыков на этом компьютере, а не системные или деплой-настройки сервиса.',
    'envVarSettings.description': 'Личные ключи для навыков и песочниц, а не системные или деплой-настройки сервиса.',
    'newUserGuide.steps.assistant.title': 'Знакомьтесь: {brand}',
    'newUserGuide.steps.assistant.desc': 'Задавайте вопросы о версиях, функциях и настройках сервиса. Учитывая текущую страницу, помощник может создавать агентов, планировать задачи и упорядочивать знания от вашего имени, в пределах ваших прав.',
    'newUserGuide.steps.knowledge.desc': 'С этого всё начинается: загружайте документы, веб-страницы или FAQ, и {brand} автоматически разберёт и проиндексирует их. Нажмите здесь, чтобы открыть базы знаний.',
    'newUserGuide.steps.welcome.title': 'Добро пожаловать! Это {brand}.',
  },

  'ko-KR': {
    'automation.description': '{assistant}가 예약된 시간에 사용자를 대신해 작업을 실행합니다. 결과와 승인 대기 항목을 알려드립니다.',
    'automation.addHint': '{brand} 어시스턴트에게 만들어 달라고 할 수도 있습니다',
    'automation.editor.sections.basic.desc': '{assistant}가 작업을 실행합니다. 다른 에이전트에 위임하려면 작업에 에이전트와 맡길 일을 명시하세요.',
    'integrations.api.capabilityManageModelsHint': '모델 설정, 자격 증명, 연결 테스트 및 클라우드 모델 자격 증명을 관리합니다.',
    'integrations.api.signedFlowDetail': 'HMAC secret은 {brand}와 신뢰할 수 있는 백엔드에만 보관하세요. 요청에 넣거나 브라우저에 배포하지 마세요. 요청 헤더에는 secret이 아니라 해당 secret으로 서명한 JWT 문자열을 넣습니다(발급마다 또는 만료 후 변경). JWT에는 sub(외부 사용자 ID), tenant_id, aud=weknora, exp(최대 24시간)가 필요합니다.',
    'integrations.api.hmacSecretDesc': '{brand}에 저장된 것과 동일한 secret. 백엔드에서 JWT 서명에만 사용하며 요청 헤더로 보내지 않습니다.',
    'assistant.title': '{assistant}',
    'assistant.welcomeDesc': '{brand} 사용법을 안내하고, 지식과 문서를 정리하며, 에이전트·도구·자동화 설정을 도와드릴 수 있습니다.',
    'assistant.help.title': '{assistant}가 할 수 있는 일',
    'assistant.settingsPages.integration-mcpserver.description': '{brand}을(를) MCP 서버로 제공하는 방법과 제공되는 도구를 설명할 수 있습니다.',
    'assistant.settingsPages.integration-mcpserver.q1': '{brand}을(를) MCP 서버로 어떻게 제공하나요?',
    'assistant.starters.formats': '{brand}는 어떤 문서 형식을 지원하나요?',
    'assistant.starters.gettingStarted': '{brand}를 처음 사용할 때 무엇부터 설정해야 하나요?',
    'knowledgeEditor.activity.viaAssistant': '{assistant} 경유',
    'embedPublish.originsHint': '{brand} 주소(B)가 아닌 임베드를 허용할 호스트 웹사이트(A)를 입력하세요. 한 줄에 하나의 Origin(예: https://shop.example.com), 최소 1개. *.example.com 지원.',
    'embedPublish.webhookUrlDesc': '선택 사항. {brand}이(가) message_sent / message_received 이벤트를 이 HTTPS 엔드포인트에 POST합니다.',
    'createChat.title': '안녕하세요, {brand}입니다 — 당신의 지식을 손끝에',
    'auth.firstTime': '{brand}가 처음이신가요?',
    'auth.registerSubtitle': '계정을 만들고 {brand}를 시작하세요',
    'envVarSettings.host.description': '이 컴퓨터의 스킬에 쓰는 개인 키이며, {brand} 시스템이나 배포 설정이 아닙니다.',
    'envVarSettings.description': '스킬과 샌드박스에 쓰는 개인 키이며, {brand} 시스템이나 배포 설정이 아닙니다.',
    'newUserGuide.steps.assistant.title': '{assistant}를 만나보세요',
    'newUserGuide.steps.assistant.desc': '{brand}의 버전, 기능, 설정에 대해 질문할 수 있습니다. 현재 페이지를 바탕으로 사용자의 권한 내에서 에이전트를 만들고, 작업을 예약하고, 지식을 정리할 수도 있습니다.',
    'newUserGuide.steps.knowledge.desc': '모든 것의 시작점입니다. 문서, 웹페이지, FAQ를 업로드하면 {brand}가 자동으로 분석하고 색인합니다. 여기를 클릭해 지식 베이스로 이동하세요.',
    'newUserGuide.steps.welcome.title': '{brand}에 오신 것을 환영합니다',
  },

  'ja-JP': {
    'automation.description': '{assistant}があなたに代わって定期的にタスクを実行します。結果と承認待ちの操作を通知します。',
    'automation.addHint': '{assistant}に作成を頼むこともできます',
    'automation.editor.sections.basic.desc': '{assistant}がタスクを実行します。他のエージェントに委任する場合は、タスクに委任先と作業内容を記載してください。',
    'integrations.api.capabilityManageModelsHint': 'モデル定義、認証情報、接続確認、クラウドモデルの認証情報を管理します。',
    'integrations.api.signedFlowDetail': 'HMACシークレットは{brand}と信頼できる自社バックエンドにのみ保存し、リクエストに含めたりブラウザに配布したりしないでください。リクエストヘッダーで送るのは、そのシークレットで署名したJWT文字列（発行ごと、または有効期限切れ後に変わります）であり、シークレット自体ではありません。JWTにはsub（外部ユーザID）、tenant_id、aud=weknora、exp（有効期間は最大24時間）を含める必要があります。',
    'integrations.api.hmacSecretDesc': '{brand}に保存されているものと同じシークレットです。JWTの署名のためバックエンドでのみ使用し、リクエストヘッダーとして送信しないでください。',
    'assistant.title': '{assistant}',
    'assistant.welcomeDesc': '{brand} の使い方、ナレッジやドキュメントの整理、エージェント・ツール・自動化の設定をお手伝いします。',
    'assistant.help.title': '{assistant}にできること',
    'assistant.settingsPages.integration-mcpserver.description': '{brand} を MCP サーバーとして公開する方法と、提供されるツールについて説明できます。',
    'assistant.settingsPages.integration-mcpserver.q1': '{brand} を MCP サーバーとして公開するにはどうすればいいですか？',
    'assistant.starters.formats': '{brand} はどのドキュメント形式に対応していますか？',
    'assistant.starters.gettingStarted': '{brand} を初めて使う場合、何から設定すればよいですか？',
    'knowledgeEditor.activity.viaAssistant': '{assistant} 経由',
    'embedPublish.originsHint': '{brand} の URL（B）ではなく、埋め込みを許可するホストサイト（A）を入力します。1 行に 1 つの Origin（例: https://shop.example.com）。1 件以上必須。*.example.com に対応。',
    'embedPublish.webhookUrlDesc': '任意。{brand} が message_sent / message_received イベントをこの HTTPS エンドポイントに POST します。',
    'createChat.title': 'こんにちは、{brand}です。あなたのナレッジを、すぐそばに',
    'auth.firstTime': '{brand}は初めてですか？',
    'auth.registerSubtitle': 'アカウントを作成して{brand}を使い始めましょう',
    'envVarSettings.host.description': 'このコンピューター上のスキルで使う個人用のキーです。{brand}のシステム設定やデプロイ設定ではありません。',
    'envVarSettings.description': 'スキルとサンドボックスで使う個人用のキーです。{brand}のシステム設定やデプロイ設定ではありません。',
    'newUserGuide.steps.assistant.title': '{assistant}のご紹介',
    'newUserGuide.steps.assistant.desc': '{brand} のバージョン、機能、設定について質問できます。現在のページをもとに、あなたの権限でエージェントの作成、定期タスクの設定、ナレッジの整理も行えます。',
    'newUserGuide.steps.knowledge.desc': 'すべてはここから始まります。ドキュメント、Webページ、FAQをアップロードすると、{brand}が自動で解析してインデックスを作成します。ここをクリックしてナレッジベースを開いてください。',
    'newUserGuide.steps.welcome.title': '{brand}へようこそ',
  },
}

/**
 * CJK 字符判定。用于在占位符替换时自动去掉多余的空格：
 * 模板沿用上游的拉丁排版（'Hi，我是 {brand}，…'），但替换成中文品牌名后
 * 'Hi，我是 知识库助手，' 里那个空格是中英混排才需要的，中文之间不该有。
 */
const CJK_CHAR = /[　-〿぀-ゟ㐀-䶿一-鿿豈-﫿가-힯]/

/**
 * 各语言品牌名与相邻文字之间的空格策略。
 *
 * 模板沿用上游的拉丁排版（'Hi，我是 {brand}，…'、'{brand} の使い方'），
 * 但替换成非拉丁品牌名后空格规则会变：
 *   strip —— 中文/日文不使用词间空格，替换后自动吃掉紧邻空格
 *   keep  —— 拉丁/韩文保留词间空格（韩文有助词，必须留空格）
 */
export const BRAND_SPACE_STYLE: Record<string, 'strip' | 'keep'> = {
  'zh-CN': 'strip',
  'zh-TW': 'strip',
  'ja-JP': 'strip',
  'en-US': 'keep',
  'ko-KR': 'keep',
  'ru-RU': 'keep',
}

/**
 * 把占位符替换成实际值；strip 模式下若替换值首尾是 CJK 字符，则吃掉紧邻的空格。
 * 拉丁品牌名（如 'Knowledge Assistant'）保留模板原有空格。
 */
function fillToken(template: string, token: string, value: string, strip: boolean): string {
  let out = template
  while (out.includes(token)) {
    const idx = out.indexOf(token)
    const before = out.slice(0, idx)
    const after = out.slice(idx + token.length)
    const startsCjk = CJK_CHAR.test(value.charAt(0))
    const endsCjk = CJK_CHAR.test(value.charAt(value.length - 1))
    const newBefore = strip && startsCjk && before.endsWith(' ') ? before.slice(0, -1) : before
    const newAfter = strip && endsCjk && after.startsWith(' ') ? after.slice(1) : after
    out = newBefore + value + newAfter
  }
  return out
}

/**
 * 生成指定语言的最终覆盖文案（{brand} / {assistant} 已填充）。
 * @param locale 语言标签
 * @param brandName 该语言的产品名
 * @param assistantName 助手显示名
 */
export function buildBrandMessages(
  locale: string,
  brandName: string,
  assistantName: string,
): Record<string, string> {
  const templates = BRAND_TEXT_TEMPLATES[locale]
  if (!templates) return {}
  const strip = BRAND_SPACE_STYLE[locale] === 'strip'
  const out: Record<string, string> = {}
  for (const [key, template] of Object.entries(templates)) {
    out[key] = fillToken(
      fillToken(template, '{brand}', brandName, strip),
      '{assistant}',
      assistantName,
      strip,
    )
  }
  return out
}
