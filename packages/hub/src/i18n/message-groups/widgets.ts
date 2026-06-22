import type { LocalizedMessages } from "../types";

export const widgetMessages = {
    loadingWidgetSettings: {
        en: "Loading widget settings...",
        zh_CN: "正在加载组件设置...",
        ja: "ウィジェット設定を読み込んでいます...",
    },
    globalOverrideDisabledNote: {
        en: "Some settings are disabled since global override is enabled.",
        zh_CN: "部分设置已禁用，因为全局覆盖已启用。",
        ja: "グローバル上書きが有効なため、一部の設定は無効です。",
    },
    resetWidgetSettingsButton: {
        en: "Reset Widget Settings",
        zh_CN: "重置组件设置",
        ja: "ウィジェット設定をリセット",
    },
    domainMismatchNotice: {
        en: "Stored metric settings do not match this action. Reset widget settings to continue.",
        zh_CN: "已保存的指标设置与此操作不匹配。请重置组件设置后继续。",
        ja: "保存済みのメトリクス設定がこのアクションと一致しません。続行するにはウィジェット設定をリセットしてください。",
    },
} as const satisfies LocalizedMessages;

export const multiMetricMessages = {
    sharedPollingNote: {
        en: "This polling frequency is shared by every metric in this key.",
        zh_CN: "这个轮询频率由此按键里的所有指标共享。",
        ja: "このポーリング頻度は、このキー内のすべてのメトリックで共有されます。",
    },
    maxSlotCountReachedNote: {
        en: "You have reached the maximum number of metrics for this key.",
        zh_CN: "此按键已达到可添加的指标数量上限。",
        ja: "このキーで追加できるメトリック数の上限に達しました。",
    },
} as const satisfies LocalizedMessages;

export const cpuMessages = {
    cpuMetricLabel: {
        en: "CPU Metric",
        zh_CN: "CPU 指标",
        ja: "CPU メトリクス",
    },
    unsupportedCpuMetricNotice: {
        en: "Current CPU metric is not supported on this platform. Choose a supported metric to continue.",
        zh_CN: "当前 CPU 指标不支持此平台。请选择支持的指标继续。",
        ja: "現在の CPU メトリクスはこのプラットフォームでサポートされていません。続行するには対応メトリクスを選択してください。",
    },
} as const satisfies LocalizedMessages;

export const gpuMessages = {
    gpuMetricLabel: {
        en: "GPU Metric",
        zh_CN: "GPU 指标",
        ja: "GPU メトリクス",
    },
    unsupportedGpuMetricNotice: {
        en: "Current GPU metric is not supported on this platform. Choose a supported metric to continue.",
        zh_CN: "当前 GPU 指标不支持此平台。请选择支持的指标继续。",
        ja: "現在の GPU メトリクスはこのプラットフォームでサポートされていません。続行するには対応メトリクスを選択してください。",
    },
    gpuNoValueGuidance: {
        en: "No GPU value is available from the current source. Intel and AMD GPU metrics usually require ShoMetrics Helper. If Helper is installed, restart it or open ShoMetrics Control Panel for diagnostics.",
        zh_CN: "当前来源没有可用的 GPU 值。Intel 和 AMD GPU 指标通常需要 ShoMetrics Helper。如果已安装 Helper，请重启它或打开 ShoMetrics Control Panel 诊断。",
        ja: "現在のソースから GPU 値を取得できません。Intel と AMD の GPU メトリクスは通常 ShoMetrics Helper が必要です。Helper がインストール済みの場合は再起動するか、ShoMetrics Control Panel で診断してください。",
    },
} as const satisfies LocalizedMessages;

export const diskMessages = {
    diskMetricLabel: {
        en: "Disk Metric",
        zh_CN: "磁盘指标",
        ja: "ディスクメトリクス",
    },
    usageDisplayLabel: {
        en: "Usage Display",
        zh_CN: "使用率显示",
        ja: "使用率表示",
    },
    readMaxMibLabel: {
        en: "Read Max (MiB/s)",
        zh_CN: "读取最大值 (MiB/s)",
        ja: "読み取り最大値 (MiB/s)",
    },
    writeMaxMibLabel: {
        en: "Write Max (MiB/s)",
        zh_CN: "写入最大值 (MiB/s)",
        ja: "書き込み最大値 (MiB/s)",
    },
    displayLabelHeading: {
        en: "Display Label",
        zh_CN: "显示标签",
        ja: "表示ラベル",
    },
    customLabelLabel: {
        en: "Custom Label",
        zh_CN: "自定义标签",
        ja: "カスタムラベル",
    },
    useDetectedLabelAria: {
        en: "Use detected label as custom label",
        zh_CN: "使用检测到的标签作为自定义标签",
        ja: "検出ラベルをカスタムラベルとして使用",
    },
    detectedLabelLabel: {
        en: "Detected Label",
        zh_CN: "检测到的标签",
        ja: "検出ラベル",
    },
    diskAggregateNote: {
        en: "Showing aggregate disk read/write. Per-disk monitoring is not available in this version.",
        zh_CN: "正在显示汇总磁盘读写。本版本不支持单磁盘监控。",
        ja: "ディスク読み書きの合計を表示しています。このバージョンではディスク単位の監視は利用できません。",
    },
} as const satisfies LocalizedMessages;

