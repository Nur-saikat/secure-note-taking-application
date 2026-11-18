using System.Text;

namespace NotesApi.Configuration;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 60;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Issuer))
        {
            throw new InvalidOperationException("Jwt:Issuer is required.");
        }

        if (string.IsNullOrWhiteSpace(Audience))
        {
            throw new InvalidOperationException("Jwt:Audience is required.");
        }

        if (string.IsNullOrWhiteSpace(Key))
        {
            throw new InvalidOperationException("Jwt:Key is required. Set Jwt__Key in the environment for non-development runs.");
        }

        if (Encoding.UTF8.GetByteCount(Key) < 32)
        {
            throw new InvalidOperationException("Jwt:Key must be at least 32 bytes for HS256.");
        }

        if (ExpiryMinutes is < 1 or > 24 * 60)
        {
            throw new InvalidOperationException("Jwt:ExpiryMinutes must be between 1 and 1440.");
        }
    }
}
