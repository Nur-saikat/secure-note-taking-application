namespace NotesApi.Common;

public static class Paging
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public static (int Page, int PageSize, int Skip) Normalize(int page, int pageSize)
    {
        if (page < 1)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "page must be greater than or equal to 1.");
        }

        if (pageSize is < 1 or > MaxPageSize)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, $"pageSize must be between 1 and {MaxPageSize}.");
        }

        var skip = (long)(page - 1) * pageSize;
        if (skip > int.MaxValue)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "page is too large.");
        }

        return (page, pageSize, (int)skip);
    }

    public static int TotalPages(long total, int pageSize) => (int)Math.Ceiling(total / (double)pageSize);
}