export const networkMessages = {
    networkMetricLabel: {
        en: "Network Metric",
        zh_CN: "网络指标",
        ja: "ネットワークメトリクス",
    },
    pingTargetLabel: {
        en: "Ping Target",
        zh_CN: "Ping 目标",
        ja: "Ping ターゲット",
    },
    networkInterfaceLabel: {
        en: "Network Interface",
        zh_CN: "网络接口",
        ja: "ネットワークインターフェイス",
    },
    uploadMaxMbpsLabel: {
        en: "Upload Max (Mbps)",
        zh_CN: "上传最大值 (Mbps)",
        ja: "アップロード最大値 (Mbps)",
    },
    downloadMaxMbpsLabel: {
        en: "Download Max (Mbps)",
        zh_CN: "下载最大值 (Mbps)",
        ja: "ダウンロード最大値 (Mbps)",
    },
    trafficModeLabel: {
        en: "Traffic Mode",
        zh_CN: "流量模式",
        ja: "トラフィックモード",
    },
    trendLineSmoothingLabel: {
        en: "Trend Line Smoothing",
        zh_CN: "趋势线平滑",
        ja: "トレンドライン平滑化",
    },
    gridLineVisibilityLabel: {
        en: "Grid Line Visibility",
        zh_CN: "网格线可见性",
        ja: "グリッド線の表示",
    },
    gridLineTypeLabel: {
        en: "Grid Line Type",
        zh_CN: "网格线类型",
        ja: "グリッド線タイプ",
    },
    mirroredTrafficGridUnsupportedNote: {
        en: "Grid line settings are not supported in mirrored traffic mode.",
        zh_CN: "镜像流量模式不支持网格线设置。",
        ja: "ミラートラフィックモードではグリッド線設定はサポートされていません。",
    },
    networkCircleSplitNote: {
        en: "Upload and download split the circle into two halves.",
        zh_CN: "上传和下载会将圆环分成两半。",
        ja: "アップロードとダウンロードで円を 2 つに分割します。",
    },
    pingTargetValidation: {
        en: "Enter an IP address, hostname, or URL.",
        zh_CN: "请输入 IP 地址、主机名或 URL。",
        ja: "IP アドレス、ホスト名、または URL を入力してください。",
    },
} as const satisfies LocalizedMessages;

export const systemMessages = {
    batterySection: {
        en: "Battery",
        zh_CN: "电池",
        ja: "バッテリー",
    },
    batteryDeviceLabel: {
        en: "Battery",
        zh_CN: "电池",
        ja: "バッテリー",
    },
    systemBatteryOption: {
        en: "System",
        zh_CN: "系统",
        ja: "システム",
    },
    loadingBatteryDevicesOption: {
        en: "Searching...",
        zh_CN: "查找中...",
        ja: "検索中...",
    },
    noBatteryDevicesOption: {
        en: "No battery devices detected",
        zh_CN: "未检测到电池设备",
        ja: "バッテリーデバイスが検出されません",
    },
    batteryDevicesUnavailableOption: {
        en: "Battery devices unavailable",
        zh_CN: "电池设备不可用",
        ja: "バッテリーデバイスを利用できません",
    },
    unavailableBatterySelectionOption: {
        en: "Unavailable: {label}",
        zh_CN: "不可用：{label}",
        ja: "利用不可: {label}",
    },
    searchingBatterySelectionOption: {
        // Keep this prefix short; it appears inside a narrow select option before a device name.
        en: "Searching... {label}",
        zh_CN: "查找中... {label}",
        ja: "検索中... {label}",
    },
    unavailableBatterySelectionNote: {
        en: "The selected device is currently sleeping, or not currently connected.",
        zh_CN: "所选设备当前处于睡眠状态，或未连接。",
        ja: "選択したデバイスは現在スリープ中、または接続されていません。",
    },
    hiddenBatteryDevicesNote: {
        en: "Some USB HID devices were detected but not shown in the Battery list.",
        zh_CN: "检测到了一些 USB HID 设备，但未显示在电池列表中。",
        ja: "一部の USB HID デバイスは検出されましたが、バッテリー一覧には表示されていません。",
    },
    hiddenBatteryDevicesDetailsButton: {
        en: "Details...",
        zh_CN: "详情...",
        ja: "詳細...",
    },
    hiddenBatteryDevicesWindowTitle: {
        en: "Battery device diagnostics",
        zh_CN: "电池设备诊断",
        ja: "バッテリーデバイス診断",
    },
    hiddenBatteryDevicesWindowIntro: {
        en: "The following devices were detected but not shown.",
        zh_CN: "检测到了以下设备，但它们没有被显示。",
        ja: "次のデバイスは検出されましたが、表示されていません。",
    },
    experimentalVendorHidBatterySettingLabel: {
        en: "USB Device",
        zh_CN: "USB 设备",
        ja: "USB デバイス",
    },
    experimentalVendorHidBatteryCheckboxLabel: {
        en: "Enable experimental support",
        zh_CN: "启用实验性支持",
        ja: "実験的サポートを有効にする",
    },
    experimentalVendorHidBatteryNote: {
        en: "Reads battery levels from Logitech/ROG devices connected through USB receiver/dongle. Turn this off if you notice peripheral stutter, manufacturer software conflicts, or unstable device behavior.",
        zh_CN: "读取通过 USB 接收器/接收器适配器连接的 Logitech/ROG 设备电池电量。如果发现外设卡顿、厂商软件冲突或设备行为不稳定，请关闭此选项。",
        ja: "USB レシーバー/ドングル経由で接続された Logitech/ROG デバイスからバッテリー残量を読み取ります。周辺機器のカクつき、メーカーソフトウェアとの競合、デバイス動作が不安定な場合はオフにしてください。",
    },
    infrequentPollingNote: {
        en: "This device is checked infrequently since the support is experimental.",
        zh_CN: "由于支持仍为实验性，此设备会以较低频率检查。",
        ja: "サポートは実験的なため、このデバイスは低頻度で確認されます。",
    },
    voltageEstimatedBatteryNote: {
        en: "This device does not report an explicit battery percentage. ShoMetrics estimates it from voltage.",
        zh_CN: "此设备不会返回明确的电量百分比。ShoMetrics 会根据电压估算电量。",
        ja: "このデバイスは明確なバッテリー残量パーセントを返しません。ShoMetrics は電圧から推定します。",
    },
} as const satisfies LocalizedMessages;

