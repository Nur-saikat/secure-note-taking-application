using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Data;
using NotesApi.Domain;
using NotesApi.Dtos;

namespace NotesApi.Services;

public sealed class UserService(IMongoDbContext db)
{
    public async Task<UserResponse> CreateAsync(CreateUserRequest request, CancellationToken ct)
    {
        SecurityHelpers.ValidatePassword(request.Password);
        var now = DateTime.UtcNow;

        var user = new User
        {
            Username = SecurityHelpers.NormalizeUsername(request.Username),
            Email = SecurityHelpers.NormalizeEmail(request.Email),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, workFactor: 12),
            Role = request.Role,
            Interests = SecurityHelpers.NormalizeInterests(request.Interests),
            CreatedAt = now,
            UpdatedAt = now
        };

        await db.Users.InsertOneAsync(user, cancellationToken: ct);
        return user.ToResponse();
    }

    public async Task<PagedResponse<UserResponse>> ListAsync(int page, int pageSize, CancellationToken ct)
    {
        var (normalizedPage, normalizedPageSize, skip) = Paging.Normalize(page, pageSize);
        var filter = Builders<User>.Filter.Empty;

        var total = await db.Users.CountDocumentsAsync(filter, cancellationToken: ct);
        var users = await db.Users.Find(filter)
            .SortBy(u => u.Username)
            .Skip(skip)
            .Limit(normalizedPageSize)
            .ToListAsync(ct);

        return new PagedResponse<UserResponse>(
            users.Select(u => u.ToResponse()).ToList(),
            normalizedPage,
            normalizedPageSize,
            total,
            Paging.TotalPages(total, normalizedPageSize));
    }

    public async Task<UserResponse> GetByIdAsync(string id, CancellationToken ct)
    {
        SecurityHelpers.RequireValidId(id, "User");
        var user = await db.Users.Find(u => u.Id == id).FirstOrDefaultAsync(ct);
        if (user is null)
        {
            throw new ApiException(StatusCodes.Status404NotFound, "User not found.");
        }

        return user.ToResponse();
    }

    public async Task<UserResponse> UpdateAsync(string actingUserId, string id, UpdateUserRequest request, CancellationToken ct)
    {
        SecurityHelpers.RequireValidId(id, "User");

        if (id == actingUserId && request.Role != Roles.Admin)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "You cannot remove your own admin role.");
        }

        var user = await db.Users.Find(u => u.Id == id).FirstOrDefaultAsync(ct)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "User not found.");

        user.Username = SecurityHelpers.NormalizeUsername(request.Username);
        user.Email = SecurityHelpers.NormalizeEmail(request.Email);
        user.Role = request.Role;
        user.Interests = SecurityHelpers.NormalizeInterests(request.Interests);
        user.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            SecurityHelpers.ValidatePassword(request.NewPassword);
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, workFactor: 12);
        }

        var result = await db.Users.ReplaceOneAsync(u => u.Id == id, user, cancellationToken: ct);
        if (result.MatchedCount == 0)
        {
            throw new ApiException(StatusCodes.Status404NotFound, "User not found.");
        }

        return user.ToResponse();
    }

    public async Task DeleteAsync(string actingUserId, string id, CancellationToken ct)
    {
        SecurityHelpers.RequireValidId(id, "User");

        if (id == actingUserId)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "You cannot delete your own account.");
        }

        var result = await db.Users.DeleteOneAsync(u => u.Id == id, ct);
        if (result.DeletedCount == 0)
        {
            throw new ApiException(StatusCodes.Status404NotFound, "User not found.");
        }

        await db.Notes.DeleteManyAsync(n => n.UserId == id, ct);
        await db.Posts.DeleteManyAsync(p => p.UserId == id, ct);
    }
}
