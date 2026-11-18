import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/errors';
import { Paged, User } from '../../core/models';
import { PaginationComponent } from '../../shared/pagination';

@Component({
  selector: 'app-admin-users',
  imports: [FormsModule, PaginationComponent, DatePipe],
  templateUrl: './admin-users.html',
})
export class AdminUsersPage implements OnInit {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editingId = signal<string | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 10;
  readonly currentUserId = this.auth.user()?.id ?? '';

  draft = {
    username: '',
    email: '',
    role: 'User' as 'User' | 'Admin',
    interests: '',
    password: '',
  };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<Paged<User>>('/api/users', { params: { page: this.page(), pageSize: this.pageSize } })
      .subscribe({
        next: (response) => {
          this.users.set(response.items);
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

  startEdit(user: User): void {
    this.editingId.set(user.id);
    this.draft = {
      username: user.username,
      email: user.email,
      role: user.role,
      interests: user.interests.join(', '),
      password: '',
    };
    this.notice.set('');
    this.error.set('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.draft = { username: '', email: '', role: 'User', interests: '', password: '' };
  }

  save(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }

    const interests = this.parseInterests();
    if (interests === null) {
      return;
    }

    if (this.draft.password && this.draft.password.length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }

    const editing = this.editingId();
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    const base = {
      username: this.draft.username,
      email: this.draft.email,
      role: this.draft.role,
      interests,
    };

    const request = editing
      ? this.http.put<User>(`/api/users/${editing}`, {
          ...base,
          newPassword: this.draft.password || null,
        })
      : this.http.post<User>('/api/users', { ...base, password: this.draft.password });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(editing ? 'User updated.' : 'User created.');
        this.cancelEdit();
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.saving.set(false);
      },
    });
  }

  remove(user: User): void {
    if (user.id === this.currentUserId) {
      return;
    }

    if (!window.confirm(`Delete user "${user.username}" and all their notes and posts?`)) {
      return;
    }

    this.error.set('');
    this.notice.set('');
    this.http.delete<void>(`/api/users/${user.id}`).subscribe({
      next: () => {
        this.notice.set('User deleted.');
        if (this.users().length === 1 && this.page() > 1) {
          this.page.update((page) => page - 1);
        }
        this.load();
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  private parseInterests(): string[] | null {
    const interests = [
      ...new Set(
        this.draft.interests
          .split(',')
          .map((interest) => interest.trim().toLowerCase())
          .filter((interest) => interest.length > 0),
      ),
    ];

    if (interests.length > 20) {
      this.error.set('Please use at most 20 interests.');
      return null;
    }

    if (interests.some((interest) => interest.length > 30)) {
      this.error.set('Each interest must be at most 30 characters.');
      return null;
    }

    return interests;
  }
}