export const helperMessages = {
    helperInstallCatalogMetrics: {
        en: "advanced sensors",
        zh_CN: "高级传感器",
        ja: "高度なセンサー",
    },
    helperInstallThisMetric: {
        en: "this metric",
        zh_CN: "此指标",
        ja: "このメトリクス",
    },
    helperNotInstalledGuidance: {
        en: "Install ShoMetrics Helper to use {subject}.",
        zh_CN: "安装 ShoMetrics Helper 以使用{subject}。",
        ja: "{subject}を使用するには ShoMetrics Helper をインストールしてください。",
    },
    helperStoppedGuidance: {
        en: "Start ShoMetrics Helper from ShoMetrics Control Panel.",
        zh_CN: "请从 ShoMetrics Control Panel 启动 ShoMetrics Helper。",
        ja: "ShoMetrics Control Panel から ShoMetrics Helper を起動してください。",
    },
    helperProtocolMismatchGuidance: {
        en: "Update ShoMetrics Helper and Hub to the latest version.",
        zh_CN: "请将 ShoMetrics Helper 和 Hub 更新到最新版本。",
        ja: "ShoMetrics Helper と Hub を最新バージョンに更新してください。",
    },
    helperDiagnosticsGuidance: {
        en: "Open ShoMetrics Control Panel for helper diagnostics.",
        zh_CN: "打开 ShoMetrics Control Panel 查看 Helper 诊断。",
        ja: "Helper の診断には ShoMetrics Control Panel を開いてください。",
    },
    sourceHelperOnly: {
        en: "Source: Helper only",
        zh_CN: "来源：仅 Helper",
        ja: "ソース: Helper のみ",
    },
} as const satisfies LocalizedMessages;

export const catalogMessages = {
    catalogUnsupportedPlatformNotice: {
        en: "This sensor is not supported on this platform.",
        zh_CN: "此传感器不支持此平台。",
        ja: "このセンサーはこのプラットフォームではサポートされていません。",
    },
    typeLabel: {
        en: "Type",
        zh_CN: "类型",
        ja: "種類",
    },
    hardwareLabel: {
        en: "Hardware",
        zh_CN: "硬件",
        ja: "ハードウェア",
    },
    readingLabel: {
        en: "Reading",
        zh_CN: "读数",
        ja: "測定値",
    },
    metricLabel: {
        en: "Metric",
        zh_CN: "指标",
        ja: "メトリクス",
    },
    metricsUnavailable: {
        en: "Metrics unavailable",
        zh_CN: "指标不可用",
        ja: "メトリクスを利用できません",
    },
    noHelperMetrics: {
        en: "No helper metrics",
        zh_CN: "没有 Helper 指标",
        ja: "Helper メトリクスがありません",
    },
    loadingMetrics: {
        en: "Loading metrics...",
        zh_CN: "正在加载指标...",
        ja: "メトリクスを読み込んでいます...",
    },
    labelScaleSection: {
        en: "Label & Scale",
        zh_CN: "标签与范围",
        ja: "ラベルとスケール",
    },
    labelLabel: {
        en: "Label",
        zh_CN: "标签",
        ja: "ラベル",
    },
    detectedLabelPlaceholder: {
        en: "Detected label",
        zh_CN: "检测到的标签",
        ja: "検出されたラベル",
    },
    useDetectedButton: {
        en: "Use Detected",
        zh_CN: "使用检测值",
        ja: "検出値を使用",
    },
    catalogLabelScaleResetNote: {
        en: "Custom label and scale reset when you choose a different metric.",
        zh_CN: "选择其他指标时，自定义标签和范围会重置。",
        ja: "別のメトリクスを選択すると、カスタムラベルとスケールはリセットされます。",
    },
} as const satisfies LocalizedMessages;

