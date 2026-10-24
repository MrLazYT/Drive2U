namespace Drive2U.Fares;

public sealed record FareTariff
{
    public decimal BaseFare { get; }
    public decimal RatePerKm { get; }

    public FareTariff(decimal baseFare, decimal ratePerKm)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(baseFare);
        ArgumentOutOfRangeException.ThrowIfNegative(ratePerKm);
        BaseFare = baseFare;
        RatePerKm = ratePerKm;
    }
}
