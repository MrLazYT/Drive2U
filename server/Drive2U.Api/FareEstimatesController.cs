using System.ComponentModel.DataAnnotations;
using Drive2U.Fares;
using Microsoft.AspNetCore.Mvc;

namespace Drive2U.Api;

public sealed class FareEstimateRequest
{
    [Required]
    public decimal? DistanceKm { get; init; }
}

[ApiController]
[Route("api/fare-estimates")]
public sealed class FareEstimatesController(FareCalculator calculator) : ControllerBase
{
    [HttpPost]
    public ActionResult<FareEstimate> Estimate(
        [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] FareEstimateRequest? request)
    {
        if (request?.DistanceKm is not > 0)
            return InvalidDistance();
        try
        {
            return Ok(calculator.Calculate(request.DistanceKm.Value));
        }
        catch (OverflowException)
        {
            return InvalidDistance();
        }
    }

    private ActionResult InvalidDistance() => new BadRequestObjectResult(
        new ValidationProblemDetails(new Dictionary<string, string[]>
        {
            ["distanceKm"] = ["Distance must be greater than zero and produce a representable fare."]
        }) { Status = 400, Title = "Invalid fare estimate request." });
}
