using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

namespace ShoMetrics.Source.Windows.Service;

internal static class WindowsPipeSecurity
{
    /// <summary>
    /// Creates the named-pipe ACL for the privileged helper service.
    /// Built-in users get read/write so the normal-user Hub and Control Panel
    /// can read metrics and status; privileged mutation is intentionally not
    /// exposed through this data-plane pipe.
    /// </summary>
    public static PipeSecurity CreatePipeSecurity()
    {
        var pipeSecurity = new PipeSecurity();

        pipeSecurity.AddAccessRule(CreateAccessRule(WellKnownSidType.LocalSystemSid, PipeAccessRights.FullControl));
        pipeSecurity.AddAccessRule(CreateAccessRule(WellKnownSidType.BuiltinAdministratorsSid, PipeAccessRights.FullControl));
        pipeSecurity.AddAccessRule(CreateAccessRule(WellKnownSidType.BuiltinUsersSid, PipeAccessRights.ReadWrite));

        return pipeSecurity;
    }

    private static PipeAccessRule CreateAccessRule(WellKnownSidType sidType, PipeAccessRights rights)
    {
        var securityIdentifier = new SecurityIdentifier(sidType, domainSid: null);

        return new PipeAccessRule(securityIdentifier, rights, AccessControlType.Allow);
    }
}
