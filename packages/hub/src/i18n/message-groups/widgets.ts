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
} as const satisfies LocalizedMessages;
