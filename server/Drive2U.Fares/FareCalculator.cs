namespace Drive2U.Fares;

public sealed record FareEstimate(decimal DistanceKm, decimal Amount, string Currency);

public sealed class FareCalculator(FareTariff tariff)
{
    public FareEstimate Calculate(decimal distanceKm)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(distanceKm);
        var amount = checked(tariff.BaseFare + distanceKm * tariff.RatePerKm);
        return new FareEstimate(distanceKm, decimal.Round(amount, 2, MidpointRounding.AwayFromZero), "UAH");
    }
}
