import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/errors';
import { InterestGroup, InterestGroupsResponse } from '../../core/models';
import { PaginationComponent } from '../../shared/pagination';

@Component({
  selector: 'app-interests',
  imports: [RouterLink, PaginationComponent],
  templateUrl: './interests.html',
})
export class InterestsPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly groups = signal<InterestGroup[]>([]);
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
      .get<InterestGroupsResponse>('/api/users/interests', {
        params: { page: this.page(), pageSize: this.pageSize },
      })
      .subscribe({
        next: (response) => {
          this.groups.set(response.items);
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
