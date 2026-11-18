import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { apiErrorMessage } from '../../core/errors';
import { Note, Paged } from '../../core/models';
import { PaginationComponent } from '../../shared/pagination';

@Component({
  selector: 'app-notes',
  imports: [FormsModule, PaginationComponent, DatePipe],
  templateUrl: './notes.html',
})
export class NotesPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly notes = signal<Note[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editingId = signal<string | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 10;

  draft = { title: '', content: '' };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<Paged<Note>>('/api/notes', { params: { page: this.page(), pageSize: this.pageSize } })
      .subscribe({
        next: (response) => {
          this.notes.set(response.items);
          this.page.set(response.page);
          this.total.set(response.total);
          this.totalPages.set(response.totalPages);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }

  goPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  submit(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }

    const editing = this.editingId() !== null;
    const body = { title: this.draft.title.trim(), content: this.draft.content };
    if (!body.title) {
      this.error.set('Title is required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    const request = editing
      ? this.http.put<Note>(`/api/notes/${this.editingId()}`, body)
      : this.http.post<Note>('/api/notes', body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(editing ? 'Note updated.' : 'Note created.');
        this.editingId.set(null);
        this.draft = { title: '', content: '' };
        if (!editing) {
          this.page.set(1);
        }
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.saving.set(false);
      },
    });
  }

  edit(note: Note): void {
    this.editingId.set(note.id);
    this.draft = { title: note.title, content: note.content };
    this.notice.set('');
    this.error.set('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.draft = { title: '', content: '' };
  }

  remove(note: Note): void {
    if (!window.confirm(`Delete the note "${note.title}"?`)) {
      return;
    }

    this.error.set('');
    this.notice.set('');
    this.http.delete<void>(`/api/notes/${note.id}`).subscribe({
      next: () => {
        this.notice.set('Note deleted.');
        if (this.notes().length === 1 && this.page() > 1) {
          this.page.update((page) => page - 1);
        }
        this.load();
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }
}
