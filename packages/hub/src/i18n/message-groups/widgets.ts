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
