namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class UpdatePhasedRolloutTests
{
    // packages/hub/src/runtime/helper-update/phased-rollout.test.ts asserts these
    // exact pairs. They are the only thing standing between us and a rollout that
    // reaches this panel but not the Property Inspector for the same user, so the
    // two files must be changed together or not at all. The last two SIDs hash to
    // a negative int32, which is what pins the sign-bit masking rather than the
    // byte order alone.
    [Theory]
    [InlineData("S-1-5-21-1111111111-2222222222-3333333333-1001", 1)]
    [InlineData("S-1-5-21-9876543210-1234567890-1122334455-500", 6)]
    [InlineData("S-1-5-18", 6)]
    [InlineData("S-1-5-21-0-0-0-1", 1)]
    public void ComputeGroupMatchesThePropertyInspectorAssignment(string userSecurityIdentifier, int expectedGroup)
    {
        Assert.Equal(expectedGroup, UpdatePhasedRollout.ComputeGroup(userSecurityIdentifier));
    }

    [Fact]
    public void ComputeGroupStaysInsideThePublishedGroupCount()
    {
        for (int index = 0; index < 200; index++)
        {
            int group = UpdatePhasedRollout.ComputeGroup($"S-1-5-21-0-0-0-{index}");

            Assert.InRange(group, 0, UpdatePhasedRollout.GroupCount - 1);
        }
    }
}
