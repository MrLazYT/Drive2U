using Drive2U.Fares;

namespace Drive2U.Tests;

public sealed class FareCalculatorTests
{
    [Fact]
    public void CalculatesUsingExplicitTariff()
    {
        var result = new FareCalculator(new FareTariff(40m, 12m)).Calculate(2.5m);
        Assert.Equal(new FareEstimate(2.5m, 70m, "UAH"), result);
    }

    [Fact]
    public void RoundsMidpointAwayFromZero() =>
        Assert.Equal(1.01m, new FareCalculator(new FareTariff(0m, 1m)).Calculate(1.005m).Amount);

    [Fact]
    public void RoundsOnlyFinalSum() =>
        Assert.Equal(0.01m, new FareCalculator(new FareTariff(0.004m, 0.004m)).Calculate(1m).Amount);

    [Fact]
    public void AllowsZeroTariff() =>
        Assert.Equal(0m, new FareCalculator(new FareTariff(0m, 0m)).Calculate(2m).Amount);

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void RejectsNonpositiveDistance(int distance) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => new FareCalculator(new FareTariff(40m, 12m)).Calculate(distance));

    [Theory]
    [InlineData(-1, 12)]
    [InlineData(40, -1)]
    public void RejectsNegativeTariff(int baseFare, int rate) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => new FareTariff(baseFare, rate));

    [Fact]
    public void MultiplicationOverflowIsExplicit() =>
        Assert.Throws<OverflowException>(() => new FareCalculator(new FareTariff(0m, 2m)).Calculate(decimal.MaxValue));

    [Fact]
    public void AdditionOverflowIsExplicit() =>
        Assert.Throws<OverflowException>(() => new FareCalculator(new FareTariff(decimal.MaxValue, 1m)).Calculate(1m));
}
