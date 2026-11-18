import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/errors';
import { UserPostsResponse } from '../../core/models';
import { PaginationComponent } from '../../shared/pagination';

@Component({
  selector: 'app-user-posts',
  imports: [RouterLink, PaginationComponent, DatePipe],
  templateUrl: './user-posts.html',
})
export class UserPostsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly userId = this.route.snapshot.paramMap.get('userId') ?? '';
  readonly data = signal<UserPostsResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly currentPage = signal(1);
  readonly pageSize = 10;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<UserPostsResponse>(`/api/users/${this.userId}/posts`, {
        params: { page: this.currentPage(), pageSize: this.pageSize },
      })
      .subscribe({
        next: (response) => {
          this.data.set(response);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }

  goPage(page: number): void {
    this.currentPage.set(page);
    this.load();
  }
}
