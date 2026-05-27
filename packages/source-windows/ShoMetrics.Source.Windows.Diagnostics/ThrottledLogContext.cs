namespace ShoMetrics.Source.Windows.Diagnostics;

/// <summary>
/// Context supplied to lazy throttled log factories.
/// </summary>
/// <param name="SuppressedCount">
/// Number of same-key log attempts suppressed since the previous emitted log.
/// </param>
public readonly record struct ThrottledLogContext(int SuppressedCount);
