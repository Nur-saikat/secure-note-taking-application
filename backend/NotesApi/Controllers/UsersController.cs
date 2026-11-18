using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NotesApi.Common;
using NotesApi.Domain;
using NotesApi.Dtos;
using NotesApi.Services;

namespace NotesApi.Controllers;

[ApiController]
[Route("api/users")]
public sealed class UsersController(UserService users, InterestService interests, PostService posts) : ControllerBase
{
    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<PagedResponse<UserResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken ct = default)
    {
        return Ok(await users.ListAsync(page, pageSize, ct));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserResponse>> Create([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        var created = await users.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpGet("interests")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<InterestGroupsResponse>> Interests(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken ct = default)
    {
        return Ok(await interests.GetGroupedAsync(page, pageSize, ct));
    }

    [HttpGet("{id:length(24)}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserResponse>> GetById(string id, CancellationToken ct)
    {
        return Ok(await users.GetByIdAsync(id, ct));
    }

    [HttpPut("{id:length(24)}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserResponse>> Update(string id, [FromBody] UpdateUserRequest request, CancellationToken ct)
    {
        return Ok(await users.UpdateAsync(User.GetUserId(), id, request, ct));
    }

    [HttpDelete("{id:length(24)}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await users.DeleteAsync(User.GetUserId(), id, ct);
        return NoContent();
    }

    [HttpGet("{id:length(24)}/posts")]
    [AllowAnonymous]
    public async Task<ActionResult<UserPostsResponse>> Posts(
        string id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken ct = default)
    {
        return Ok(await posts.GetUserPostsAsync(id, page, pageSize, ct));
    }
}
