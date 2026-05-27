namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceMethodRateLimiter(TimeProvider timeProvider)
{
    private readonly TokenBucket _listMetricDescriptors = new(timeProvider, tokensPerSecond: 5, burstSize: 3);
    private readonly TokenBucket _readMetricSnapshot = new(timeProvider, tokensPerSecond: 50, burstSize: 20);
    private readonly TokenBucket _setMetricRefreshDemand = new(timeProvider, tokensPerSecond: 4, burstSize: 2);

    public bool TryAcquire(string methodName)
    {
        return methodName switch
        {
            nameof(WindowsGrpcMetricSourceService.ListMetricDescriptors) => _listMetricDescriptors.TryAcquire(),
            nameof(WindowsGrpcMetricSourceService.ReadMetricSnapshot) => _readMetricSnapshot.TryAcquire(),
            nameof(WindowsGrpcMetricSourceService.SetMetricRefreshDemand) => _setMetricRefreshDemand.TryAcquire(),
            // GetSourceHealth and future methods stay unthrottled until their
            // service-boundary policy is explicitly defined.
            _ => true,
        };
    }

    private sealed class TokenBucket
    {
        private readonly TimeProvider _timeProvider;
        private readonly double _tokensPerSecond;
        private readonly int _burstSize;
        private readonly Lock _gate = new();
        private double _availableTokens;
        private long _lastRefillTimestamp;

        public TokenBucket(TimeProvider timeProvider, double tokensPerSecond, int burstSize)
        {
            _timeProvider = timeProvider;
            _tokensPerSecond = tokensPerSecond;
            _burstSize = burstSize;
            _availableTokens = burstSize;
            _lastRefillTimestamp = timeProvider.GetTimestamp();
        }

        public bool TryAcquire()
        {
            lock (_gate)
            {
                Refill();

                if (_availableTokens < 1)
                {
                    return false;
                }

                _availableTokens -= 1;
                return true;
            }
        }

        private void Refill()
        {
            long currentTimestamp = _timeProvider.GetTimestamp();
            TimeSpan elapsed = _timeProvider.GetElapsedTime(_lastRefillTimestamp, currentTimestamp);
            _lastRefillTimestamp = currentTimestamp;

            if (elapsed <= TimeSpan.Zero)
            {
                return;
            }

            _availableTokens = Math.Min(
                _burstSize,
                _availableTokens + (elapsed.TotalSeconds * _tokensPerSecond));
        }
    }
}
