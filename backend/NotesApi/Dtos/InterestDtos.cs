namespace NotesApi.Dtos;

public sealed record InterestUser(string Id, string Username);

public sealed record InterestGroup(
    string Interest,
    long Count,
    IReadOnlyList<InterestUser> Users);

public sealed record InterestGroupsResponse(
    IReadOnlyList<InterestGroup> Items,
    int Page,
    int PageSize,
    long Total,
    int TotalPages);
