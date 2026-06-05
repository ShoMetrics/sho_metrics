using System.Globalization;

namespace ShoMetrics.Source.Windows.ControlPanel;

// Sparkle appcasts expose versions as strings. This comparer intentionally
// supports only the version shapes we publish and test: numeric segments with
// optional v-prefix, SemVer-style prerelease identifiers, and build metadata.
// Do not extend it into a general package-version parser; use a library if
// update eligibility becomes more complex.
internal static class UpdateVersionComparer
{
    internal static int Compare(string left, string right)
    {
        if (!TryCompare(left, right, out int comparison))
        {
            throw new FormatException("One or both update versions are not valid.");
        }

        return comparison;
    }

    internal static bool TryCompare(string left, string right, out int comparison)
    {
        comparison = 0;
        if (!ParsedUpdateVersion.TryParse(left, out ParsedUpdateVersion? leftVersion) ||
            !ParsedUpdateVersion.TryParse(right, out ParsedUpdateVersion? rightVersion) ||
            leftVersion is null ||
            rightVersion is null)
        {
            return false;
        }

        int numericComparison = CompareNumericIdentifiers(leftVersion.NumericIdentifiers, rightVersion.NumericIdentifiers);
        if (numericComparison != 0)
        {
            comparison = numericComparison;
            return true;
        }

        if (leftVersion.PrereleaseIdentifiers.Count == 0 && rightVersion.PrereleaseIdentifiers.Count == 0)
        {
            return true;
        }

        if (leftVersion.PrereleaseIdentifiers.Count == 0)
        {
            comparison = 1;
            return true;
        }

        if (rightVersion.PrereleaseIdentifiers.Count == 0)
        {
            comparison = -1;
            return true;
        }

        comparison = ComparePrereleaseIdentifiers(leftVersion.PrereleaseIdentifiers, rightVersion.PrereleaseIdentifiers);
        return true;
    }

    private static int CompareNumericIdentifiers(IReadOnlyList<int> left, IReadOnlyList<int> right)
    {
        int maxLength = Math.Max(left.Count, right.Count);
        for (int index = 0; index < maxLength; index++)
        {
            int leftValue = index < left.Count ? left[index] : 0;
            int rightValue = index < right.Count ? right[index] : 0;
            int comparison = leftValue.CompareTo(rightValue);
            if (comparison != 0)
            {
                return comparison;
            }
        }

        return 0;
    }

    private static int ComparePrereleaseIdentifiers(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        int maxLength = Math.Max(left.Count, right.Count);
        for (int index = 0; index < maxLength; index++)
        {
            if (index >= left.Count)
            {
                return -1;
            }

            if (index >= right.Count)
            {
                return 1;
            }

            int comparison = ComparePrereleaseIdentifier(left[index], right[index]);
            if (comparison != 0)
            {
                return comparison;
            }
        }

        return 0;
    }

    private static int ComparePrereleaseIdentifier(string left, string right)
    {
        bool hasLeftNumber = int.TryParse(left, NumberStyles.None, CultureInfo.InvariantCulture, out int leftNumber);
        bool hasRightNumber = int.TryParse(right, NumberStyles.None, CultureInfo.InvariantCulture, out int rightNumber);

        if (hasLeftNumber && hasRightNumber)
        {
            return leftNumber.CompareTo(rightNumber);
        }

        if (hasLeftNumber)
        {
            return -1;
        }

        if (hasRightNumber)
        {
            return 1;
        }

        return string.Compare(left, right, StringComparison.OrdinalIgnoreCase);
    }

    private sealed record ParsedUpdateVersion
    {
        public required IReadOnlyList<int> NumericIdentifiers { get; init; }

        public required IReadOnlyList<string> PrereleaseIdentifiers { get; init; }

        internal static bool TryParse(string value, out ParsedUpdateVersion? version)
        {
            version = null;
            string coreVersion = value.Trim();
            if (coreVersion.StartsWith("v", StringComparison.OrdinalIgnoreCase))
            {
                coreVersion = coreVersion[1..];
            }

            if (coreVersion.Length == 0)
            {
                return false;
            }

            int metadataIndex = coreVersion.IndexOf('+', StringComparison.Ordinal);
            if (metadataIndex >= 0)
            {
                coreVersion = coreVersion[..metadataIndex];
            }

            string[] versionAndPrerelease = coreVersion.Split('-', 2, StringSplitOptions.TrimEntries);
            string[] numericIdentifierTexts = versionAndPrerelease[0]
                .Split('.', StringSplitOptions.TrimEntries);
            if (numericIdentifierTexts.Length == 0)
            {
                return false;
            }

            var numericIdentifiers = new int[numericIdentifierTexts.Length];
            for (int index = 0; index < numericIdentifierTexts.Length; index++)
            {
                if (!TryParseNumericIdentifier(numericIdentifierTexts[index], out numericIdentifiers[index]))
                {
                    return false;
                }
            }

            string[] prereleaseIdentifiers = versionAndPrerelease.Length > 1
                ? versionAndPrerelease[1].Split('.', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                : [];
            if (versionAndPrerelease.Length > 1 &&
                prereleaseIdentifiers.Length == 0)
            {
                return false;
            }

            version = new ParsedUpdateVersion
            {
                NumericIdentifiers = numericIdentifiers,
                PrereleaseIdentifiers = prereleaseIdentifiers,
            };
            return true;
        }

        private static bool TryParseNumericIdentifier(string value, out int numericValue)
        {
            numericValue = 0;
            return !string.IsNullOrWhiteSpace(value) &&
                int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out numericValue);
        }
    }
}
