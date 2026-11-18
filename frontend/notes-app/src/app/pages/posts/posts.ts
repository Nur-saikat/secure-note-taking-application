import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/errors';
import { Paged, Post, PostFeedItem } from '../../core/models';
import { PaginationComponent } from '../../shared/pagination';

@Component({
  selector: 'app-posts',
  imports: [FormsModule, RouterLink, PaginationComponent, DatePipe],
  templateUrl: './posts.html',
})
export class PostsPage implements OnInit {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);

  readonly posts = signal<PostFeedItem[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 10;

  draft = { content: '' };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<Paged<PostFeedItem>>('/api/posts', { params: { page: this.page(), pageSize: this.pageSize } })
      .subscribe({
        next: (response) => {
          this.posts.set(response.items);
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
    if (form.invalid || this.creating()) {
      return;
    }

    const content = this.draft.content.trim();
    if (!content) {
      this.error.set('Post content is required.');
      return;
    }

    this.creating.set(true);
    this.error.set('');
    this.notice.set('');

    this.http.post<Post>('/api/posts', { content }).subscribe({
      next: () => {
        this.creating.set(false);
        this.notice.set('Post published.');
        this.draft = { content: '' };
        this.page.set(1);
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.creating.set(false);
      },
    });
  }
}
