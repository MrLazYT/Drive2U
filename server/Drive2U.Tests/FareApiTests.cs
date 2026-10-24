using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Drive2U.Tests;

public sealed class FareApiFactory(IReadOnlyDictionary<string, string?>? tariff = null) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            // Clear every inherited source: tests cannot use ambient/server tariff values.
            configuration.Sources.Clear();
            configuration.AddInMemoryCollection(tariff ?? new Dictionary<string, string?>
            {
                ["FareTariff:BaseFare"] = "40",
                ["FareTariff:RatePerKm"] = "12"
            });
        });
    }
}

public sealed class FareApiTests
{
    private const string Endpoint = "/api/fare-estimates";

    [Fact]
    public async Task HealthIsAvailable()
    {
        await using var factory = new FareApiFactory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("ok", json.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ReturnsOnlyEstimateFieldsFromServerTariff()
    {
        await using var factory = new FareApiFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsync(Endpoint, Json("""{"distanceKm":2.5}"""), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var root = json.RootElement;
        Assert.Equal(3, root.EnumerateObject().Count());
        Assert.Equal(2.5m, root.GetProperty("distanceKm").GetDecimal());
        Assert.Equal(70m, root.GetProperty("amount").GetDecimal());
        Assert.Equal("UAH", root.GetProperty("currency").GetString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("""{"distanceKm":null}""")]
    [InlineData("""{"distanceKm":"2.5"}""")]
    [InlineData("""{"distanceKm":"invalid"}""")]
    [InlineData("""{"distanceKm":true}""")]
    [InlineData("""{"distanceKm":0}""")]
    [InlineData("""{"distanceKm":-1}""")]
    [InlineData("""{"distanceKm":""")]
    [InlineData("""{"distanceKm":1e100}""")]
    [InlineData("""{"distanceKm":79228162514264337593543950335}""")]
    public async Task InvalidRequestsReturnSafeProblemDetails(string body)
    {
        await using var factory = new FareApiFactory();
        using var client = factory.CreateClient();
        await AssertProblem(await client.PostAsync(Endpoint, Json(body), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task MissingBodyReturnsProblemDetails()
    {
        await using var factory = new FareApiFactory();
        using var client = factory.CreateClient();
        await AssertProblem(await client.PostAsync(Endpoint, null, TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("baseFare", "0")]
    [InlineData("ratePerKm", "0")]
    [InlineData("currency", "\"USD\"")]
    [InlineData("amount", "0")]
    public async Task RequestCannotOverrideServerTariff(string field, string value)
    {
        await using var factory = new FareApiFactory();
        using var client = factory.CreateClient();
        await AssertProblem(await client.PostAsync(Endpoint, Json($"{{\"distanceKm\":2.5,\"{field}\":{value}}}"), TestContext.Current.CancellationToken));
        var response = await client.PostAsync(Endpoint, Json("""{"distanceKm":2.5}"""), TestContext.Current.CancellationToken);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(70m, json.RootElement.GetProperty("amount").GetDecimal());
        Assert.Equal("UAH", json.RootElement.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task AdditionOverflowReturnsSafeProblemDetails()
    {
        await using var factory = new FareApiFactory(new Dictionary<string, string?>
        {
            ["FareTariff:BaseFare"] = decimal.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["FareTariff:RatePerKm"] = "1"
        });
        using var client = factory.CreateClient();
        await AssertProblem(await client.PostAsync(Endpoint, Json("""{"distanceKm":1}"""), TestContext.Current.CancellationToken));
    }

    public static TheoryData<string?, string?> InvalidTariffs => new()
    {
        { null, null }, { null, "12" }, { "40", null },
        { "-1", "12" }, { "40", "-1" }, { "invalid", "12" }, { "40", "invalid" }
    };

    [Theory]
    [MemberData(nameof(InvalidTariffs))]
    public void InvalidTariffPreventsHostStartup(string? baseFare, string? rate)
    {
        var configuration = new Dictionary<string, string?>();
        if (baseFare is not null) configuration["FareTariff:BaseFare"] = baseFare;
        if (rate is not null) configuration["FareTariff:RatePerKm"] = rate;
        using var factory = new FareApiFactory(configuration);
        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        if (baseFare == "invalid" || rate == "invalid")
        {
            Assert.IsType<InvalidOperationException>(error);
            Assert.Contains("FareTariff", error.Message);
        }
        else
        {
            Assert.IsType<OptionsValidationException>(error);
            Assert.Contains("FareTariff requires", error.Message);
        }
    }

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static async Task AssertProblem(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var text = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        using var json = JsonDocument.Parse(text);
        Assert.Equal(400, json.RootElement.GetProperty("status").GetInt32());
        Assert.True(json.RootElement.TryGetProperty("title", out _));
        Assert.DoesNotContain("Exception", text);
        Assert.DoesNotContain("StackTrace", text);
        Assert.DoesNotContain("System.", text);
    }
}
