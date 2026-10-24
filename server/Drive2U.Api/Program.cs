using System.Text.Json.Serialization;
using Drive2U.Api;
using Drive2U.Fares;
using Microsoft.Extensions.Options;

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
        var errors = new Dictionary<string, string[]>
        {
            ["distanceKm"] = ["Provide a JSON object containing only a numeric distanceKm greater than zero and within the supported range."]
        };
        return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(
            new Microsoft.AspNetCore.Mvc.ValidationProblemDetails(errors) { Status = 400, Title = "Invalid fare estimate request." });
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
var app = builder.Build();
app.UseExceptionHandler();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();
app.Run();

public partial class Program { }
