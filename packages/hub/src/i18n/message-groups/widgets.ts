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
        en: "Custom Metric settings are saved in Stream Deck action settings and included in Stream Deck exports. Do not use secrets, tokens, cookies, or private URLs.",
        zh_CN: "自定义指标设置会保存到 Stream Deck 操作设置中，并包含在 Stream Deck 导出里。不要使用密钥、令牌、Cookie 或私密 URL。",
        ja: "カスタムメトリクス設定は Stream Deck のアクション設定に保存され、Stream Deck のエクスポートにも含まれます。シークレット、トークン、Cookie、非公開 URL は使用しないでください。",
    },
    requestSettingsSection: {
        en: "Request Settings",
        zh_CN: "请求设置",
        ja: "リクエスト設定",
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
        en: "This preview is truncated. The AI prompt uses this truncated preview, so results may be unreliable if the requested field is missing.",
        zh_CN: "这个预览已被截断。AI 提示词会使用这段截断预览；如果目标字段不在预览里，生成结果可能不可靠。",
        ja: "このプレビューは切り詰められています。AI プロンプトもこの切り詰めたプレビューを使うため、必要なフィールドが含まれない場合は結果が不安定になる可能性があります。",
    },
    transformPreviewLabel: {
        en: "Validated Metric",
        zh_CN: "已验证指标",
        ja: "検証済みメトリクス",
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
    promptCopiedNote: {
        en: "Prompt copied.",
        zh_CN: "提示词已复制。",
        ja: "プロンプトをコピーしました。",
    },
    promptCopyFailedNote: {
        en: "Copy failed. Select the prompt and copy it manually.",
        zh_CN: "复制失败。请选择提示词并手动复制。",
        ja: "コピーできませんでした。プロンプトを選択して手動でコピーしてください。",
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
