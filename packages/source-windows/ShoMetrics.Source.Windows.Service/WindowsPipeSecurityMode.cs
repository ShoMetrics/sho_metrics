namespace ShoMetrics.Source.Windows.Service;

internal enum WindowsPipeSecurityMode
{
    ProductionAcl,

    // Unsafe for production because it replaces the explicit service pipe ACL
    // with Kestrel's same-user restriction. It is selected only by the
    // integration test host for its same-user CI child process; do not use it
    // for production service entry points.
    UnsafeCurrentUserOnly,
}
