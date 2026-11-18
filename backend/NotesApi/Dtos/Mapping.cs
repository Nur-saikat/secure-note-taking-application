using NotesApi.Domain;

namespace NotesApi.Dtos;

public static class Mapping
{
    public static UserResponse ToResponse(this User user) => new(
        user.Id,
        user.Username,
        user.Email,
        user.Role,
        user.Interests,
        user.CreatedAt);

    public static NoteResponse ToResponse(this Note note) => new(
        note.Id,
        note.UserId,
        note.Title,
        note.Content,
        note.CreatedAt,
        note.UpdatedAt);

    public static PostResponse ToResponse(this Post post) => new(
        post.Id,
        post.UserId,
        post.Content,
        post.CreatedAt);
}
