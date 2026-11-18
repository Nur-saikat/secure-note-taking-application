using MongoDB.Driver;
using NotesApi.Domain;

namespace NotesApi.Data;

/// <summary>
/// Explicit index definitions (the .NET equivalent of Mongoose's schema.index).
/// Every index below supports a concrete query path; reads by _id rely on MongoDB's
/// built-in _id index and therefore do not get an extra index.
/// </summary>
public static class MongoIndexes
{
    public static async Task EnsureAsync(IMongoDbContext db, ILogger logger)
    {
        // GET /api/auth/login (username lookup) and GET /api/users (admin list, sorted by username).
        await CreateAsync(db.Users, "users",
            Builders<User>.IndexKeys.Ascending(u => u.Username),
            new CreateIndexOptions { Name = "ux_users_username", Unique = true },
            logger);

        // Interests grouping aggregation (multikey index over the interests array).
        await CreateAsync(db.Users, "users",
            Builders<User>.IndexKeys.Ascending(u => u.Interests),
            new CreateIndexOptions { Name = "ix_users_interests" },
            logger);

        // GET /api/notes: a user's notes filtered by userId and sorted newest-first.
        await CreateAsync(db.Notes, "notes",
            Builders<Note>.IndexKeys.Ascending(n => n.UserId).Descending(n => n.CreatedAt),
            new CreateIndexOptions { Name = "ix_notes_userId_createdAt" },
            logger);

        // GET /api/admin/notes: all notes sorted newest-first.
        await CreateAsync(db.Notes, "notes",
            Builders<Note>.IndexKeys.Descending(n => n.CreatedAt),
            new CreateIndexOptions { Name = "ix_notes_createdAt" },
            logger);

        // $lookup posts by userId and per-user post lists sorted newest-first.
        await CreateAsync(db.Posts, "posts",
            Builders<Post>.IndexKeys.Ascending(p => p.UserId).Descending(p => p.CreatedAt),
            new CreateIndexOptions { Name = "ix_posts_userId_createdAt" },
            logger);

        // GET /api/posts: public feed sorted newest-first.
        await CreateAsync(db.Posts, "posts",
            Builders<Post>.IndexKeys.Descending(p => p.CreatedAt),
            new CreateIndexOptions { Name = "ix_posts_createdAt" },
            logger);
    }

    private static async Task CreateAsync<T>(
        IMongoCollection<T> collection,
        string collectionName,
        IndexKeysDefinition<T> keys,
        CreateIndexOptions options,
        ILogger logger)
    {
        var name = await collection.Indexes.CreateOneAsync(new CreateIndexModel<T>(keys, options));
        logger.LogInformation("Ensured index {IndexName} on {Collection}", name, collectionName);
    }
}
