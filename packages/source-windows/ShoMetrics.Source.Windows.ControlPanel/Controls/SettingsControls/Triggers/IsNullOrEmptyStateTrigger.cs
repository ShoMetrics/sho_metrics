// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using System.Collections;

namespace ShoMetrics.Source.Windows.ControlPanel.Controls;

/// <summary>
/// Enables a state if an Object is <c>null</c> or a String/IEnumerable is empty
/// </summary>
public class IsNullOrEmptyStateTrigger : StateTriggerBase
{
    /// <summary>
    /// Gets or sets the value used to check for <c>null</c> or empty.
    /// </summary>
    public object Value
    {
        get { return GetValue(ValueProperty); }
        set { SetValue(ValueProperty, value); }
    }

    /// <summary>
    /// Identifies the <see cref="Value"/> DependencyProperty
    /// </summary>
    public static readonly DependencyProperty ValueProperty =
        DependencyProperty.Register(nameof(Value), typeof(object), typeof(IsNullOrEmptyStateTrigger), new PropertyMetadata(null, OnValuePropertyChanged));

    /// <summary>
    /// Creates a new instance of <see cref="IsNullOrEmptyStateTrigger"/>.
    /// </summary>
    public IsNullOrEmptyStateTrigger()
    {
        UpdateTrigger();
    }

    private void UpdateTrigger()
    {
        var val = Value;

        SetActive(IsNullOrEmpty(val));

        if (val == null)
        {
            return;
        }

        // ShoMetrics only uses this trigger for template-bound values that are
        // replaced wholesale. We intentionally omit CommunityToolkit's weak
        // collection listeners to avoid vendoring unrelated helper code.
    }

    private static void OnValuePropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var obj = (IsNullOrEmptyStateTrigger)d;
        obj.UpdateTrigger();
    }

    private static bool IsNullOrEmpty(object val)
    {
        if (val == null)
        {
            return true;
        }

        // Object is not null, check for an empty string
        var valString = val as string;
        if (valString != null)
        {
            return valString.Length == 0;
        }

        // Object is not a string, check for an empty ICollection (faster)
        var valCollection = val as ICollection;
        if (valCollection != null)
        {
            return valCollection.Count == 0;
        }

        // Object is not an ICollection, check for an empty IEnumerable
        if (val is IEnumerable valEnumerable
// Workaround to regression introduced in https://github.com/unoplatform/uno/pull/16834
// Track https://github.com/unoplatform/uno/issues/17311 for cleanup
#if HAS_UNO
            && val is not FrameworkElement
#endif
            )
        {
            foreach (var item in valEnumerable)
            {
                // Found an item, not empty
                return false;
            }

            return true;
        }

        // Not null and not a known type to test for emptiness
        return false;
    }
}