export const customMetricMessages = {
    sourceSection: {
        en: "Source",
        zh_CN: "来源",
        ja: "ソース",
    },
    editSourceSection: {
        en: "HTTP Source",
        zh_CN: "HTTP 来源",
        ja: "HTTP ソース",
    },
    transformSection: {
        en: "Transform",
        zh_CN: "转换",
        ja: "変換",
    },
    resultSection: {
        en: "Result",
        zh_CN: "结果",
        ja: "結果",
    },
    iconSection: {
        en: "Icon",
        zh_CN: "图标",
        ja: "アイコン",
    },
    sourceSummaryLabel: {
        en: "HTTP Source",
        zh_CN: "HTTP 来源",
        ja: "HTTP ソース",
    },
    sourceConfiguredSummary: {
        en: "Configured",
        zh_CN: "已配置",
        ja: "設定済み",
    },
    sourceNeedsSetupSummary: {
        en: "Needs setup",
        zh_CN: "需要设置",
        ja: "設定が必要",
    },
    editSourceButton: {
        en: "Edit",
        zh_CN: "编辑",
        ja: "編集",
    },
    iconSearchLabel: {
        en: "Widget Icon",
        zh_CN: "组件图标",
        ja: "ウィジェットアイコン",
    },
    iconSearchPlaceholder: {
        en: "Search icons",
        zh_CN: "搜索图标",
        ja: "アイコンを検索",
    },
    iconHint: {
        en: "This sets the key's icon. Icon is used in some views only.",
        zh_CN: "这里设置按键图标。图标只在部分视图中使用。",
        ja: "キーのアイコンを設定します。アイコンは一部の表示でのみ使われます。",
    },
    iconShowingResultsStatus: {
        en: "{shown} of {count} matches",
        zh_CN: "{shown}/{count} 个匹配",
        ja: "{shown}/{count} 件一致",
    },
    iconNoResultsStatus: {
        en: "No matching icons",
        zh_CN: "没有匹配的图标",
        ja: "一致するアイコンはありません",
    },
    iconKeepTypingHint: {
        en: "Showing {shown} of {count} matching icons. Keep typing to narrow the list.",
        zh_CN: "正在显示 {count} 个匹配图标中的 {shown} 个。继续输入可缩小范围。",
        ja: "{count} 件中 {shown} 件の一致アイコンを表示しています。入力を続けると絞り込めます。",
    },
    iconClearButton: {
        en: "Clear Icon",
        zh_CN: "清除图标",
        ja: "アイコンをクリア",
    },
    backToWidgetButton: {
        en: "Back",
        zh_CN: "返回",
        ja: "戻る",
    },
    editSourceNote: {
        en: "Edits save automatically. Go back to edit widget appearance and polling.",
        zh_CN: "编辑会自动保存。返回后可编辑组件外观和轮询。",
        ja: "編集は自動保存されます。戻るとウィジェットの外観とポーリングを編集できます。",
    },
    urlLabel: {
        en: "HTTP URL",
        zh_CN: "HTTP URL",
        ja: "HTTP URL",
    },
    urlPlaceholder: {
        en: "https://api.example.com/data.json",
        zh_CN: "https://api.example.com/data.json",
        ja: "https://api.example.com/data.json",
    },
    userIntentLabel: {
        en: "What to Show",
        zh_CN: "要显示什么",
        ja: "表示したい内容",
    },
    userIntentPlaceholder: {
        en: "Display current temperature",
        zh_CN: "显示当前温度",
        ja: "現在の気温を表示",
    },
    userIntentHint: {
        en: "Memo for you and prompt context for AI: describe exactly which value to display, for example: current temperature in Tokyo.",
        zh_CN: "这是给自己看的备忘，也是给 AI 的提示词上下文：明确写出要显示哪个值，例如：东京当前温度。",
        ja: "自分用のメモであり、AI に渡すプロンプトの文脈でもあります。表示したい値を具体的に書いてください。例: 東京の現在の気温。",
    },
    jqTransformLabel: {
        en: "jq Transform",
        zh_CN: "jq 转换",
        ja: "jq 変換",
    },
    jqTransformPlaceholder: {
        en: "{ metric: { label: \"TEMP\", value: .temperature, unit: \"celsius\" } }",
        zh_CN: "{ metric: { label: \"TEMP\", value: .temperature, unit: \"celsius\" } }",
        ja: "{ metric: { label: \"TEMP\", value: .temperature, unit: \"celsius\" } }",
    },
    jqTransformHint: {
        en: "Paste the jq transform rule here. The recommended workflow is to copy the AI prompt above into your favorite AI chatbot, then paste the generated jq rule back here.",
        zh_CN: "在这里粘贴 jq 转换规则。推荐流程是把上面的 AI 提示词复制到你常用的 AI 聊天工具，让它生成 jq 规则，再复制回来。",
        ja: "ここに jq 変換ルールを貼り付けます。上の AI プロンプトを普段使う AI チャットにコピーし、生成された jq ルールをここへ貼り付ける流れを推奨します。",
    },
    fetchSampleButton: {
        en: "Fetch Sample",
        zh_CN: "获取样本",
        ja: "サンプル取得",
    },
    fetchSamplePendingButton: {
        en: "Fetching...",
        zh_CN: "正在获取...",
        ja: "取得中...",
    },
    testTransformButton: {
        en: "Test Transform",
        zh_CN: "测试转换",
        ja: "変換をテスト",
    },
    copyPromptButton: {
        en: "Copy Prompt",
        zh_CN: "复制提示词",
        ja: "プロンプトをコピー",
    },
    promptLabel: {
        en: "AI Prompt",
        zh_CN: "AI 提示词",
        ja: "AI プロンプト",
    },
    promptNeedsSampleHint: {
        en: "To copy the prompt, first fetch a sample JSON.",
        zh_CN: "要复制提示词，请先获取一个 JSON 样本。",
        ja: "プロンプトをコピーするには、先にサンプル JSON を取得してください。",
    },
    promptHint: {
        en: "Copy this prompt into your favorite AI chatbot to generate the jq rule for the data transform.",
        zh_CN: "把这段提示词复制到你常用的 AI 聊天工具，让 AI 帮你生成数据转换需要的 jq 规则。",
        ja: "このプロンプトを普段使う AI チャットにコピーして、データ変換用の jq ルールを生成します。",
    },
    fetchSampleFirstNote: {
        en: "Fetch a sample before testing the transform.",
        zh_CN: "测试转换前请先获取样本。",
        ja: "変換をテストする前にサンプルを取得してください。",
    },
    fetchUnavailableMissingUrl: {
        en: "Enter an HTTP or HTTPS URL before fetching a sample.",
        zh_CN: "请先输入 HTTP 或 HTTPS URL，再获取样本。",
        ja: "サンプルを取得する前に、HTTP または HTTPS URL を入力してください。",
    },
    fetchUnavailableInvalidUrl: {
        en: "Enter a valid HTTP or HTTPS URL before fetching a sample.",
        zh_CN: "请输入有效的 HTTP 或 HTTPS URL，再获取样本。",
        ja: "サンプルを取得する前に、有効な HTTP または HTTPS URL を入力してください。",
    },
    fetchUnavailableMissingCredential: {
        en: "The selected credential is missing. Select or create a credential in the {authenticationSection} section.",
        zh_CN: "选中的凭证不存在。请在“{authenticationSection}”部分选择或创建凭证。",
        ja: "選択した認証情報が見つかりません。{authenticationSection} セクションで認証情報を選択または作成してください。",
    },
    fetchUnavailablePublicHttpCredentialConsent: {
        en: "Authentication over public HTTP requires confirmation in the {authenticationSection} section.",
        zh_CN: "通过公共 HTTP 发送认证信息需要先在“{authenticationSection}”部分确认。",
        ja: "公開 HTTP で認証情報を送信するには、{authenticationSection} セクションで確認が必要です。",
    },
    goToFetchSampleButton: {
        en: "Go to Fetch Sample",
        zh_CN: "转到获取样本",
        ja: "サンプル取得へ移動",
    },
    fetchLimitsNote: {
        en: "Current fetch settings: {timeoutSeconds}s timeout, {retryCount} retries, {responseLimitKiB} KiB response limit.",
        zh_CN: "当前请求设置：{timeoutSeconds} 秒超时、{retryCount} 次重试、响应上限 {responseLimitKiB} KiB。",
        ja: "現在の取得設定: {timeoutSeconds} 秒タイムアウト、{retryCount} 回リトライ、レスポンス上限 {responseLimitKiB} KiB。",
    },
    noSecretsNote: {
        en: "Entering secrets here is insecure. Put them in Authentication.",
        zh_CN: "不要在这里输入密钥。请放在身份验证里。",
        ja: "ここにシークレットを入力するのは安全ではありません。認証に保存してください。",
    },
    requestSettingsSection: {
        en: "Request Settings",
        zh_CN: "请求设置",
        ja: "リクエスト設定",
    },
    authenticationSection: {
        en: "Authentication",
        zh_CN: "身份验证",
        ja: "認証",
    },
    credentialLabel: {
        en: "Credential",
        zh_CN: "凭证",
        ja: "認証情報",
    },
    noCredentialOption: {
        en: "No Authentication",
        zh_CN: "不使用身份验证",
        ja: "認証なし",
    },
    missingCredentialOption: {
        en: "Missing Credential",
        zh_CN: "凭证缺失",
        ja: "認証情報なし",
    },
    editingNewCredentialOption: {
        en: "Editing New Credential",
        zh_CN: "正在编辑新凭证",
        ja: "新しい認証情報を編集中",
    },
    credentialMissingNote: {
        en: "The selected credential no longer exists. Choose another credential or create a new one.",
        zh_CN: "所选凭证已不存在。请选择其他凭证或新建一个。",
        ja: "選択された認証情報は存在しません。別の認証情報を選ぶか、新しく作成してください。",
    },
    credentialTypeLabel: {
        en: "Type",
        zh_CN: "类型",
        ja: "種類",
    },
    credentialTypeBasic: {
        en: "Basic",
        zh_CN: "Basic",
        ja: "Basic",
    },
    credentialTypeBearer: {
        en: "Bearer",
        zh_CN: "Bearer",
        ja: "Bearer",
    },
    credentialTypeHeader: {
        en: "API Key Header",
        zh_CN: "API Key 请求头",
        ja: "API キーヘッダー",
    },
    credentialTypeQuery: {
        en: "API Key Query",
        zh_CN: "API Key 查询参数",
        ja: "API キークエリ",
    },
    credentialDatesLabel: {
        en: "Saved",
        zh_CN: "保存时间",
        ja: "保存日時",
    },
    credentialDateUnknown: {
        en: "Unknown",
        zh_CN: "未知",
        ja: "不明",
    },
    credentialDateSummary: {
        en: "Created {created}; updated {updated}",
        zh_CN: "创建于 {created}；更新于 {updated}",
        ja: "作成: {created}、更新: {updated}",
    },
    addCredentialButton: {
        en: "Add New Credential",
        zh_CN: "新建凭证",
        ja: "新しい認証情報を追加",
    },
    deleteCredentialButton: {
        en: "Delete Credential",
        zh_CN: "删除凭证",
        ja: "認証情報を削除",
    },
    credentialSecretPreserveNote: {
        en: "The saved secret is hidden. Enter a new secret to replace it.",
        zh_CN: "已保存的密钥已被隐藏。输入新密钥即可替换。",
        ja: "保存済みのシークレットは非表示です。置き換えるには新しいシークレットを入力してください。",
    },
    credentialSecretStorageNote: {
        en: "Secrets are saved in ShoMetrics global settings and are not included when this action is exported.",
        zh_CN: "密钥保存在全局设置，不包含在此按钮的设置导出里。",
        ja: "シークレットはグローバル設定に保存され、このアクションのエクスポートには含まれません。",
    },
    credentialSecretPreservePlaceholder: {
        en: "Leave blank to keep saved secret",
        zh_CN: "留空以保留已保存的密钥",
        ja: "空欄のままなら保存済みのシークレットを保持",
    },
    showCredentialSecretButton: {
        en: "Show Secret",
        zh_CN: "显示密钥",
        ja: "シークレットを表示",
    },
    hideCredentialSecretButton: {
        en: "Hide Secret",
        zh_CN: "隐藏密钥",
        ja: "シークレットを隠す",
    },
    credentialNicknameLabel: {
        en: "Nickname",
        zh_CN: "昵称",
        ja: "ニックネーム",
    },
    credentialNicknamePlaceholder: {
        en: "Home server",
        zh_CN: "家里服务器",
        ja: "ホームサーバー",
    },
    credentialUsernameLabel: {
        en: "Username",
        zh_CN: "用户名",
        ja: "ユーザー名",
    },
    credentialPasswordLabel: {
        en: "Password",
        zh_CN: "密码",
        ja: "パスワード",
    },
    credentialTokenLabel: {
        en: "Token",
        zh_CN: "令牌",
        ja: "トークン",
    },
    credentialHeaderNameLabel: {
        en: "Header Name",
        zh_CN: "请求头名称",
        ja: "ヘッダー名",
    },
    credentialQueryParameterLabel: {
        en: "Query Name",
        zh_CN: "查询参数名",
        ja: "クエリ名",
    },
    saveCredentialButton: {
        en: "Save Credential",
        zh_CN: "保存凭证",
        ja: "認証情報を保存",
    },
    editCredentialButton: {
        en: "Edit Credential",
        zh_CN: "编辑凭证",
        ja: "認証情報を編集",
    },
    cancelCredentialButton: {
        en: "Cancel",
        zh_CN: "取消",
        ja: "キャンセル",
    },
    credentialNicknameRequired: {
        en: "Enter a nickname.",
        zh_CN: "请输入昵称。",
        ja: "ニックネームを入力してください。",
    },
    credentialBasicRequired: {
        en: "Enter username and password.",
        zh_CN: "请输入用户名和密码。",
        ja: "ユーザー名とパスワードを入力してください。",
    },
    credentialTokenRequired: {
        en: "Enter a token.",
        zh_CN: "请输入令牌。",
        ja: "トークンを入力してください。",
    },
    credentialHeaderRequired: {
        en: "Enter header name and token.",
        zh_CN: "请输入请求头名称和令牌。",
        ja: "ヘッダー名とトークンを入力してください。",
    },
    credentialQueryRequired: {
        en: "Enter query parameter name and token.",
        zh_CN: "请输入查询参数名和令牌。",
        ja: "クエリパラメーター名とトークンを入力してください。",
    },
    deleteCredentialWarning: {
        en: "Delete \"{nickname}\"? Other widgets using this credential may stop working.",
        zh_CN: "删除“{nickname}”？使用此凭证的其他组件可能会停止工作。",
        ja: "「{nickname}」を削除しますか。この認証情報を使っている他のウィジェットが動作しなくなる可能性があります。",
    },
    confirmDeleteCredentialButton: {
        en: "Delete Credential",
        zh_CN: "删除凭证",
        ja: "認証情報を削除",
    },
    publicHttpCredentialConsentLabel: {
        en: "HTTP Auth",
        zh_CN: "HTTP 身份验证",
        ja: "HTTP 認証",
    },
    publicHttpCredentialConsentCheckbox: {
        en: "Allow credentials over public HTTP",
        zh_CN: "允许通过公网 HTTP 发送凭证",
        ja: "公開 HTTP で認証情報を送信する",
    },
    publicHttpCredentialWarning: {
        en: "Public HTTP is not encrypted. Only enable this if you understand the credential may be exposed in transit.",
        zh_CN: "公网 HTTP 未加密。只有在你确认凭证可能在传输中暴露并接受该风险时才启用。",
        ja: "公開 HTTP は暗号化されません。通信中に認証情報が露出する可能性を理解している場合のみ有効にしてください。",
    },
    queryCredentialCollisionWarning: {
        en: "This URL already has a \"{parameterName}\" query parameter. The credential value will replace it when requests run.",
        zh_CN: "此 URL 已包含“{parameterName}”查询参数。实际请求时会用凭证里的值覆盖它。",
        ja: "この URL には既に「{parameterName}」クエリパラメーターがあります。リクエスト実行時は認証情報の値で置き換えられます。",
    },
    timeoutSecondsLabel: {
        en: "Timeout",
        zh_CN: "超时",
        ja: "タイムアウト",
    },
    retryCountLabel: {
        en: "Retries",
        zh_CN: "重试次数",
        ja: "リトライ回数",
    },
    fetchSampleSection: {
        en: "Fetch Sample",
        zh_CN: "获取样本",
        ja: "サンプル取得",
    },
    requestBudgetWarning: {
        en: "Worst-case request time is about {worstCaseSeconds}s, longer than the {pollingSeconds}s polling frequency. Source refresh waits for the current request to finish before scheduling the next one.",
        zh_CN: "最坏情况下请求大约需要 {worstCaseSeconds} 秒，超过当前 {pollingSeconds} 秒轮询频率。Source refresh 会等当前请求结束后再安排下一次请求。",
        ja: "最悪時のリクエスト時間は約 {worstCaseSeconds} 秒で、現在の {pollingSeconds} 秒ポーリング頻度を超えます。ソース更新は現在のリクエスト完了後に次のリクエストをスケジュールします。",
    },
    sampleReadyNote: {
        en: "Sample fetched. Response size: {bytes} bytes. Request time: {elapsedMilliseconds} ms.",
        zh_CN: "样本已获取。响应大小：{bytes} 字节。请求耗时：{elapsedMilliseconds} ms。",
        ja: "サンプルを取得しました。レスポンスサイズ: {bytes} バイト。リクエスト時間: {elapsedMilliseconds} ms。",
    },
    samplePreviewLabel: {
        en: "Sample Preview",
        zh_CN: "样本预览",
        ja: "サンプルプレビュー",
    },
    samplePreviewTruncatedHint: {
        en: "This preview is truncated. For large valid JSON, the AI prompt uses a structure digest instead of this raw preview.",
        zh_CN: "这个预览已被截断。对于有效的大型 JSON，AI 提示词会使用结构摘要，而不是这段原始预览。",
        ja: "このプレビューは切り詰められています。有効で大規模な JSON の場合、AI プロンプトはこの生プレビューではなく構造の要約を使います。",
    },
    transformPreviewLabel: {
        en: "Validated Metric",
        zh_CN: "已验证指标",
        ja: "検証済みメトリクス",
    },
    transformStatusMetricReady: {
        en: "Valid metric output.",
        zh_CN: "已输出有效指标。",
        ja: "有効なメトリクスを出力しました。",
    },
    transformStatusExplorationReady: {
        en: "jq ran, but the output is not a metric yet.",
        zh_CN: "jq 已运行，但输出还不是指标。",
        ja: "jq は実行されましたが、出力はまだメトリクスではありません。",
    },
    transformStatusFailed: {
        en: "jq transform failed.",
        zh_CN: "jq 转换失败。",
        ja: "jq 変換に失敗しました。",
    },
    explorationOutputLabel: {
        en: "Exploration Output",
        zh_CN: "探索输出",
        ja: "探索出力",
    },
    explorationOutputHint: {
        en: "This jq ran successfully, but the output is not a valid final metric. Copy this output back to the AI as exploration data.",
        zh_CN: "这个 jq 已成功运行，但输出不是有效的最终指标。请把这个输出作为探索数据复制回 AI。",
        ja: "この jq は正常に実行されましたが、出力は有効な最終メトリクスではありません。この出力を探索データとして AI にコピーして戻してください。",
    },
    explorationSchemaNote: {
        en: "Metric schema note: {detail}",
        zh_CN: "指标 schema 说明：{detail}",
        ja: "メトリクススキーマの注記: {detail}",
    },
    copyExplorationOutputButton: {
        en: "Copy Output",
        zh_CN: "复制输出",
        ja: "出力をコピー",
    },
    copyButtonCopiedLabel: {
        en: "Copied",
        zh_CN: "已复制",
        ja: "コピー済み",
    },
    copyButtonFailedLabel: {
        en: "Copy Failed",
        zh_CN: "复制失败",
        ja: "コピー失敗",
    },
    testingNote: {
        en: "Testing...",
        zh_CN: "正在测试...",
        ja: "テスト中...",
    },
    testFailedNote: {
        en: "Test failed. Copy the failure details for debugging.",
        zh_CN: "测试失败。可以复制错误详情用于排查。",
        ja: "テストに失敗しました。デバッグ用にエラー詳細をコピーできます。",
    },
    fetchSampleFailedNote: {
        en: "Fetching sample failed. See failure debug details below.",
        zh_CN: "获取样本失败。请查看下方错误调试详情。",
        ja: "サンプル取得に失敗しました。下のエラーデバッグ詳細を確認してください。",
    },
    failureDetailsLabel: {
        en: "Failure Debug Details",
        zh_CN: "错误调试详情",
        ja: "エラーデバッグ詳細",
    },
    failureDetailsHint: {
        en: "Copy these details for debugging.",
        zh_CN: "复制这些详情用于排查。",
        ja: "デバッグ用にこの詳細をコピーしてください。",
    },
    transformFailureDetailsHint: {
        en: "The jq transform failed and did not output a valid metric. Copy these details for debugging.",
        zh_CN: "jq 转换失败，未能输出合格的指标。复制这些详情用于排查。",
        ja: "jq 変換に失敗し、有効なメトリクスを出力できませんでした。デバッグ用にこの詳細をコピーしてください。",
    },
    copyDetailsButton: {
        en: "Copy Details",
        zh_CN: "复制详情",
        ja: "詳細をコピー",
    },
    redirectBlockedNotice: {
        en: "Notice",
        zh_CN: "注意",
        ja: "注意",
    },
    redirectBlockedSummary: {
        en: "API URL is being redirected from {fromOrigin} to {toOrigin}: {redirectedUrl}. Your request is blocked; confirm you want to use the redirected URL before continuing.",
        zh_CN: "API URL 正在从 {fromOrigin} 重定向到 {toOrigin}：{redirectedUrl}。请求已被阻止；继续前请确认是否使用重定向后的 URL。",
        ja: "API URL は {fromOrigin} から {toOrigin} にリダイレクトされています: {redirectedUrl}。リクエストはブロックされました。続行する前に、リダイレクト先 URL を使用するか確認してください。",
    },
    useRedirectedUrlButton: {
        en: "Use Redirected URL",
        zh_CN: "使用重定向后的 URL",
        ja: "リダイレクト先 URL を使用",
    },
    copyRedirectedUrlButton: {
        en: "Copy Redirected URL",
        zh_CN: "复制重定向后的 URL",
        ja: "リダイレクト先 URL をコピー",
    },
    validationUrlRequired: {
        en: "Enter an HTTP or HTTPS URL.",
        zh_CN: "请输入 HTTP 或 HTTPS URL。",
        ja: "HTTP または HTTPS URL を入力してください。",
    },
    validationTransformRequired: {
        en: "Enter a jq transform.",
        zh_CN: "请输入 jq 转换。",
        ja: "jq 変換を入力してください。",
    },
} as const satisfies LocalizedMessages;

