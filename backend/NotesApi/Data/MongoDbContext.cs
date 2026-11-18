using MongoDB.Driver;
using NotesApi.Domain;

namespace NotesApi.Data;

public interface IMongoDbContext
{
    IMongoCollection<User> Users { get; }
    IMongoCollection<Note> Notes { get; }
    IMongoCollection<Post> Posts { get; }
}

public sealed class MongoDbContext : IMongoDbContext
{
    public MongoDbContext(Microsoft.Extensions.Options.IOptions<Configuration.MongoDbOptions> options)
    {
        var settings = MongoClientSettings.FromConnectionString(options.Value.ConnectionString);
        settings.ApplicationName = "secure-notes-api";
        var client = new MongoClient(settings);
        var database = client.GetDatabase(options.Value.DatabaseName);

        Users = database.GetCollection<User>("users");
        Notes = database.GetCollection<Note>("notes");
        Posts = database.GetCollection<Post>("posts");
    }

    public IMongoCollection<User> Users { get; }
    public IMongoCollection<Note> Notes { get; }
    public IMongoCollection<Post> Posts { get; }
}
