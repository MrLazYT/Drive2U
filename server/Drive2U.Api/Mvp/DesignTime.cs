using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Drive2U.Api.Mvp;

// EF tooling creates only a model here. It never starts the API or seeds accounts.
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite("Data Source=design-only.sqlite")
            .Options;
        return new AppDbContext(options);
    }
}
