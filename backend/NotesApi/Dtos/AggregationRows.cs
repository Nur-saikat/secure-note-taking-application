using MongoDB.Bson.Serialization.Attributes;
using NotesApi.Domain;

namespace NotesApi.Dtos;

public sealed class UserPostsAggregationResult
{
    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("username")]
    public string Username { get; set; } = string.Empty;

    [BsonElement("items")]
    public List<Post> Items { get; set; } = new();

    [BsonElement("total")]
    public long Total { get; set; }
}

public sealed class InterestsAggregationResult
{
    [BsonElement("items")]
    public List<InterestGroupRow> Items { get; set; } = new();

    [BsonElement("total")]
    public long Total { get; set; }
}

public sealed class InterestGroupRow
{
    [BsonElement("interest")]
    public string Interest { get; set; } = string.Empty;

    [BsonElement("count")]
    public long Count { get; set; }

    [BsonElement("users")]
    public List<InterestUserRow> Users { get; set; } = new();
}

public sealed class InterestUserRow
{
    [BsonElement("id")]
    public string Id { get; set; } = string.Empty;

    [BsonElement("username")]
    public string Username { get; set; } = string.Empty;
}
