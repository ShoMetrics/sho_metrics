$ErrorActionPreference = 'Stop'
$durationSeconds = __DURATION_SECONDS__
$intervalMilliseconds = __INTERVAL_MILLISECONDS__
$warmupSamples = __WARMUP_SAMPLES__
$logicalProcessorCount = __LOGICAL_PROCESSOR_COUNT__
$monitorNodeProcessId = __MONITOR_NODE_PROCESS_ID__
$monitorPowerShellProcessId = $PID
$targetNames = @(ConvertFrom-Json @'
__PROCESS_NAMES_JSON__
'@ | ForEach-Object { $_.ToLowerInvariant() })
$counterPaths = @(
    '\Processor(_Total)\% Processor Time',
    '\Process(*)\ID Process',
    '\Process(*)\Creating Process ID',
    '\Process(*)\% Processor Time',
    '\Process(*)\Private Bytes',
    '\Process(*)\IO Read Operations/sec',
    '\Process(*)\IO Write Operations/sec',
    '\Process(*)\Thread Count',
    '\Process(*)\Handle Count'
)
$deadline = [DateTimeOffset]::UtcNow.AddSeconds($durationSeconds)
$sampleIndex = 0
$previousSampleTimestamp = $null
while ([DateTimeOffset]::UtcNow -lt $deadline) {
    $loopStartedAt = [DateTimeOffset]::UtcNow
    $processesByInstance = @{}
    $systemCpuPercent = $null
    $sampleStatus = 'ok'
    $counterSampleCount = 0

    try {
        $counterSample = Get-Counter -Counter $counterPaths -ErrorAction SilentlyContinue
        $counterSampleCount = @($counterSample.CounterSamples).Count

        if ($counterSampleCount -eq 0) {
            $sampleStatus = 'partial:no-counter-samples'
        }

        foreach ($sample in @($counterSample.CounterSamples)) {
            $samplePath = $sample.Path.ToLowerInvariant()
            if ($samplePath -match '\\processor\(_total\)\\% processor time$') {
                $systemCpuPercent = [double]$sample.CookedValue
                continue
            }
            if ($samplePath -notmatch '\\process\((?<instance>.+)\)\\(?<counter>.+)$') {
                continue
            }

            $instance = $Matches.instance
            $counter = $Matches.counter
            $baseName = $instance -replace '#\d+$', ''
            if ($targetNames -notcontains $baseName) {
                continue
            }

            if (-not $processesByInstance.ContainsKey($instance)) {
                $processesByInstance[$instance] = [ordered]@{
                    instance = $instance
                    name = $baseName
                    pid = 0
                    parentPid = 0
                    cpuPercent = 0.0
                    rawCpuPercent = 0.0
                    privateBytes = 0
                    ioReadOperationsPerSecond = 0.0
                    ioWriteOperationsPerSecond = 0.0
                    threadCount = 0
                    handleCount = 0
                }
            }

            $process = $processesByInstance[$instance]
            switch ($counter) {
                'id process' {
                    $process.pid = [int64]$sample.CookedValue
                }
                'creating process id' {
                    $process.parentPid = [int64]$sample.CookedValue
                }
                '% processor time' {
                    $rawCpuPercent = [double]$sample.CookedValue
                    $process.rawCpuPercent = $rawCpuPercent
                    $process.cpuPercent = [Math]::Max(0.0, $rawCpuPercent / $logicalProcessorCount)
                }
                'private bytes' {
                    $process.privateBytes = [int64]$sample.CookedValue
                }
                'io read operations/sec' {
                    $process.ioReadOperationsPerSecond = [double]$sample.CookedValue
                }
                'io write operations/sec' {
                    $process.ioWriteOperationsPerSecond = [double]$sample.CookedValue
                }
                'thread count' {
                    $process.threadCount = [int64]$sample.CookedValue
                }
                'handle count' {
                    $process.handleCount = [int64]$sample.CookedValue
                }
            }
        }
    } catch {
        $sampleStatus = $_.Exception.Message
    }

    $sampledProcesses = @(
        $processesByInstance.Values |
            Where-Object {
                $_.pid -gt 0 -and $_.pid -ne $monitorNodeProcessId -and $_.pid -ne $monitorPowerShellProcessId
            } |
            ForEach-Object { [pscustomobject]$_ }
    )
    $sampleTimestamp = [DateTimeOffset]::UtcNow
    $actualIntervalMilliseconds = $null
    if ($previousSampleTimestamp -ne $null) {
        $actualIntervalMilliseconds = ($sampleTimestamp - $previousSampleTimestamp).TotalMilliseconds
    }
    $previousSampleTimestamp = $sampleTimestamp

    if ($sampleStatus -eq 'ok' -and ($systemCpuPercent -eq $null -or $sampledProcesses.Count -eq 0)) {
        $sampleStatus = 'partial:missing-targets'
    }

    [pscustomobject]@{
        timestamp = $sampleTimestamp.ToString('o')
        sampleIndex = $sampleIndex
        includeInSummary = $sampleIndex -ge $warmupSamples
        status = $sampleStatus
        counterSampleCount = $counterSampleCount
        actualIntervalMilliseconds = $actualIntervalMilliseconds
        systemCpuPercent = $systemCpuPercent
        processes = $sampledProcesses
    } | ConvertTo-Json -Compress -Depth 4

    $sampleIndex += 1

    $elapsedMilliseconds = ([DateTimeOffset]::UtcNow - $loopStartedAt).TotalMilliseconds
    $sleepMilliseconds = [Math]::Max(0, [int]($intervalMilliseconds - $elapsedMilliseconds))
    if ($sleepMilliseconds -gt 0) {
        Start-Sleep -Milliseconds $sleepMilliseconds
    }
}
