using System.ComponentModel.DataAnnotations;

namespace NotesApi.Dtos;

public sealed record UserResponse(
    string Id,
    string Username,
    string Email,
    string Role,
    IReadOnlyList<string> Interests,
    DateTime CreatedAt);

public sealed class CreateUserRequest
{
    [Required, StringLength(30, MinimumLength = 3), RegularExpression("^[A-Za-z0-9_.-]+$",
        ErrorMessage = "Username may only contain letters, numbers, dot, underscore or hyphen.")]
    public string Username { get; set; } = string.Empty;

    [Required, EmailAddress, StringLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required, StringLength(72, MinimumLength = 8)]
    public string Password { get; set; } = string.Empty;

    [Required, RegularExpression("^(User|Admin)$")]
    public string Role { get; set; } = "User";

    public List<string>? Interests { get; set; }
}

public sealed class UpdateUserRequest
{
    [Required, StringLength(30, MinimumLength = 3), RegularExpression("^[A-Za-z0-9_.-]+$",
        ErrorMessage = "Username may only contain letters, numbers, dot, underscore or hyphen.")]
    public string Username { get; set; } = string.Empty;

    [Required, EmailAddress, StringLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required, RegularExpression("^(User|Admin)$")]
    public string Role { get; set; } = "User";

    public List<string>? Interests { get; set; }

    [StringLength(72, MinimumLength = 8)]
    public string? NewPassword { get; set; }
}
