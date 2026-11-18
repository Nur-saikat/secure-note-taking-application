using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Configuration;
using NotesApi.Domain;

namespace NotesApi.Data;

public static class DbSeeder
{
    public static async Task SeedAdminAsync(IMongoDbContext db, SeedAdminOptions options, ILogger logger)
    {
        if (string.IsNullOrWhiteSpace(options.Username) || string.IsNullOrWhiteSpace(options.Password))
        {
            logger.LogWarning("SeedAdmin credentials are not configured; skipping admin seed.");
            return;
        }

        SecurityHelpers.ValidatePassword(options.Password);
        var username = SecurityHelpers.NormalizeUsername(options.Username);

        var exists = await db.Users.Find(u => u.Username == username).AnyAsync();
        if (exists)
        {
            return;
        }

        var now = DateTime.UtcNow;
        var admin = new User
        {
            Username = username,
            Email = SecurityHelpers.NormalizeEmail(options.Email),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(options.Password, workFactor: 12),
            Role = Roles.Admin,
            Interests = SecurityHelpers.NormalizeInterests(options.Interests),
            CreatedAt = now,
            UpdatedAt = now
        };

        await db.Users.InsertOneAsync(admin);
        logger.LogInformation("Seeded initial admin user {Username}", username);
    }
}
