using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NotesApi.Common;
using NotesApi.Dtos;
using NotesApi.Services;

namespace NotesApi.Controllers;

[ApiController]
[Route("api/posts")]
public sealed class PostsController(PostService posts) : ControllerBase
{
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResponse<PostFeedItem>>> Feed(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken ct = default)
    {
        return Ok(await posts.GetFeedAsync(page, pageSize, ct));
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<PostResponse>> Create([FromBody] CreatePostRequest request, CancellationToken ct)
    {
        return StatusCode(StatusCodes.Status201Created, await posts.CreateAsync(User.GetUserId(), request, ct));
    }
}
