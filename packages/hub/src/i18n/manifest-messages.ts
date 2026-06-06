import type { ManifestMessagesCatalog } from "./manifest-localization";

export const manifestMessages = {
    root: {
        name: {
            en: "Sho Metrics",
            zh_CN: "Sho Metrics",
            ja: "Sho Metrics",
        },
        description: {
            en: "system monitor plugin",
            zh_CN: "系统监控插件",
            ja: "システム監視プラグイン",
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
    },
} as const satisfies ManifestMessagesCatalog;
