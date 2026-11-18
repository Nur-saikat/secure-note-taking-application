using System.ComponentModel.DataAnnotations;

namespace NotesApi.Dtos;

public sealed class NoteRequest
{
    [Required, StringLength(200, MinimumLength = 1)]
    public string Title { get; set; } = string.Empty;

    [Required, StringLength(10000, MinimumLength = 1)]
    public string Content { get; set; } = string.Empty;
}

public sealed record NoteResponse(
    string Id,
    string UserId,
    string Title,
    string Content,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record AdminNoteResponse(
    string Id,
    string UserId,
    string OwnerUsername,
    string Title,
    string Content,
    DateTime CreatedAt,
    DateTime UpdatedAt);
