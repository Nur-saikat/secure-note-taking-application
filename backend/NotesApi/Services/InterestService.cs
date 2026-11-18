using MongoDB.Bson;
using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Data;
using NotesApi.Dtos;

namespace NotesApi.Services;

public sealed class InterestService(IMongoDbContext db)
{
    /// <summary>
    /// Scenario 1: users grouped by interest. Exactly one aggregate() call on one collection;
    /// pagination and total are computed inside the same pipeline via $facet.
    /// </summary>
    public async Task<InterestGroupsResponse> GetGroupedAsync(int page, int pageSize, CancellationToken ct)
    {
        var (normalizedPage, normalizedPageSize, skip) = Paging.Normalize(page, pageSize);

        var pipeline = new BsonDocument[]
        {
            // Users without an interests field contribute no groups; filtering first lets
            // ix_users_interests drive the pipeline instead of a full collection scan.
            new("$match", new BsonDocument("interests", new BsonDocument("$exists", true))),
            new("$unwind", "$interests"),
            new("$group", new BsonDocument
            {
                { "_id", "$interests" },
                { "count", new BsonDocument("$sum", 1) },
                { "users", new BsonDocument("$push", new BsonDocument
                    {
                        { "id", new BsonDocument("$toString", "$_id") },
                        { "username", "$username" }
                    })
                }
            }),
            new("$sort", new BsonDocument { { "count", -1 }, { "_id", 1 } }),
            new("$facet", new BsonDocument
            {
                { "items", new BsonArray
                    {
                        new BsonDocument("$skip", skip),
                        new BsonDocument("$limit", normalizedPageSize),
                        new BsonDocument("$project", new BsonDocument
                        {
                            { "_id", 0 },
                            { "interest", "$_id" },
                            { "count", 1 },
                            { "users", 1 }
                        })
                    }
                },
                { "total", new BsonArray { new BsonDocument("$count", "value") } }
            }),
            new("$project", new BsonDocument
            {
                { "_id", 0 },
                { "items", 1 },
                { "total", new BsonDocument("$ifNull", new BsonArray
                    {
                        new BsonDocument("$arrayElemAt", new BsonArray
                        {
                            new BsonDocument("$ifNull", new BsonArray { "$total.value", new BsonArray() }),
                            0
                        }),
                        0
                    })
                }
            })
        };

        var result = await db.Users.Aggregate<InterestsAggregationResult>(pipeline).FirstOrDefaultAsync(ct);
        if (result is null)
        {
            return new InterestGroupsResponse(Array.Empty<InterestGroup>(), normalizedPage, normalizedPageSize, 0, 0);
        }

        var items = result.Items.Select(g => new InterestGroup(
            g.Interest,
            g.Count,
            g.Users
                .Select(u => new InterestUser(u.Id, u.Username))
                .OrderBy(u => u.Username)
                .ToList())).ToList();

        return new InterestGroupsResponse(
            items,
            normalizedPage,
            normalizedPageSize,
            result.Total,
            Paging.TotalPages(result.Total, normalizedPageSize));
    }
}
