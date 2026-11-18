using MongoDB.Bson;
using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Data;
using NotesApi.Domain;
using NotesApi.Dtos;

namespace NotesApi.Services;

public sealed class PostService(IMongoDbContext db)
{
    public async Task<PostResponse> CreateAsync(string userId, CreatePostRequest request, CancellationToken ct)
    {
        var post = new Post
        {
            UserId = userId,
            Content = request.Content.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        await db.Posts.InsertOneAsync(post, cancellationToken: ct);
        return post.ToResponse();
    }

    public async Task<PagedResponse<PostFeedItem>> GetFeedAsync(int page, int pageSize, CancellationToken ct)
    {
        var (normalizedPage, normalizedPageSize, skip) = Paging.Normalize(page, pageSize);
        var filter = Builders<Post>.Filter.Empty;

        var total = await db.Posts.CountDocumentsAsync(filter, cancellationToken: ct);
        var posts = await db.Posts.Find(filter)
            .SortByDescending(p => p.CreatedAt)
            .Skip(skip)
            .Limit(normalizedPageSize)
            .ToListAsync(ct);

        var authorNames = await GetUsernamesAsync(posts.Select(p => p.UserId).Distinct().ToList(), ct);
        var items = posts.Select(p => new PostFeedItem(
            p.Id,
            p.UserId,
            authorNames.GetValueOrDefault(p.UserId, "[deleted user]"),
            p.Content,
            p.CreatedAt)).ToList();

        return new PagedResponse<PostFeedItem>(
            items,
            normalizedPage,
            normalizedPageSize,
            total,
            Paging.TotalPages(total, normalizedPageSize));
    }

    /// <summary>
    /// Scenario 2: all posts for one user, resolved through a single aggregation pipeline
    /// that starts at the user document and uses $lookup against posts.
    /// </summary>
    public async Task<UserPostsResponse> GetUserPostsAsync(string userId, int page, int pageSize, CancellationToken ct)
    {
        var (normalizedPage, normalizedPageSize, skip) = Paging.Normalize(page, pageSize);
        SecurityHelpers.RequireValidId(userId, "User");

        var matchUser = new BsonDocument("$match", new BsonDocument("_id", ObjectId.Parse(userId)));

        var pipeline = new BsonDocument[]
        {
            matchUser,
            new("$lookup", new BsonDocument
            {
                { "from", "posts" },
                { "let", new BsonDocument("uid", "$_id") },
                { "pipeline", new BsonArray
                    {
                        new BsonDocument("$match", new BsonDocument("$expr",
                            new BsonDocument("$eq", new BsonArray { "$userId", "$$uid" }))),
                        new BsonDocument("$sort", new BsonDocument("createdAt", -1)),
                        new BsonDocument("$skip", skip),
                        new BsonDocument("$limit", normalizedPageSize)
                    }
                },
                { "as", "items" }
            }),
            new("$lookup", new BsonDocument
            {
                { "from", "posts" },
                { "let", new BsonDocument("uid", "$_id") },
                { "pipeline", new BsonArray
                    {
                        new BsonDocument("$match", new BsonDocument("$expr",
                            new BsonDocument("$eq", new BsonArray { "$userId", "$$uid" }))),
                        new BsonDocument("$count", "value")
                    }
                },
                { "as", "postCount" }
            }),
            new("$project", new BsonDocument
            {
                { "_id", 0 },
                { "userId", new BsonDocument("$toString", "$_id") },
                { "username", 1 },
                { "items", 1 },
                { "total", new BsonDocument("$ifNull", new BsonArray
                    {
                        new BsonDocument("$arrayElemAt", new BsonArray
                        {
                            new BsonDocument("$ifNull", new BsonArray { "$postCount.value", new BsonArray() }),
                            0
                        }),
                        0
                    })
                }
            })
        };

        var result = await db.Users.Aggregate<UserPostsAggregationResult>(pipeline).FirstOrDefaultAsync(ct)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "User not found.");

        return new UserPostsResponse(
            result.UserId,
            result.Username,
            result.Items.Select(p => p.ToResponse()).ToList(),
            normalizedPage,
            normalizedPageSize,
            result.Total,
            Paging.TotalPages(result.Total, normalizedPageSize));
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
