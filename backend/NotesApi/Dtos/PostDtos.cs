using System.ComponentModel.DataAnnotations;

namespace NotesApi.Dtos;

public sealed class CreatePostRequest
{
    [Required, StringLength(2000, MinimumLength = 1)]
    public string Content { get; set; } = string.Empty;
}

public sealed record PostResponse(
    string Id,
    string UserId,
    string Content,
    DateTime CreatedAt);

public sealed record PostFeedItem(
    string Id,
    string UserId,
    string AuthorUsername,
    string Content,
    DateTime CreatedAt);

public sealed record UserPostsResponse(
    string UserId,
    string Username,
    IReadOnlyList<PostResponse> Items,
    int Page,
    int PageSize,
    long Total,
    int TotalPages);
