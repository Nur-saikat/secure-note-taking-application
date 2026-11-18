using System.Security.Claims;
using System.Text;
using MongoDB.Bson;

namespace NotesApi.Common;

public static class SecurityHelpers
{
    public const string RoleClaim = "role";
    public const string UsernameClaim = "unique_name";

    public static string GetUserId(this ClaimsPrincipal principal)
    {
        var id = principal.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(id))
        {
            throw new ApiException(StatusCodes.Status401Unauthorized, "Authentication is required.");
        }

        return id;
    }

    public static string NormalizeUsername(string username) => username.Trim().ToLowerInvariant();

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static void RequireValidId(string id, string resourceName = "Resource")
    {
        if (!ObjectId.TryParse(id, out _))
        {
            throw new ApiException(StatusCodes.Status404NotFound, $"{resourceName} not found.");
        }
    }

    public static void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "Password must be at least 8 characters.");
        }

        if (Encoding.UTF8.GetByteCount(password) > 72)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "Password must not exceed 72 bytes (BCrypt limit).");
        }
    }

    public static List<string> NormalizeInterests(IEnumerable<string>? interests)
    {
        var input = (interests ?? Enumerable.Empty<string>()).ToList();
        if (input.Count > 20)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "A user can have at most 20 interests.");
        }

        var normalized = new List<string>();
        foreach (var interest in input)
        {
            var value = interest?.Trim().ToLowerInvariant() ?? string.Empty;
            if (value.Length == 0)
            {
                continue;
            }

            if (value.Length > 30)
            {
                throw new ApiException(StatusCodes.Status400BadRequest, "Each interest must be at most 30 characters.");
            }

            if (!normalized.Contains(value))
            {
                normalized.Add(value);
            }
        }

        return normalized;
    }
}
