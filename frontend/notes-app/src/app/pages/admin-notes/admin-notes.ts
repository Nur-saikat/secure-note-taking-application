import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { apiErrorMessage } from '../../core/errors';
import { AdminNote, Paged } from '../../core/models';
import { PaginationComponent } from '../../shared/pagination';

@Component({
  selector: 'app-admin-notes',
  imports: [PaginationComponent, DatePipe],
  templateUrl: './admin-notes.html',
})
export class AdminNotesPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly notes = signal<AdminNote[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 10;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<Paged<AdminNote>>('/api/admin/notes', {
        params: { page: this.page(), pageSize: this.pageSize },
      })
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
}
