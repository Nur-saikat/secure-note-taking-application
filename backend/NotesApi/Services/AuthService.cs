using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Data;
using NotesApi.Domain;
using NotesApi.Dtos;

namespace NotesApi.Services;

public sealed class AuthService(IMongoDbContext db, TokenService tokens)
{
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        SecurityHelpers.ValidatePassword(request.Password);

        var now = DateTime.UtcNow;
        var user = new User
        {
            Username = SecurityHelpers.NormalizeUsername(request.Username),
            Email = SecurityHelpers.NormalizeEmail(request.Email),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, workFactor: 12),
            Role = Roles.User,
            Interests = SecurityHelpers.NormalizeInterests(request.Interests),
            CreatedAt = now,
            UpdatedAt = now
        };

        await db.Users.InsertOneAsync(user, cancellationToken: ct);
        return Issue(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var username = SecurityHelpers.NormalizeUsername(request.Username);
        var user = await db.Users.Find(u => u.Username == username).FirstOrDefaultAsync(ct);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            throw new ApiException(StatusCodes.Status401Unauthorized, "Invalid username or password.");
        }

        return Issue(user);
    }

    public async Task<UserResponse> GetMeAsync(string userId, CancellationToken ct)
    {
        var user = await db.Users.Find(u => u.Id == userId).FirstOrDefaultAsync(ct);
        if (user is null)
        {
            throw new ApiException(StatusCodes.Status404NotFound, "User not found.");
        }

        return user.ToResponse();
    }

    private AuthResponse Issue(User user)
    {
        var (token, expires) = tokens.Create(user);
        return new AuthResponse(token, expires, user.ToResponse());
    }
}
