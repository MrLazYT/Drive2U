using System.ComponentModel.DataAnnotations;

namespace Drive2U.Api.Mvp;

public sealed record Coordinate(double Latitude, double Longitude);
public sealed record Point(double Latitude, double Longitude, string Address, string? LocationId = null);
public sealed record Location(string Id, string Name, double Latitude, double Longitude);
public sealed record RouteData(decimal DistanceKm, double DurationSeconds, Coordinate[] Geometry, bool IsDemo, string Attribution);
public sealed record VehicleDto(string Make, string Model, string Plate);
public sealed record DriverProfileDto(bool Approved, bool Available, VehicleDto? Vehicle);
public sealed record UserDto(string Id, string Name, string Email, string Role, DriverProfileDto? DriverProfile);
public sealed record SessionDto(string AccessToken, DateTime ExpiresAt, UserDto User);
public sealed record QuoteDto(string Id, Point Pickup, Point Destination, RouteData Route, decimal Amount, string Currency, DateTime ExpiresAt);
public sealed record PersonDto(string Id, string Name);
public sealed record DriverDto(string Id, string Name, VehicleDto? Vehicle);
public sealed record CancellationDto(string By, string Reason, DateTime At);
public sealed record RideDto(string Id, string Status, int Version, Point Pickup, Point Destination, RouteData Route,
    decimal Amount, string Currency, DateTime CreatedAt, DateTime UpdatedAt, PersonDto? Passenger, DriverDto? Driver, CancellationDto? Cancellation);
public sealed record HistoryDto(RideDto[] Items, int Page, int PageSize, int Total);
public sealed record RegisterRequest([Required, StringLength(80, MinimumLength = 2)] string Name,
    [Required, EmailAddress, StringLength(254)] string Email, [Required, StringLength(128, MinimumLength = 10)] string Password);
public sealed record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
public sealed record QuoteRequest([Required] Point Pickup, [Required] Point Destination, [Required] string RoutingMode);
public sealed record CreateRideRequest([Required] string QuoteId, [Required, StringLength(100, MinimumLength = 8)] string IdempotencyKey);
public sealed record AvailabilityRequest(bool Available);
public sealed record StatusRequest([Required] string Status);
public sealed record CancelRequest([StringLength(300)] string? Reason);

public sealed class ApiError(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
