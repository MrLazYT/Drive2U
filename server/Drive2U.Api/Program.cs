using System.Text.Json.Serialization;
using Drive2U.Api;
using Drive2U.Fares;
using Microsoft.Extensions.Options;
using Drive2U.Api.Mvp;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.NumberHandling = JsonNumberHandling.Strict;
    options.JsonSerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
});
builder.Services.AddProblemDetails();
builder.Services.Configure<Microsoft.AspNetCore.Mvc.ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        // Stable validation messages also cover malformed JSON without exposing parser details.
        var fareEstimate = context.HttpContext.Request.Path.Equals("/api/fare-estimates", StringComparison.OrdinalIgnoreCase);
        var errors = fareEstimate
            ? new Dictionary<string, string[]> { ["distanceKm"] = ["Provide a JSON object containing only a numeric distanceKm greater than zero and within the supported range."] }
            : new Dictionary<string, string[]> { ["request"] = ["The request body is invalid. Check required fields and formats."] };
        return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(
            new Microsoft.AspNetCore.Mvc.ValidationProblemDetails(errors) { Status = 400, Title = fareEstimate ? "Invalid fare estimate request." : "Invalid request." });
    };
});
builder.Services.AddOptions<FareTariffOptions>()
    .Bind(builder.Configuration.GetSection("FareTariff"))
    .Validate(options => options.BaseFare is >= 0 && options.RatePerKm is >= 0,
        "FareTariff requires non-negative BaseFare and RatePerKm.")
    .ValidateOnStart();
builder.Services.AddSingleton(serviceProvider =>
{
    var options = serviceProvider.GetRequiredService<IOptions<FareTariffOptions>>().Value;
    return new FareTariff(options.BaseFare!.Value, options.RatePerKm!.Value);
});
builder.Services.AddSingleton<FareCalculator>();
builder.AddMvp();
var app = builder.Build();
app.UseExceptionHandler();
await app.InitializeMvp();
app.UseMvp();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();
app.Run();

public partial class Program { }
