import type { ManifestMessagesCatalog } from "./manifest-localization";

export const manifestMessages = {
    root: {
        name: {
            en: "Sho Metrics",
            zh_CN: "Sho Metrics",
            ja: "Sho Metrics",
        },
        description: {
            en: "Display live System metrics such as CPU, GPU, memory, disk, network, sensor metrics, and HTTP metrics.",
            zh_CN: "显示实时系统指标，例如 CPU、GPU、内存、磁盘、网络、传感器指标和 HTTP 指标。",
            ja: "CPU、GPU、メモリ、ディスク、ネットワーク、センサーメトリクス、HTTP メトリクスなどのライブシステムメトリクスを表示します。",
        },
    },
    actions: {
        "com.ez.sho-metrics.cpu": {
            name: {
                en: "CPU",
                zh_CN: "CPU",
                ja: "CPU",
            },
            tooltip: {
                en: "Displays CPU metrics.",
                zh_CN: "显示 CPU 指标。",
                ja: "CPU メトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.gpu": {
            name: {
                en: "GPU",
                zh_CN: "GPU",
                ja: "GPU",
            },
            tooltip: {
                en: "Displays GPU metrics.",
                zh_CN: "显示 GPU 指标。",
                ja: "GPU メトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.memory": {
            name: {
                en: "Memory",
                zh_CN: "内存",
                ja: "メモリ",
            },
            tooltip: {
                en: "Displays memory metrics.",
                zh_CN: "显示内存指标。",
                ja: "メモリメトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.disk": {
            name: {
                en: "Disk",
                zh_CN: "磁盘",
                ja: "ディスク",
            },
            tooltip: {
                en: "Displays disk metrics.",
                zh_CN: "显示磁盘指标。",
                ja: "ディスクメトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.network": {
            name: {
                en: "Network",
                zh_CN: "网络",
                ja: "ネットワーク",
            },
            tooltip: {
                en: "Displays network metrics.",
                zh_CN: "显示网络指标。",
                ja: "ネットワークメトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.system": {
            name: {
                en: "System & Battery",
                zh_CN: "系统与电池",
                ja: "システムとバッテリー",
            },
            tooltip: {
                en: "Displays system and supported device battery metrics.",
                zh_CN: "显示系统和受支持设备的电池指标。",
                ja: "システムと対応デバイスのバッテリーメトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.catalog-metric": {
            name: {
                en: "Advanced Sensor",
                zh_CN: "高级传感器",
                ja: "高度なセンサー",
            },
            tooltip: {
                en: "Displays one selected metric, such as LibreHardwareMonitor data.",
                zh_CN: "显示一个选定指标（如：LibreHardwareMonitor 数据）。",
                ja: "LibreHardwareMonitor データなど、選択したメトリクスを 1 つ表示します。",
            },
        },
        "com.ez.sho-metrics.custom-metric": {
            name: {
                en: "Custom Metric",
                zh_CN: "自定义指标",
                ja: "カスタムメトリクス",
            },
            tooltip: {
                en: "Displays a metric from a custom source, such as HTTP JSON.",
                zh_CN: "显示来自自定义来源的指标，例如 HTTP JSON。",
                ja: "HTTP JSON など、カスタムソースのメトリクスを表示します。",
            },
        },
        "com.ez.sho-metrics.dense-multi-metric": {
            name: {
                en: "Dense Multi Metric",
                zh_CN: "密集多指标",
                ja: "高密度マルチメトリクス",
            },
            tooltip: {
                en: "Displays multiple metrics in one compact view.",
                zh_CN: "在一个紧凑视图中显示多个指标。",
                ja: "複数のメトリクスを 1 つのコンパクトな表示にまとめます。",
            },
        },
        "com.ez.sho-metrics.stacked-metric": {
            name: {
                en: "Stacked Metric",
                zh_CN: "堆叠指标",
                ja: "スタックメトリクス",
            },
            tooltip: {
                en: "Rotates between multiple metric widgets on one key.",
                zh_CN: "在一个按键上轮播多个指标小组件。",
                ja: "1 つのキーで複数のメトリクスウィジェットを切り替えます。",
            },
            encoder: {
                triggerDescription: {
                    Push: {
                        en: "Refresh",
                        zh_CN: "刷新",
                        ja: "更新",
                    },
                    Rotate: {
                        en: "Switch metric",
                        zh_CN: "切换指标",
                        ja: "メトリクスを切り替え",
                    },
                },
            },
        },
    },
} as const satisfies ManifestMessagesCatalog;
