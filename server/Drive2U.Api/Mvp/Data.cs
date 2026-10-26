using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Drive2U.Api.Mvp;

public sealed class AppUser : IdentityUser
{
    public string Name { get; set; } = "";
    public string AppRole { get; set; } = "Passenger";
}
public sealed class DriverProfile
{
    public string UserId { get; set; } = "";
    public bool Approved { get; set; }
    public bool Available { get; set; }
    public string? Make { get; set; }
    public string? Model { get; set; }
    public string? Plate { get; set; }
    public bool Complete => !string.IsNullOrWhiteSpace(Make) && !string.IsNullOrWhiteSpace(Model) && !string.IsNullOrWhiteSpace(Plate);
}
public sealed class LoginSession
{
    public string Hash { get; set; } = "";
    public string UserId { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public bool Revoked { get; set; }
}
public sealed class TariffVersion
{
    public int Id { get; set; }
    public decimal BaseFare { get; set; }
    public decimal RatePerKm { get; set; }
    public DateTime EffectiveAt { get; set; }
}
public sealed class FareQuote
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string PassengerId { get; set; } = "";
    public string PickupJson { get; set; } = "";
    public string DestinationJson { get; set; } = "";
    public string RouteJson { get; set; } = "";
    public decimal Amount { get; set; }
    public decimal BaseFare { get; set; }
    public decimal RatePerKm { get; set; }
    public int TariffId { get; set; }
    public DateTime ExpiresAt { get; set; }
}
public sealed class Ride
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string QuoteId { get; set; } = "";
    public string IdempotencyKey { get; set; } = "";
    public string PassengerId { get; set; } = "";
    public string? DriverId { get; set; }
    public string? ActivePassengerId { get; set; }
    public string? ActiveDriverId { get; set; }
    public string Status { get; set; } = "Waiting";
    public int Version { get; set; } = 1;
    public string PickupJson { get; set; } = "";
    public string DestinationJson { get; set; } = "";
    public string RouteJson { get; set; } = "";
    public decimal Amount { get; set; }
    public decimal BaseFare { get; set; }
    public decimal RatePerKm { get; set; }
    public int TariffId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? CancelledBy { get; set; }
    public string? CancellationReason { get; set; }
    public DateTime? CancelledAt { get; set; }
}
public sealed class RideStatusHistory
{
    public long Id { get; set; }
    public string RideId { get; set; } = "";
    public string ActorId { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime At { get; set; }
    public int Version { get; set; }
}

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<DriverProfile> DriverProfiles => Set<DriverProfile>();
    public DbSet<LoginSession> Sessions => Set<LoginSession>();
    public DbSet<TariffVersion> Tariffs => Set<TariffVersion>();
    public DbSet<FareQuote> Quotes => Set<FareQuote>();
    public DbSet<Ride> Rides => Set<Ride>();
    public DbSet<RideStatusHistory> RideHistory => Set<RideStatusHistory>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<DriverProfile>().HasKey(x => x.UserId);
        b.Entity<DriverProfile>().Ignore(x => x.Complete);
        b.Entity<DriverProfile>().HasOne<AppUser>().WithOne().HasForeignKey<DriverProfile>(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<LoginSession>().HasKey(x => x.Hash);
        b.Entity<LoginSession>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<FareQuote>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.PassengerId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Ride>().HasIndex(x => x.ActivePassengerId).IsUnique().HasFilter("ActivePassengerId IS NOT NULL");
        b.Entity<Ride>().HasIndex(x => x.ActiveDriverId).IsUnique().HasFilter("ActiveDriverId IS NOT NULL");
        b.Entity<Ride>().HasIndex(x => new { x.PassengerId, x.IdempotencyKey }).IsUnique();
        b.Entity<Ride>().HasIndex(x => x.QuoteId).IsUnique();
        b.Entity<Ride>().Property(x => x.Version).IsConcurrencyToken();
        b.Entity<Ride>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.PassengerId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Ride>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.DriverId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Ride>().HasOne<FareQuote>().WithOne().HasForeignKey<Ride>(x => x.QuoteId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RideStatusHistory>().HasOne<Ride>().WithMany().HasForeignKey(x => x.RideId).OnDelete(DeleteBehavior.Cascade);
    }
}
