using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Data;
using NotesApi.Domain;
using NotesApi.Dtos;

namespace NotesApi.Services;

public sealed class NoteService(IMongoDbContext db)
{
    public async Task<NoteResponse> CreateAsync(string userId, NoteRequest request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var note = new Note
        {
            UserId = userId,
            Title = request.Title.Trim(),
            Content = request.Content,
            CreatedAt = now,
            UpdatedAt = now
        };

        await db.Notes.InsertOneAsync(note, cancellationToken: ct);
        return note.ToResponse();
    }

    public async Task<PagedResponse<NoteResponse>> ListMineAsync(string userId, int page, int pageSize, CancellationToken ct)
    {
        var (normalizedPage, normalizedPageSize, skip) = Paging.Normalize(page, pageSize);
        var filter = Builders<Note>.Filter.Eq(n => n.UserId, userId);

        var total = await db.Notes.CountDocumentsAsync(filter, cancellationToken: ct);
        var notes = await db.Notes.Find(filter)
            .SortByDescending(n => n.CreatedAt)
            .Skip(skip)
            .Limit(normalizedPageSize)
            .ToListAsync(ct);

        return new PagedResponse<NoteResponse>(
            notes.Select(n => n.ToResponse()).ToList(),
            normalizedPage,
            normalizedPageSize,
            total,
            Paging.TotalPages(total, normalizedPageSize));
    }

    public async Task<NoteResponse> GetAsync(string userId, bool isAdmin, string id, CancellationToken ct)
    {
        SecurityHelpers.RequireValidId(id, "Note");
        var note = await db.Notes.Find(n => n.Id == id).FirstOrDefaultAsync(ct);

        if (note is null || (note.UserId != userId && !isAdmin))
        {
            throw new ApiException(StatusCodes.Status404NotFound, "Note not found.");
        }

        return note.ToResponse();
    }

    public async Task<NoteResponse> UpdateAsync(string userId, string id, NoteRequest request, CancellationToken ct)
    {
        SecurityHelpers.RequireValidId(id, "Note");
        var now = DateTime.UtcNow;

        var update = Builders<Note>.Update
            .Set(n => n.Title, request.Title.Trim())
            .Set(n => n.Content, request.Content)
            .Set(n => n.UpdatedAt, now);

        var result = await db.Notes.UpdateOneAsync(
            n => n.Id == id && n.UserId == userId, update, cancellationToken: ct);

        if (result.MatchedCount == 0)
        {
            throw new ApiException(StatusCodes.Status404NotFound, "Note not found.");
        }

        var note = await db.Notes.Find(n => n.Id == id).FirstOrDefaultAsync(ct)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "Note not found.");
        return note.ToResponse();
    }

    public async Task DeleteAsync(string userId, string id, CancellationToken ct)
    {
        SecurityHelpers.RequireValidId(id, "Note");
        var result = await db.Notes.DeleteOneAsync(n => n.Id == id && n.UserId == userId, ct);
        if (result.DeletedCount == 0)
        {
            throw new ApiException(StatusCodes.Status404NotFound, "Note not found.");
        }
    }

    public async Task<PagedResponse<AdminNoteResponse>> ListAllAsync(int page, int pageSize, CancellationToken ct)
    {
        var (normalizedPage, normalizedPageSize, skip) = Paging.Normalize(page, pageSize);
        var filter = Builders<Note>.Filter.Empty;

        var total = await db.Notes.CountDocumentsAsync(filter, cancellationToken: ct);
        var notes = await db.Notes.Find(filter)
            .SortByDescending(n => n.CreatedAt)
            .Skip(skip)
            .Limit(normalizedPageSize)
            .ToListAsync(ct);

        var ownerNames = await GetUsernamesAsync(notes.Select(n => n.UserId).Distinct().ToList(), ct);
        var items = notes.Select(n => new AdminNoteResponse(
            n.Id,
            n.UserId,
            ownerNames.GetValueOrDefault(n.UserId, "[deleted user]"),
            n.Title,
            n.Content,
            n.CreatedAt,
            n.UpdatedAt)).ToList();

        return new PagedResponse<AdminNoteResponse>(
            items,
            normalizedPage,
            normalizedPageSize,
            total,
            Paging.TotalPages(total, normalizedPageSize));
    }

    private async Task<Dictionary<string, string>> GetUsernamesAsync(List<string> userIds, CancellationToken ct)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<string, string>();
        }

        var users = await db.Users.Find(Builders<User>.Filter.In(u => u.Id, userIds)).ToListAsync(ct);
        return users.ToDictionary(u => u.Id, u => u.Username);
    }
}
