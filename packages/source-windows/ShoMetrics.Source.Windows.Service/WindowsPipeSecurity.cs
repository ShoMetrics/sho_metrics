using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

namespace ShoMetrics.Source.Windows.Service;

internal static class WindowsPipeSecurity
{
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