export const denseMessages = {
    rowsSection: {
        en: "Metrics",
        zh_CN: "指标",
        ja: "メトリクス",
    },
    rowMetricLabel: {
        en: "Metric",
        zh_CN: "指标",
        ja: "メトリクス",
    },
    rowMetricSubtypeLabel: {
        en: "Metric Detail",
        zh_CN: "指标细项",
        ja: "メトリクス詳細",
    },
    rowDirectionLabel: {
        en: "Direction",
        zh_CN: "方向",
        ja: "方向",
    },
    rowLabelLabel: {
        en: "Label",
        zh_CN: "标签",
        ja: "ラベル",
    },
    rowMaximumLabel: {
        en: "Max",
        zh_CN: "最大值",
        ja: "最大値",
    },
    shortLabelNote: {
        en: "Use short labels. The widget will fit text by pixels.",
        zh_CN: "请使用短标签。组件会按像素自动适配文本。",
        ja: "短いラベルを使用してください。ウィジェットはピクセル単位で文字を調整します。",
    },
    reorderLabel: {
        en: "Reorder",
        zh_CN: "重新排序",
        ja: "並べ替え",
    },
    reorderMoveButtonsLabel: {
        en: "Show move buttons",
        zh_CN: "显示移动按钮",
        ja: "移動ボタンを表示",
    },
    addMetricButton: {
        en: "Add Metric",
        zh_CN: "添加指标",
        ja: "メトリクスを追加",
    },
    removeMetricButton: {
        en: "Remove",
        zh_CN: "移除",
        ja: "削除",
    },
    moveUpButton: {
        en: "Move Up",
        zh_CN: "上移",
        ja: "上へ移動",
    },
    moveDownButton: {
        en: "Move Down",
        zh_CN: "下移",
        ja: "下へ移動",
    },
    catalogMetricChoice: {
        en: "Advanced Sensor",
        zh_CN: "高级传感器",
        ja: "高度なセンサー",
    },
    customMetricChoice: {
        en: "Custom Metric",
        zh_CN: "自定义指标",
        ja: "カスタムメトリクス",
    },
} as const satisfies LocalizedMessages;

