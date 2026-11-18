using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NotesApi.Common;
using NotesApi.Domain;
using NotesApi.Dtos;
using NotesApi.Services;

namespace NotesApi.Controllers;

[ApiController]
[Route("api/notes")]
[Authorize]
public sealed class NotesController(NoteService notes) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<NoteResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken ct = default)
    {
        return Ok(await notes.ListMineAsync(User.GetUserId(), page, pageSize, ct));
    }

    [HttpPost]
    public async Task<ActionResult<NoteResponse>> Create([FromBody] NoteRequest request, CancellationToken ct)
    {
        var created = await notes.CreateAsync(User.GetUserId(), request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpGet("{id:length(24)}")]
    public async Task<ActionResult<NoteResponse>> GetById(string id, CancellationToken ct)
    {
        return Ok(await notes.GetAsync(User.GetUserId(), User.IsInRole(Roles.Admin), id, ct));
    }

    [HttpPut("{id:length(24)}")]
    public async Task<ActionResult<NoteResponse>> Update(string id, [FromBody] NoteRequest request, CancellationToken ct)
    {
        return Ok(await notes.UpdateAsync(User.GetUserId(), id, request, ct));
    }

    [HttpDelete("{id:length(24)}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await notes.DeleteAsync(User.GetUserId(), id, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/admin/notes")]
[Authorize(Roles = Roles.Admin)]
public sealed class AdminNotesController(NoteService notes) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<AdminNoteResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken ct = default)
    {
        return Ok(await notes.ListAllAsync(page, pageSize, ct));
    }
}
