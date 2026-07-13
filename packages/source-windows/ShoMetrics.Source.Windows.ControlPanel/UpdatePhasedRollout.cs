using System.Security;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace ShoMetrics.Source.Windows.ControlPanel;

/// <summary>
/// Places the current user in one of Sparkle's phased-rollout groups.
/// </summary>
/// <remarks>
/// The plugin's Property Inspector runs this same assignment in
/// packages/hub/src/runtime/helper-update/phased-rollout.ts so a staged release
/// reaches both surfaces at once. A user who is offered an update in one place
/// and not the other reads it as a defect in whichever surface they trust less,
/// so the hash input, byte order, and group count are pinned by matching test
/// vectors on both sides.
/// </remarks>
internal static class UpdatePhasedRollout
{
    internal const int GroupCount = 7;

    /// <summary>
    /// Resolves the current user's rollout group, or null when Windows withholds the identity.
    /// </summary>
    internal static int? ResolveCurrentUserGroup()
    {
        string? userSid;
        try
        {
            userSid = WindowsIdentity.GetCurrent().User?.Value;
        }
        catch (Exception exception) when (
            exception is SecurityException ||
            exception is UnauthorizedAccessException ||
            exception is InvalidOperationException)
        {
            return null;
        }

        return string.IsNullOrWhiteSpace(userSid) ? null : ComputeGroup(userSid);
    }

    /// <summary>
    /// Computes the rollout group for one Windows user security identifier.
    /// </summary>
    internal static int ComputeGroup(string userSecurityIdentifier)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(userSecurityIdentifier));
        int hashPrefix = BitConverter.ToInt32(hash, startIndex: 0) & int.MaxValue;
        return hashPrefix % GroupCount;
    }
}