export const stackedMessages = {
    stackSection: {
        en: "Stack",
        zh_CN: "叠放",
        ja: "スタック",
    },
    rotationSection: {
        en: "Rotation",
        zh_CN: "轮播",
        ja: "ローテーション",
    },
    selectedSlotSection: {
        en: "Editing Metric #{slotNumber}",
        zh_CN: "正在编辑指标 #{slotNumber}",
        ja: "メトリック #{slotNumber} を編集中",
    },
    metricTypeLabel: {
        en: "Metric Type",
        zh_CN: "指标类型",
        ja: "メトリクスタイプ",
    },
    slotLabel: {
        en: "Slot",
        zh_CN: "槽位",
        ja: "スロット",
    },
    editSlotButton: {
        en: "Edit",
        zh_CN: "编辑",
        ja: "編集",
    },
    backToStackButton: {
        en: "Back",
        zh_CN: "返回",
        ja: "戻る",
    },
    addSlotButton: {
        en: "Add Slot",
        zh_CN: "添加槽位",
        ja: "スロットを追加",
    },
    removeSlotButton: {
        en: "Remove",
        zh_CN: "移除",
        ja: "削除",
    },
    reorderLabel: {
        en: "Reorder",
        zh_CN: "重新排序",
        ja: "並べ替え",
    },
    reorderMoveButtonsLabel: {
        en: "Show move buttons",
        zh_CN: "显示移动按钮",
        ja: "移動ボタンを表示",
    },
    moveUpButton: {
        en: "Move Up",
        zh_CN: "上移",
        ja: "上へ移動",
    },
    moveDownButton: {
        en: "Move Down",
        zh_CN: "下移",
        ja: "下へ移動",
    },
    autoRotateLabel: {
        en: "Auto Rotate",
        zh_CN: "自动轮播",
        ja: "自動ローテーション",
    },
    intervalSecondsLabel: {
        en: "Interval (s)",
        zh_CN: "间隔（秒）",
        ja: "間隔（秒）",
    },
    manualSwitchKeyNote: {
        en: "Key action: press the key to switch.",
        zh_CN: "按键动作：按下按键切换。",
        ja: "キーアクション: キーを押すと切り替えます。",
    },
    manualSwitchDialNote: {
        en: "Dial action: rotate the dial to switch.",
        zh_CN: "旋钮动作：转动旋钮切换。",
        ja: "ダイヤルアクション: ダイヤルを回すと切り替えます。",
    },
    manualSwitchAutoRotateNote: {
        en: "Manual switching still works when auto rotate is off.",
        zh_CN: "关闭自动轮播后仍可手动切换。",
        ja: "自動ローテーションがオフでも手動切り替えは使えます。",
    },
    selectedSlotNote: {
        en: "Edits save automatically. Go back to edit stacked settings.",
        zh_CN: "编辑会自动保存。返回后可编辑叠放设置。",
        ja: "編集は自動保存されます。戻るとスタック設定を編集できます。",
    },
    catalogMetricChoice: {
        en: "Advanced Sensor",
        zh_CN: "高级传感器",
        ja: "高度なセンサー",
    },
    customMetricChoice: {
        en: "Custom Metric",
        zh_CN: "自定义指标",
        ja: "カスタムメトリクス",
    },
} as const satisfies LocalizedMessages;
