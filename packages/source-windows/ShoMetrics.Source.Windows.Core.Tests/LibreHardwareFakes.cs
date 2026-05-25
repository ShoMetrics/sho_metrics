using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core.Tests;

internal sealed class FakeHardware : IHardware
{
    private FakeHardware(HardwareType hardwareType, string identifier)
    {
        HardwareType = hardwareType;
        Identifier = new Identifier(identifier);
    }

    public static FakeHardware Cpu()
    {
        return new FakeHardware(HardwareType.Cpu, "cpu/0");
    }

    public static FakeHardware Gpu()
    {
        return new FakeHardware(HardwareType.GpuNvidia, "gpu/0");
    }

    public HardwareType HardwareType { get; }

    public Identifier Identifier { get; }

    public string Name { get; set; } = "Fake Hardware";

    public IHardware? Parent => null;

    public ISensor[] Sensors { get; set; } = [];

    public IHardware[] SubHardware { get; set; } = [];

    public IDictionary<string, string> Properties => new Dictionary<string, string>();

    public event SensorEventHandler? SensorAdded
    {
        add { }
        remove { }
    }

    public event SensorEventHandler? SensorRemoved
    {
        add { }
        remove { }
    }

    public void Accept(IVisitor visitor)
    {
        visitor.VisitHardware(this);
    }

    public void Traverse(IVisitor visitor)
    {
    }

    public string GetReport()
    {
        return string.Empty;
    }

    public void Update()
    {
    }
}

internal sealed class FakeSensor : ISensor
{
    private readonly IHardware _hardware;

    private FakeSensor(SensorType sensorType, string name, float? value)
    {
        SensorType = sensorType;
        Name = name;
        Value = value;
        _hardware = FakeHardware.Cpu();
        Identifier = new Identifier("cpu", "0", sensorType.ToString().ToLowerInvariant(), "0");
    }

    public static FakeSensor Temperature(string name, float? value)
    {
        return new FakeSensor(SensorType.Temperature, name, value);
    }

    public static FakeSensor Power(string name, float? value)
    {
        return new FakeSensor(SensorType.Power, name, value);
    }

    public IHardware Hardware => _hardware;

    public IControl? Control => null;

    public int Index => 0;

    public Identifier Identifier { get; }

    public bool IsDefaultHidden => false;

    public float? Max { get; set; }

    public float? Min { get; set; }

    public string Name { get; set; }

    public SensorType SensorType { get; }

    public float? Value { get; set; }

    public IEnumerable<SensorValue> Values => [];

    public IReadOnlyList<IParameter> Parameters => [];

    public TimeSpan ValuesTimeWindow { get; set; } = TimeSpan.Zero;

    public void Accept(IVisitor visitor)
    {
        visitor.VisitSensor(this);
    }

    public void Traverse(IVisitor visitor)
    {
    }

    public void ResetMin()
    {
        Min = Value;
    }

    public void ResetMax()
    {
        Max = Value;
    }

    public void ClearValues()
    {
    }
}
